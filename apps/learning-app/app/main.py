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
from pydantic import BaseModel, Field, ConfigDict
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

def load(conn): return json.loads(conn.execute('SELECT data FROM workspace WHERE id=1').fetchone()[0])
def save(conn, data): conn.execute('UPDATE workspace SET data=? WHERE id=1', (json.dumps(data),))
def tree(data, id):
    found = next((t for t in data['trees'] if t['id'] == id), None)
    if not found: raise HTTPException(404, 'Learning path not found')
    return found

class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

class Idea(Strict):
    text: str = Field(min_length=1, max_length=4000)

class TreeInput(Strict):
    title: str = Field(min_length=1,max_length=150)
    category: str = Field(min_length=1,max_length=150)
    goal: str = Field(min_length=1,max_length=2000)
    depth: str = Field(min_length=1,max_length=150)
    excludes: str = Field(max_length=2000)
    outcomes: list[str] = Field(min_length=1,max_length=20)
    concepts: list[str] = Field(min_length=1,max_length=30)

class Status(Strict):
    status: Literal['active','paused','planned','completed']

class Topic(Strict):
    concept_id: str
    summary: str = Field(max_length=8000)
    evidence: str = Field(max_length=8000)
    confidence: str = Field(max_length=100)
    state: Literal['introduced','developing','understood','needs-review']

class Recap(Strict):
    schema_version: Literal['0.1']
    session_id: str
    tree_id: str
    topics: list[Topic] = Field(min_length=1,max_length=30)
    questions: list[str] = Field(default_factory=list,max_length=30)

@app.get('/api/health')
def health():
    return {'status':'ok'}

@app.get('/api/workspace')
def workspace():
    with db() as conn: return load(conn)

@app.post('/api/ideas')
def add_idea(body: Idea):
    with db() as conn:
        data=load(conn)
        data['ideas'].insert(0,dict(id=uuid.uuid4().hex,text=body.text,created_at=datetime.now(timezone.utc).isoformat()))
        save(conn,data)
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
        data=load(conn); data['trees'].append(t); save(conn,data)
    return t

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
        s['prompt']=f"Teach me {c['title']} through a 10–15 minute dialogue. Path goal: {t['goal']}. Target depth: {t['depth']}. Exclude: {t['excludes']}. Ask one question at a time, include active recall, and check prerequisite gaps without forcing a full prerequisite course. Treat confidence separately from demonstrated understanding. Ask before proposing a change in direction. Current concept context: {json.dumps(c)}. Prerequisite context: {json.dumps([x for x in t['concepts'] if x['id'] in c['requires']])}. At the end, return ONLY a JSON object matching this schema, replacing placeholders with honest session evidence. Valid states are introduced, developing, understood, needs-review. Use understood only with demonstrated evidence; do not invent it. Only use concept IDs from this path: {json.dumps([x['id'] for x in t['concepts']])}. JSON template: {json.dumps(example)}"
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

static=Path(__file__).resolve().parent.parent/'frontend_dist'
if static.exists(): app.mount('/',StaticFiles(directory=static,html=True),name='frontend')
