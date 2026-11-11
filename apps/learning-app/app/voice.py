"""Same-origin voice UI and WebRTC session negotiation for Learning Grove."""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

import asyncio
import urllib.request
import urllib.error
import uuid
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, Response
from .proposals import IdeaBatch, PathDraft, PreferenceDraft
from .recap import RecapDraft

ROOT = Path(__file__).resolve().parent.parent / 'voice-ui'
router = APIRouter()
ASSETS = {'app.js', 'orb.js', 'network.js', 'board.js', 'model.mjs', 'visuals.mjs', 'voices.mjs', 'captions.mjs', 'style.css', 'vendor/katex.min.js'}

@router.get('/voice/')
def voice_page():
    html = (ROOT / 'index.html').read_text()
    for asset in ('style.css', 'vendor/katex.min.js', 'app.js'):
        html = html.replace(f'"/{asset}"', f'"/voice/{asset}"')
    return HTMLResponse(html, headers={'Cache-Control': 'no-store'})

@router.get('/voice/{asset:path}')
def voice_asset(asset: str):
    if asset not in ASSETS:
        raise HTTPException(404)
    return FileResponse(ROOT / asset, headers={'Cache-Control': 'no-store'})

@router.get('/api/voice/status')
def voice_status():
    return {'hasKey': bool(os.environ.get('OPENAI_API_KEY'))}

def tool(name, description, model):
    return {'type': 'function', 'name': name, 'description': description, 'parameters': model.model_json_schema()}

OPENERS = {
    'lesson': 'Begin the selected lesson with one short question.',
    'capture': 'Help the learner capture one idea. Ask one question at a time. If they say they are done, call propose_ideas immediately with one draft. Do not only say that you will save it.',
    'interview': 'Ask one question at a time about the learner’s classes, projects, readings, and subjects they have been meaning to explore. If they say they are done, call propose_ideas immediately and split distinct interests. Do not only say that you will save them.',
    'plan': 'Help the learner plan a finite path. Ask what they want to be able to do, what they already know, how deep to go, and what a reasonable finish line is. If they say they are done, call propose_path immediately. Do not only say that you will make a draft.',
}

async def read_body(request: Request):
    origin = urlsplit(request.headers.get('origin', ''))
    if origin.scheme not in ('http', 'https') or origin.netloc != request.headers.get('host'):
        raise HTTPException(403, 'Origin rejected')
    if len(await request.body()) > 100000:
        raise HTTPException(413, 'Request too large')
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(422, "Invalid JSON")
    if not isinstance(body, dict):
        raise HTTPException(422, "Expected a JSON object")
    return body

def conversation(config, session, body):
    mode = session.get('mode', 'lesson')
    instructions = config['teachingInstructions'] + '\n' + session['prompt']
    preference = tool('remember_preference', 'Save one preference the learner wants followed in every future conversation. Use their words.', PreferenceDraft)
    if mode == 'lesson':
        instructions += '\nThis is a saved Learning Grove lesson. Teach this concept before anything else. Use a visual only when it makes this concept easier to see, and make the diagram about what you are saying. Use a neural diagram only when this concept is about a network: specify its layers, node labels, and only the weights you intend to show. Do not preview later concepts. Do not suggest stopping, wrapping up, or ending for the day. If the learner says they are done, finished, or ready to stop, call propose_recap immediately. Do not only say that you will make a recap. The app shows that draft for approval. Never claim it was saved.'
        tools = config['visualTools'] + [tool('propose_recap', 'Submit lesson notes for review. Include only concepts actually covered. The app attaches the session. Does not save.', RecapDraft), preference]
    elif mode == 'plan':
        instructions += '\nAsk one question at a time. Do not suggest stopping. If the learner says they are done, finished, or ready to stop, call propose_path immediately with an editable draft. Do not only say that you will make a draft. Use the learner’s words for the goal, outcomes, and concepts. Put any scope you suggest only where it is clearly a suggestion. The app shows the draft for approval. Do not say a path was created.'
        tools = [tool('propose_path', 'Propose an editable learning-path draft. Does not create the path.', PathDraft), preference]
    else:
        instructions += '\nAsk one question at a time. Do not suggest stopping. If the learner says they are done, finished, or ready to stop, call propose_ideas immediately' + (' with exactly one draft.' if mode == 'capture' else ' and split distinct interests into separate drafts.') + ' Do not only say that you will save it. Keep the learner’s words in idea, why, direction, and starting_point. Put a transcript excerpt in source. Put anything you inferred in suggestion, not in direction. The app shows the draft for approval. Do not say an idea was saved.'
        tools = [tool('propose_ideas', 'Propose one or more idea drafts for review. Does not save.', IdeaBatch), preference]
    resume = body.get('resume')
    if resume is not None and not isinstance(resume, str):
        raise HTTPException(422, 'Invalid resume context')
    if isinstance(resume, str) and resume.strip():
        instructions += '\nThe connection dropped. Continue in place with this unsaved transcript and draft:\n' + resume.strip()[:8000]
    return instructions, tools, OPENERS[mode]

async def negotiate_body(body, session):
    config = json.loads((ROOT / 'config.json').read_text())
    engine = body.get('engine', os.environ.get('VOICE_ENGINE', 'live'))
    if engine not in ('live', 'realtime', 'realtime-2.1'):
        raise HTTPException(422, 'Unknown voice model')
    voice_name = body.get('voice', config['defaultVoice'])
    if voice_name not in config['liveVoices' if engine == 'live' else 'realtimeVoices']:
        raise HTTPException(422, 'Choose a supported voice')
    key = os.environ.get('OPENAI_API_KEY')
    if not isinstance(key, str) or not key.strip():
        raise HTTPException(422, 'Voice is not configured on the server')
    sdp = body.get('sdp')
    if not isinstance(sdp, str) or not sdp.startswith('v=0'):
        raise HTTPException(422, 'Invalid SDP offer')
    instructions, tools, opener = conversation(config, session, body)
    headers = {'Authorization': f'Bearer {key.strip()}'}
    if engine == 'live':
        response = await asyncio.to_thread(post_json, 'https://api.openai.com/v1/live/sessions', headers, {
            'session': {'model': 'gpt-live-1', 'instructions': instructions,
                'input': [{'type': 'message', 'role': 'developer', 'content': [{'type': 'input_text', 'text': opener}]}],
                'audio': {'output': {'voice': voice_name}},
                'delegation': {'type': 'responses', 'responses': {'model': os.environ.get('LIVE_BACKEND_MODEL', 'gpt-6-luna'), 'instructions': instructions, 'tools': [dict(item, strict=False) for item in tools], 'tool_choice': 'auto', 'parallel_tool_calls': False}}},
            'transport': {'type': 'webrtc', 'sdp': sdp}})
        media = 'application/json'
    else:
        options = {'type': 'realtime', 'model': 'gpt-realtime-2.1' if engine == 'realtime-2.1' else os.environ.get('REALTIME_MODEL', 'gpt-realtime'),
            'instructions': instructions, 'output_modalities': ['audio'], 'audio': {'input': {'noise_reduction': {'type': 'near_field'}, 'transcription': {'model': 'gpt-live-transcribe'}, 'turn_detection': {'type': 'semantic_vad', 'eagerness': 'medium', 'create_response': True, 'interrupt_response': True}}, 'output': {'voice': voice_name}}, 'tools': tools, 'tool_choice': 'auto', 'max_output_tokens': 600}
        response = await asyncio.to_thread(post_multipart, 'https://api.openai.com/v1/realtime/calls', headers, {'sdp': sdp, 'session': json.dumps(options)})
        media = 'application/sdp'
    return Response(response, media_type=media, headers={'x-grove-engine': engine})

async def negotiate(request: Request, session: dict):
    return await negotiate_body(await read_body(request), session)

def post_bytes(url, headers, payload):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=payload, headers=headers), timeout=30) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        try:
            detail = json.loads(error.read()).get('error', {}).get('message', 'Voice connection failed')
        except (ValueError, AttributeError):
            detail = 'Voice connection failed'
        raise HTTPException(error.code, detail)
    except (urllib.error.URLError, TimeoutError):
        raise HTTPException(502, 'Could not reach the voice service. Check the server connection and retry.')

def post_json(url, headers, payload):
    return post_bytes(url, {**headers, 'Content-Type': 'application/json'}, json.dumps(payload).encode())

def post_multipart(url, headers, fields):
    boundary = uuid.uuid4().hex
    payload = ''.join(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n' for name, value in fields.items()) + f'--{boundary}--\r\n'
    return post_bytes(url, {**headers, 'Content-Type': f'multipart/form-data; boundary={boundary}'}, payload.encode())
