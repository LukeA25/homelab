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
from .proposals import CloseSession, KnowledgeQuery, PathCreate, PreferenceDraft, TreePatch

ROOT = Path(__file__).resolve().parent.parent / 'voice-ui'
router = APIRouter()
ASSETS = {'app.js', 'orb.js', 'network.js', 'board.js', 'model.mjs', 'visuals.mjs', 'voices.mjs', 'captions.mjs', 'style.css', 'vendor/katex.min.js'}

@router.get('/voice/')
def voice_page():
    return HTMLResponse((ROOT / 'index.html').read_text(), headers={'Cache-Control': 'no-store'})

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
    'plan': 'Help the learner plan a finite path. Ask what they want to be able to do, what they already know, how deep to go, and what a reasonable finish line is. When they are done, call create_path. Reuse a knowledge_id when they already understand a topic.',
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
    if mode not in OPENERS:
        raise HTTPException(422, 'Unknown voice conversation')
    instructions = config['teachingInstructions'] + '\n' + session['prompt']
    preference = tool('remember_preference', 'Save one preference the learner wants followed in every future conversation. Use their words.', PreferenceDraft)
    lookup = tool('search_knowledge', 'Look up what the learner already understands. Use a knowledge id from the result when a topic is the same idea.', KnowledgeQuery)
    if mode == 'lesson':
        instructions += '\nThis is a saved Learning Grove lesson. Teach this concept before anything else. Use a visual only when it makes this concept easier to see, and make the diagram about what you are saying. Use a neural diagram only when this concept is about a network: specify its layers, node labels, and only the weights you intend to show. Do not preview later concepts. Do not suggest stopping, wrapping up, or ending for the day. If the learner says they are done, finished, or ready to stop, call close_session immediately. It saves the notes and ends the conversation. Do not ask the learner to press save. Use update_path to change this path only. New nodes need objectives. Prefer an existing knowledge_id when the topic is already known.'
        tools = config['visualTools'] + [
            tool('close_session', 'Save lesson notes and an optional update to the current path, then end the conversation. Include only concepts actually covered.', CloseSession),
            tool('update_path', 'Change the current path: its goal, outcomes, exclusions, or nodes. New nodes need objectives. Does not edit any other path.', TreePatch),
            lookup,
            preference,
        ]
    else:
        instructions += '\nAsk one question at a time. Do not suggest stopping. If the learner says they are done, finished, or ready to stop, call create_path immediately. That creates the path. Use the learner’s words for the goal, outcomes, and concept titles. Every concept needs at least one objective and teaching notes that say how to teach it. requires may be titles of other concepts in this path or zero-based index strings. Reuse knowledge_id when search results or the known-understanding list match the topic. Do not ask the learner to save the path.'
        tools = [tool('create_path', 'Create the learning path now. Reuse knowledge_id for topics the learner already understands.', PathCreate), lookup, preference]
    resume = body.get('resume')
    if resume is not None and not isinstance(resume, str):
        raise HTTPException(422, 'Invalid resume context')
    if isinstance(resume, str) and resume.strip():
        instructions += '\nThe connection dropped. Continue in place with this unsaved transcript:\n' + resume.strip()[:8000]
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
