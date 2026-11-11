import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import Field
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
    data.setdefault('ideas', [])
    data.setdefault('drafts', [])
    data.setdefault('preferences', [])
    return data
def save(conn, data): conn.execute('UPDATE workspace SET data=? WHERE id=1', (json.dumps(data),))
def tree(data, id):
    found = next((t for t in data['trees'] if t['id'] == id), None)
    if not found: raise HTTPException(404, 'Learning path not found')
    return found

class Idea(IdeaDraft):
    text: str | None = Field(default=None, max_length=4000)

class TreeInput(PathDraft):
    title: str = Field(min_length=1,max_length=150)
    category: str = Field(min_length=1,max_length=150)
    goal: str = Field(min_length=1,max_length=2000)
    depth: str = Field(min_length=1,max_length=150)
    outcomes: list[str] = Field(min_length=1,max_length=20)
    concepts: list[str] = Field(min_length=1,max_length=30)

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

@app.post('/api/trees')
def create_tree(body: TreeInput):
    if any(not s.strip() for s in body.concepts + body.outcomes): raise HTTPException(422,'Outcomes and concepts cannot be blank')
    t=body.model_dump(); t.update(id=uuid.uuid4().hex,status='planned')
    from .seed import concept
    ids=[uuid.uuid4().hex for _ in body.concepts]
    t['concepts']=[concept(ids[i],title.strip(),70+i*240,150+(i%2)*120,[ids[i-1]] if i else []) for i,title in enumerate(body.concepts)]
    with db() as conn:
        data=load(conn)
        if body.idea_id and not any(item['id']==body.idea_id for item in data['ideas']):
            raise HTTPException(422, 'Idea not found')
        data['drafts']=[item for item in data['drafts'] if item.get('idea_id')!=body.idea_id or not body.idea_id]
        data['trees'].append(t); save(conn,data)
    return t

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
def update_status(id: str, body: Status):
    with db() as conn:
        data=load(conn); tree(data,id)['status']=body.status; save(conn,data)
    return {'ok':True}

@app.post('/api/trees/{id}/sessions')
def start_session(id: str, body: dict):
    with db() as conn:
        data=load(conn); t=tree(data,id)
        c=next((c for c in t['concepts'] if c['id']==body.get('concept_id')),None)
        if not c: raise HTTPException(422,'Unknown concept')
        s=dict(id=uuid.uuid4().hex,tree_id=id,concept_id=c['id'],created_at=datetime.now(timezone.utc).isoformat(),status='pending')
        example=dict(schema_version='0.1', session_id=s['id'],tree_id=id,topics=[dict(concept_id=c['id'],summary='Replace with session notes',evidence='Describe what the learner demonstrated, or state insufficient evidence',confidence='Learner reported confidence, or not assessed',state='introduced')],questions=[])
        recent=[]
        for earlier in data['sessions']:
            if earlier.get('tree_id')!=id or earlier.get('status')!='accepted': continue
            for topic in (earlier.get('recap') or {}).get('topics', []):
                recent.append({'concept_id':topic.get('concept_id'),'state':topic.get('state'),'summary':(topic.get('summary') or '')[:400]})
            if len(recent)>=6: break
        s['prompt']=f"Teach me {c['title']} through a dialogue I can end when I am ready. Stay on this concept. Do not preview later concepts. Do not suggest stopping, wrapping up, or ending for the day. Path goal: {t['goal']}. Target depth: {t['depth']}. Exclude: {t['excludes']}. Ask one question at a time, include active recall, and check prerequisite gaps without forcing a full prerequisite course. Treat confidence separately from demonstrated understanding. Ask before proposing a change in direction. Current concept context: {json.dumps(c)}. Prerequisite context: {json.dumps([x for x in t['concepts'] if x['id'] in c['requires']])}. Recent accepted notes on this path, newest first: {json.dumps(recent[:6])}. Use them to start where the explanation actually is. Skip what I already explained, and repair a thin explanation before adding more. If I say I am done, finished, or ready to stop, call propose_recap immediately with honest notes. Do not only say that you will make a recap. Do not read JSON aloud and do not say it has been saved. Valid states are introduced, developing, understood, needs-review. Use understood only with demonstrated evidence. Only use concept IDs from this path: {json.dumps([x['id'] for x in t['concepts']])}. Field guide: {json.dumps(example)}"
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
            c.update(state=item.state,confidence=item.confidence,evidence=item.evidence,notes=item.summary)
        s.update(status='accepted',recap=body.model_dump()); save(conn,data)
    return {'ok':True}

from .voice import negotiate, negotiate_body, read_body, router as voice_router
from fastapi import Request

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
    if mode not in ('lesson', 'capture', 'interview', 'plan'):
        raise HTTPException(422, 'Unknown voice conversation')
    if mode == 'lesson':
        if not isinstance(body.get('session_id'), str):
            raise HTTPException(422, 'Session not found')
        return pending_session(body['session_id'])
    if mode == 'capture':
        return annotate({'mode': 'capture', 'prompt': 'The learner is capturing one short idea. Ask for it if they have not said it yet. Propose exactly one draft.'})
    if mode == 'interview':
        return annotate({'mode': 'interview', 'prompt': 'This is the learner’s initial idea interview. Ask one question at a time about classes, projects, readings, and subjects they have been meaning to explore. Follow up when it clarifies an interest or where they might take it. Propose a separate draft for each distinct idea.'})
    with db() as conn:
        data = load(conn)
        idea = next((item for item in data['ideas'] if item['id'] == body.get('idea_id')), None) if body.get('idea_id') else None
        if body.get('idea_id') and not idea:
            raise HTTPException(422, 'Idea not found')
    prompt = 'Plan a new learning path with the learner.'
    if idea:
        prompt += ' Start from this saved idea:\n' + json.dumps({key: idea.get(key, '') for key in ('id', 'title', 'text', 'idea', 'why', 'direction', 'starting_point', 'source')})
        prompt += '\nSet idea_id to ' + idea['id'] + '.'
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
