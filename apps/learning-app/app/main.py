import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import Field, ValidationError
from .knowledge import apply_path_patch, apply_topics, build_tree, ensure_knowledge, lesson_prompt, search_records
from .proposals import CloseSession, IdeaBatch, IdeaDraft, PathCreate, PreferenceDraft, TreePatch
from .recap import Recap
from .seed import seed

app = FastAPI(title='Learning app')
DB = os.environ.get('LEARNING_DB', './data/learning.db')

@contextmanager
def db():
    Path(DB).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB, timeout=15)
    try:
        conn.execute('CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY, data TEXT NOT NULL)')
        conn.execute('INSERT OR IGNORE INTO workspace VALUES (1, ?)', (json.dumps(seed()),))
        conn.commit()
        conn.execute('BEGIN IMMEDIATE')
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def load(conn):
    data = json.loads(conn.execute('SELECT data FROM workspace WHERE id=1').fetchone()[0])
    if ensure_knowledge(data):
        save(conn, data)
    return data
def save(conn, data): conn.execute('UPDATE workspace SET data=? WHERE id=1', (json.dumps(data),))
def tree(data, id):
    found = next((t for t in data['trees'] if t['id'] == id), None)
    if not found: raise HTTPException(404, 'Learning path not found')
    return found

class Idea(IdeaDraft):
    text: str | None = Field(default=None, max_length=4000)

def coerce_tree(payload):
    if not isinstance(payload, dict):
        raise HTTPException(422, 'Expected a JSON object')
    body = dict(payload)
    body.pop('idea_id', None)
    concepts = body.get('concepts')
    if isinstance(concepts, list) and concepts and all(isinstance(item, str) for item in concepts):
        body['concepts'] = [
            {'title': item, 'objectives': [f'Explain {item.strip()}'], 'requires': [str(index - 1)] if index else [], 'teaching_notes': ''}
            for index, item in enumerate(concepts) if item.strip()
        ]
        if len(body['concepts']) != len(concepts):
            raise HTTPException(422, 'Outcomes and concepts cannot be blank')
    try:
        return PathCreate.model_validate(body)
    except ValidationError as error:
        raise HTTPException(422, error.errors()[0]['msg'] if error.errors() else 'Invalid path') from None

@app.get('/api/health')
def health():
    return {'status':'ok'}

@app.get('/api/workspace')
def workspace():
    with db() as conn: return load(conn)

def idea_record(body: Idea):
    title, idea, why = body.title.strip(), body.idea.strip(), body.why.strip()
    direction, starting, source = body.direction.strip(), body.starting_point.strip(), body.source.strip()
    suggestion, text = body.suggestion.strip(), (body.text or '').strip()
    structured = any([title, idea, why, direction, starting, suggestion])
    if text and not structured:
        return dict(id=uuid.uuid4().hex, text=text, created_at=datetime.now(timezone.utc).isoformat())
    if not (title or idea or text):
        raise HTTPException(422, 'An idea needs a title or a description')
    kept = source or text
    return dict(id=uuid.uuid4().hex, created_at=datetime.now(timezone.utc).isoformat(), title=title, idea=idea or text, why=why, direction=direction, starting_point=starting, source=kept, suggestion=suggestion, text=kept or idea or title)

@app.post('/api/ideas')
def add_idea(body: Idea):
    record = idea_record(body)
    with db() as conn:
        data=load(conn)
        data['ideas'].insert(0, record)
        save(conn,data)
    return {'ok':True}

@app.post('/api/ideas/preview')
def preview_ideas(body: IdeaBatch):
    return {'ideas': [idea_record(Idea(**item.model_dump())) | {'id': None} for item in body.ideas]}

@app.post('/api/ideas/batch')
def add_ideas(body: IdeaBatch):
    records = [idea_record(Idea(**item.model_dump())) for item in body.ideas]
    with db() as conn:
        data=load(conn)
        data['ideas'] = records + data['ideas']
        save(conn, data)
    return {'ideas': records}

@app.post('/api/preferences')
def add_preference(body: PreferenceDraft):
    text=body.text.strip()
    if not text: raise HTTPException(422, 'A preference needs text')
    with db() as conn:
        data=load(conn)
        existing=next((item for item in data['preferences'] if item['text']==text), None)
        if existing: return existing
        if len(data['preferences'])>=40: raise HTTPException(422, 'Remove a preference before adding another')
        record=dict(id=uuid.uuid4().hex, text=text, created_at=datetime.now(timezone.utc).isoformat())
        data['preferences'].insert(0, record)
        save(conn, data)
    return record

@app.delete('/api/preferences/{id}')
def delete_preference(id: str):
    with db() as conn:
        data=load(conn)
        data['preferences']=[item for item in data['preferences'] if item['id']!=id]
        save(conn, data)
    return {'ok':True}

@app.delete('/api/ideas/{id}')
def delete_idea(id: str):
    with db() as conn:
        data=load(conn); data['ideas']=[i for i in data['ideas'] if i['id']!=id]; save(conn,data)
    return {'ok':True}

@app.post('/api/trees')
async def create_tree(request: Request):
    try:
        payload = await request.json()
    except ValueError:
        raise HTTPException(422, 'Invalid JSON')
    parsed = coerce_tree(payload)
    with db() as conn:
        data = load(conn)
        created = build_tree(data, parsed)
        data['trees'].append(created)
        save(conn, data)
    return created

@app.get('/api/knowledge')
def list_knowledge(q: str = '', subject: str = ''):
    with db() as conn:
        data = load(conn)
    return {'knowledge': search_records(data['knowledge'], q, subject)}

@app.patch('/api/trees/{id}')
def update_tree(id: str, body: TreePatch):
    patch = body.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(422, 'Nothing to update')
    with db() as conn:
        data = load(conn)
        target = tree(data, id)
        apply_path_patch(data, target, patch)
        save(conn, data)
    return target

@app.post('/api/trees/{id}/sessions')
def start_session(id: str, body: dict):
    with db() as conn:
        data=load(conn); t=tree(data,id)
        c=next((c for c in t['concepts'] if c['id']==body.get('concept_id')),None)
        if not c: raise HTTPException(422,'Unknown concept')
        s=dict(id=uuid.uuid4().hex,tree_id=id,concept_id=c['id'],created_at=datetime.now(timezone.utc).isoformat(),status='pending')
        s['prompt']=lesson_prompt(data, t, c, s['id'])
        data['sessions'].insert(0,s); save(conn,data)
    return s

def validate_recap(data, body):
    t=tree(data,body.tree_id)
    s=next((s for s in data['sessions'] if s['id']==body.session_id and s['tree_id']==body.tree_id),None)
    if not s: raise HTTPException(422,'Session ID does not match an exported session for this path')
    if s['status']=='accepted': raise HTTPException(409,'This session has already been imported')
    ids=[x.concept_id for x in body.topics]
    if len(set(ids))!=len(ids) or any(id not in [c['id'] for c in t['concepts']] for id in ids): raise HTTPException(422,'Unknown or repeated concept ID')
    if any(x.state=='understood' and not x.evidence.strip() for x in body.topics): raise HTTPException(422,'Understanding needs evidence')
    return t,s

@app.post('/api/import/preview')
def preview(body: Recap):
    with db() as conn: validate_recap(load(conn),body)
    return body

@app.post('/api/import/accept')
def accept(body: Recap):
    with db() as conn:
        data=load(conn); t,s=validate_recap(data,body)
        apply_topics(data, t, [item.model_dump() for item in body.topics])
        s.update(status='accepted',recap=body.model_dump()); save(conn,data)
    return {'ok':True}

@app.post('/api/sessions/{session_id}/close')
def close_session(session_id: str, body: CloseSession):
    with db() as conn:
        data = load(conn)
        session = next((item for item in data['sessions'] if item['id'] == session_id), None)
        if not session:
            raise HTTPException(404, 'Session not found')
        if session['status'] == 'accepted':
            raise HTTPException(409, 'This session has already been imported')
        target = tree(data, session['tree_id'])
        if body.path:
            apply_path_patch(data, target, body.path.model_dump(exclude_none=True))
        topics = apply_topics(data, target, [item.model_dump() for item in body.topics])
        recap = dict(schema_version='0.1', session_id=session_id, tree_id=target['id'], topics=topics, questions=body.questions)
        session.update(status='accepted', recap=recap)
        save(conn, data)
    return {'ok': True, 'tree': target, 'recap': recap}

from .voice import negotiate, negotiate_body, read_body, router as voice_router

app.include_router(voice_router)

def with_preferences(data, session):
    lines=[item['text'] for item in data.get('preferences', []) if item.get('text')]
    if not lines: return session
    note='\nPreferences the learner asked you to follow in every conversation:\n'+'\n'.join(f'- {line}' for line in lines)
    return dict(session, prompt=session.get('prompt', '')+note)

def annotate(session):
    with db() as conn:
        return with_preferences(load(conn), session)

def pending_session(session_id):
    with db() as conn:
        data = load(conn)
        session = next((s for s in data['sessions'] if s['id'] == session_id), None)
        if not session:
            raise HTTPException(404, 'Session not found')
        if session['status'] != 'pending':
            raise HTTPException(409, 'This session has already been imported')
        return with_preferences(data, dict(session, mode='lesson'))

def voice_context(body):
    mode = body.get('mode') or ('lesson' if body.get('session_id') else None)
    if mode not in ('lesson', 'plan'):
        raise HTTPException(422, 'Unknown voice conversation')
    if mode == 'lesson':
        if not isinstance(body.get('session_id'), str):
            raise HTTPException(422, 'Session not found')
        return pending_session(body['session_id'])
    with db() as conn:
        data = load(conn)
    prompt = 'Plan a new learning path with the learner. Known understanding you can reuse:\n' + json.dumps(search_records(data['knowledge'])[:16])
    seed = body.get('seed')
    if isinstance(seed, str) and seed.strip():
        prompt += '\nThe learner started from this suggestion:\n' + seed.strip()[:1000]
    return annotate({'mode': 'plan', 'prompt': prompt})

@app.post('/api/voice/sessions/{session_id}')
async def voice_session(session_id: str, request: Request):
    return await negotiate(request, pending_session(session_id))

@app.post('/api/voice/start')
async def voice_start(request: Request):
    body = await read_body(request)
    return await negotiate_body(body, voice_context(body))

static=Path(__file__).resolve().parent.parent/'frontend_dist'
if static.exists(): app.mount('/',StaticFiles(directory=static,html=True),name='frontend')
