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

ROOT = Path(__file__).resolve().parent.parent / 'voice-ui'
router = APIRouter()
ASSETS = {'app.js', 'orb.js', 'network.js', 'board.js', 'model.mjs', 'visuals.mjs', 'voices.mjs', 'style.css', 'vendor/katex.min.js'}

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

async def negotiate(request: Request, session: dict):
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
    config = json.loads((ROOT / 'config.json').read_text())
    engine = body.get('engine', 'live')
    if engine not in ('live', 'realtime', 'realtime-2.1'):
        raise HTTPException(422, 'Unknown voice model')
    voice = body.get('voice', config['defaultVoice'])
    if voice not in config['liveVoices' if engine == 'live' else 'realtimeVoices']:
        raise HTTPException(422, 'Choose a supported voice')
    key = os.environ.get('OPENAI_API_KEY') or body.get('key')
    if not isinstance(key, str) or not key.strip():
        raise HTTPException(422, 'Enter an OpenAI API key in Settings to start voice')
    sdp = body.get('sdp')
    if not isinstance(sdp, str) or not sdp.startswith('v=0'):
        raise HTTPException(422, 'Invalid SDP offer')
    instructions = config['teachingInstructions'] + '\n' + session['prompt'] + '\nThis is a saved Learning Grove lesson. Teach this concept immediately. Use propose_recap at the end to send the structured recap for learner review. Saving requires the learner to click Accept and save. Never claim a recap was saved. The lesson lasts up to 15 minutes.'
    from .recap import Recap
    tools = config['visualTools'] + [{'type': 'function', 'name': 'propose_recap', 'description': 'Propose honest lesson notes and evidence for review. Does not save.', 'parameters': Recap.model_json_schema()}]
    headers = {'Authorization': f'Bearer {key.strip()}'}
    if engine == 'live':
        response = await asyncio.to_thread(post_json, 'https://api.openai.com/v1/live/sessions', headers, {
            'session': {'model': 'gpt-live-1', 'instructions': instructions,
                'input': [{'type': 'message', 'role': 'developer', 'content': [{'type': 'input_text', 'text': 'Begin the selected lesson with one short question.'}]}],
                'audio': {'output': {'voice': voice}},
                'delegation': {'type': 'responses', 'responses': {'model': os.environ.get('LIVE_BACKEND_MODEL', 'gpt-6-luna'), 'instructions': instructions, 'tools': [dict(tool, strict=False) for tool in tools], 'tool_choice': 'auto', 'parallel_tool_calls': False}}},
            'transport': {'type': 'webrtc', 'sdp': sdp}})
    else:
        options = {'type': 'realtime', 'model': 'gpt-realtime-2.1' if engine == 'realtime-2.1' else os.environ.get('REALTIME_MODEL', 'gpt-realtime'),
            'instructions': instructions, 'output_modalities': ['audio'], 'audio': {'input': {'noise_reduction': {'type': 'near_field'}, 'turn_detection': {'type': 'semantic_vad', 'eagerness': 'medium', 'create_response': True, 'interrupt_response': True}}, 'output': {'voice': voice}}, 'tools': tools, 'tool_choice': 'auto', 'max_output_tokens': 600}
        response = await asyncio.to_thread(post_multipart, 'https://api.openai.com/v1/realtime/calls', headers, {'sdp': sdp, 'session': json.dumps(options)})
    return Response(response, media_type='application/json' if engine == 'live' else 'application/sdp')

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
