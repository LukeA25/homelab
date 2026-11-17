import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import Field, ValidationError
from .knowledge import CloseSession, PathPatch, RichConcept, apply_close, apply_path_patch, build_tree, find_knowledge, knowledge_digest, lesson_prompt, prepare, project, search_knowledge, write_knowledge
from .proposals import IdeaBatch, IdeaDraft, PathDraft, PreferenceDraft
from .recap import Recap, Strict
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
    snapshot = json.dumps(data, sort_keys=True)
    prepare(data)
    if json.dumps(data, sort_keys=True) != snapshot:
        save(conn, data)
    return data
def save(conn, data): conn.execute('UPDATE workspace SET data=? WHERE id=1', (json.dumps(data),))
def tree(data, id):
    found = next((t for t in data['trees'] if t['id'] == id), None)
    if not found: raise HTTPException(404, 'Learning path not found')
    return found

class Idea(IdeaDraft):
    text: str | None = Field(default=None, max_length=4000)

class TreeInput(Strict):
    title: str = Field(min_length=1, max_length=150)
    category: str = Field(min_length=1, max_length=150)
    goal: str = Field(min_length=1, max_length=2000)
    depth: str = Field(min_length=1, max_length=150)
    excludes: str = Field(default='', max_length=2000)
    outcomes: list[str] = Field(min_length=1, max_length=20)
    concepts: list[RichConcept | str] = Field(min_length=1, max_length=30)
    idea_id: str | None = None

class Status(Strict):
    status: Literal['active','paused','planned','completed']

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

def concept_specs(concepts):
    if concepts and all(isinstance(item, str) for item in concepts):
        specs = []
        for index, title in enumerate(concepts):
            if not title.strip():
                raise HTTPException(422, 'Outcomes and concepts cannot be blank')
            specs.append(dict(title=title.strip(), objectives=[], teaching_notes='', summary='', requires=[str(index - 1)] if index else [], knowledge_id='', rich=False))
        return specs
    specs = []
    for item in concepts:
        if isinstance(item, str):
            raise HTTPException(422, 'Concepts must be titles or objects, not both')
        model = item if isinstance(item, RichConcept) else RichConcept.model_validate(item)
        dumped = model.model_dump()
        dumped['rich'] = True
        specs.append(dumped)
    return specs

@app.post('/api/trees')
def create_tree(body: TreeInput):
    if any(not item.strip() for item in body.outcomes):
        raise HTTPException(422, 'Outcomes and concepts cannot be blank')
    specs = concept_specs(body.concepts)
    with db() as conn:
        data=load(conn)
        if body.idea_id and not any(item['id']==body.idea_id for item in data['ideas']):
            raise HTTPException(422, 'Idea not found')
        created = build_tree(data, body.title, body.category, body.goal, body.depth, body.excludes, body.outcomes, specs, body.idea_id)
        data['drafts']=[item for item in data['drafts'] if item.get('idea_id')!=body.idea_id or not body.idea_id]
        data['trees'].append(created)
        project(data)
        save(conn,data)
    return created

def store_draft(body: PathDraft):
    draft=body.model_dump(); draft.update(id=uuid.uuid4().hex, created_at=datetime.now(timezone.utc).isoformat())
    with db() as conn:
        data=load(conn)
        if body.idea_id and not any(item['id']==body.idea_id for item in data['ideas']):
            raise HTTPException(422, 'Idea not found')
        key=body.idea_id or ''
        data['drafts']=[item for item in data['drafts'] if (item.get('idea_id') or '')!=key]
        data['drafts'].insert(0, draft)
        save(conn, data)
    return draft

@app.post('/api/drafts/preview')
def preview_draft(body: PathDraft):
    return body

@app.post('/api/drafts')
def save_draft(body: PathDraft):
    return store_draft(body)

@app.patch('/api/trees/{id}')
async def update_tree(id: str, request: Request):
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(422, 'Invalid JSON')
    if not isinstance(body, dict) or not body:
        raise HTTPException(422, 'Expected a JSON object')
    with db() as conn:
        data = load(conn)
        target = tree(data, id)
        if set(body) == {'status'}:
            try:
                target['status'] = Status.model_validate(body).status
            except ValidationError:
                raise HTTPException(422, 'Invalid status')
        else:
            try:
                patch = PathPatch.model_validate(body)
            except ValidationError:
                raise HTTPException(422, 'Invalid path edit')
            apply_path_patch(data, target, patch)
        project(data)
        save(conn, data)
        return target

@app.post('/api/trees/{id}/sessions')
def start_session(id: str, body: dict):
    with db() as conn:
        data=load(conn); t=tree(data,id)
        c=next((c for c in t['concepts'] if c['id']==body.get('concept_id')),None)
        if not c: raise HTTPException(422,'Unknown concept')
        s=dict(id=uuid.uuid4().hex,tree_id=id,concept_id=c['id'],created_at=datetime.now(timezone.utc).isoformat(),status='pending')
        recent=[]
        for earlier in data['sessions']:
            if earlier.get('tree_id')!=id or earlier.get('status')!='accepted': continue
            for topic in (earlier.get('recap') or {}).get('topics', []):
                recent.append({'concept_id':topic.get('concept_id'),'state':topic.get('state'),'summary':(topic.get('summary') or '')[:400]})
            if len(recent)>=6: break
        s['prompt'] = lesson_prompt(data, t, c, s['id']) + f" Recent accepted notes on this path, newest first: {json.dumps(recent[:6])}. Use them to start where the explanation actually is. Skip what I already explained, and repair a thin explanation before adding more. Do not read JSON aloud."
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
        for item in body.topics:
            c=next(c for c in t['concepts'] if c['id']==item.concept_id)
            write_knowledge(find_knowledge(data, c.get('knowledge_id') or ''), item.summary, item.evidence, item.confidence, item.state)
        project(data)
        s.update(status='accepted',recap=body.model_dump()); save(conn,data)
    return {'ok':True}

def pending(data, session_id):
    session = next((item for item in data['sessions'] if item['id'] == session_id), None)
    if not session:
        raise HTTPException(404, 'Session not found')
    if session['status'] != 'pending':
        raise HTTPException(409, 'This session has already been imported')
    return session

@app.get('/api/knowledge')
def list_knowledge(q: str = '', subject: str = ''):
    with db() as conn:
        return {'matches': search_knowledge(load(conn), q, subject)}

@app.post('/api/sessions/{session_id}/path')
def update_session_path(session_id: str, body: PathPatch):
    with db() as conn:
        data = load(conn)
        session = pending(data, session_id)
        target = tree(data, session['tree_id'])
        apply_path_patch(data, target, body)
        project(data)
        save(conn, data)
        return target

@app.post('/api/sessions/{session_id}/close')
def close_saved_session(session_id: str, body: CloseSession):
    with db() as conn:
        data = load(conn)
        session = pending(data, session_id)
        target = apply_close(data, session, body)
        save(conn, data)
        return {'ok': True, 'tree': target}

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
    prompt = (
        'Plan a new learning path with the learner. Ask what they want to be able to do, what they already know, how deep to go, and where a reasonable finish line is. '
        'Ask one question at a time. When they are done, call create_path. That saves the path immediately. Do not ask them to edit it afterward, and do not say a path was saved until create_path succeeds. '
        'Every concept needs objectives and teaching notes. requires may be titles or indexes so the graph can branch. Reuse a knowledge_id when the learner already has that idea.\n'
        'Existing knowledge:\n' + (knowledge_digest(data) or 'None yet.')
    )
    focus = body.get('focus')
    if isinstance(focus, str) and focus.strip():
        prompt += '\nThe learner started from this suggestion:\n' + focus.strip()[:500]
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
