"""Shared learner knowledge and path edits. Trees point at knowledge; they do not own it."""
import json
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import HTTPException
from pydantic import Field

from .recap import Strict

STATES = ('introduced', 'developing', 'understood', 'needs-review', 'unexplored')


class RichConcept(Strict):
    title: str = Field(min_length=1, max_length=150)
    objectives: list[str] = Field(min_length=1, max_length=12)
    teaching_notes: str = Field(default='', max_length=4000)
    summary: str = Field(default='', max_length=500)
    requires: list[str] = Field(default_factory=list, max_length=12)
    knowledge_id: str | None = None


class ConceptEdit(Strict):
    id: str = ''
    title: str = Field(default='', max_length=150)
    objectives: list[str] | None = Field(default=None, max_length=12)
    teaching_notes: str | None = Field(default=None, max_length=4000)
    summary: str | None = Field(default=None, max_length=500)
    requires: list[str] | None = Field(default=None, max_length=12)
    knowledge_id: str | None = None
    delete: bool = False


class PathPatch(Strict):
    title: str | None = Field(default=None, max_length=150)
    category: str | None = Field(default=None, max_length=150)
    goal: str | None = Field(default=None, max_length=2000)
    depth: str | None = Field(default=None, max_length=150)
    excludes: str | None = Field(default=None, max_length=2000)
    outcomes: list[str] | None = Field(default=None, max_length=20)
    concepts: list[ConceptEdit] | None = Field(default=None, max_length=30)


class CloseTopic(Strict):
    concept_id: str = ''
    knowledge_id: str = ''
    summary: str = Field(max_length=8000)
    evidence: str = Field(default='', max_length=8000)
    confidence: str = Field(default='Not assessed', max_length=100)
    state: Literal['introduced', 'developing', 'understood', 'needs-review']


class CloseSession(Strict):
    topics: list[CloseTopic] = Field(min_length=1, max_length=30)
    questions: list[str] = Field(default_factory=list, max_length=30)
    path: PathPatch | None = None


class KnowledgeQuery(Strict):
    query: str = Field(default='', max_length=200)
    subject: str = Field(default='', max_length=150)


def now():
    return datetime.now(timezone.utc).isoformat()


def subjects_of(category):
    parts = [part.strip().casefold() for part in (category or '').split('/') if part.strip()]
    return parts or ['general']


def blank(values):
    return any(not str(item).strip() for item in values)


def knowledge_view(record):
    return {key: record.get(key, '') for key in ('id', 'title', 'subjects', 'state', 'confidence', 'summary', 'evidence', 'notes')}


def find_knowledge(data, knowledge_id='', title=''):
    if knowledge_id:
        found = next((item for item in data['knowledge'] if item['id'] == knowledge_id), None)
        if not found:
            raise HTTPException(422, 'Unknown knowledge id')
        return found
    key = title.strip().casefold()
    if not key:
        return None
    return next((item for item in data['knowledge'] if item['title'].strip().casefold() == key or key in [alias.strip().casefold() for alias in item.get('aliases', [])]), None)


def add_subjects(record, subjects):
    have = {item.casefold() for item in record.get('subjects', [])}
    for subject in subjects:
        if subject.casefold() not in have:
            record.setdefault('subjects', []).append(subject)
            have.add(subject.casefold())


def new_knowledge(title, subjects, summary='', state='unexplored', confidence='Not assessed', evidence='', notes=''):
    return dict(id=uuid.uuid4().hex, title=title.strip(), aliases=[], subjects=list(subjects), summary=summary or '', state=state or 'unexplored', confidence=confidence or 'Not assessed', evidence=evidence or '', notes=notes or '', updated_at=now())


def remember_alias(record, title):
    key = title.strip()
    if not key or key.casefold() == record['title'].strip().casefold():
        return
    if key.casefold() not in [alias.strip().casefold() for alias in record.get('aliases', [])]:
        record.setdefault('aliases', []).append(key)


def link_concept(data, concept, subjects, knowledge_id=''):
    record = find_knowledge(data, knowledge_id, '' if knowledge_id else concept['title'])
    if record is None:
        record = new_knowledge(concept['title'], subjects, concept.get('summary', ''), concept.get('state', 'unexplored'), concept.get('confidence', 'Not assessed'), concept.get('evidence', ''), concept.get('notes', ''))
        data['knowledge'].append(record)
    else:
        add_subjects(record, subjects)
        remember_alias(record, concept['title'])
    concept['knowledge_id'] = record['id']
    return record


def project(data):
    by_id = {item['id']: item for item in data.get('knowledge', [])}
    for tree in data.get('trees', []):
        for concept in tree.get('concepts', []):
            record = by_id.get(concept.get('knowledge_id'))
            if not record:
                continue
            concept['state'] = record.get('state', 'unexplored')
            concept['confidence'] = record.get('confidence', 'Not assessed')
            concept['evidence'] = record.get('evidence', '')
            concept['notes'] = record.get('notes', '')


def ensure_knowledge(data):
    data.setdefault('knowledge', [])
    for tree in data.get('trees', []):
        subjects = subjects_of(tree.get('category', ''))
        for concept in tree.get('concepts', []):
            concept.setdefault('objectives', [])
            concept.setdefault('teaching_notes', '')
            concept.setdefault('knowledge_id', '')
            if concept['knowledge_id'] and any(item['id'] == concept['knowledge_id'] for item in data['knowledge']):
                record = find_knowledge(data, concept['knowledge_id'])
                add_subjects(record, subjects)
                continue
            concept['knowledge_id'] = ''
            link_concept(data, concept, subjects)


def prepare(data):
    data.setdefault('ideas', [])
    data.setdefault('drafts', [])
    data.setdefault('preferences', [])
    data.setdefault('sessions', [])
    data.setdefault('knowledge', [])
    ensure_knowledge(data)
    project(data)


def place_concept(concept_id, title, index, requires, summary='', objectives=None, teaching_notes='', knowledge_id=''):
    from .seed import concept
    node = concept(concept_id, title.strip(), 70 + index * 240, 150 + (index % 2) * 120, requires, summary=summary, objectives=objectives or [], teaching_notes=teaching_notes, knowledge_id=knowledge_id)
    return node


def resolve_requires(labels, concepts, owner_id=''):
    resolved = []
    for label in labels or []:
        text = str(label).strip()
        if not text:
            continue
        if text.isdigit():
            index = int(text)
            if index < 0 or index >= len(concepts):
                raise HTTPException(422, 'Prerequisite index is out of range')
            resolved.append(concepts[index]['id'])
            continue
        match = next((item for item in concepts if item['id'] == text or item['title'].strip().casefold() == text.casefold()), None)
        if not match:
            raise HTTPException(422, f'Unknown prerequisite: {text}')
        resolved.append(match['id'])
    if owner_id:
        resolved = [item for item in resolved if item != owner_id]
    return list(dict.fromkeys(resolved))


def assert_acyclic(concepts):
    by_id = {item['id']: item for item in concepts}
    visiting, seen = set(), set()

    def walk(concept_id):
        if concept_id in seen:
            return
        if concept_id in visiting:
            raise HTTPException(422, 'Prerequisites cannot form a cycle')
        visiting.add(concept_id)
        node = by_id.get(concept_id)
        if node is None:
            raise HTTPException(422, 'Unknown prerequisite')
        for requirement in node.get('requires', []):
            if requirement not in by_id:
                raise HTTPException(422, 'Unknown prerequisite')
            walk(requirement)
        visiting.remove(concept_id)
        seen.add(concept_id)

    for item in concepts:
        walk(item['id'])


def clean_lines(values, label):
    if values is None:
        return None
    lines = [item.strip() for item in values]
    if any(not line for line in lines):
        raise HTTPException(422, f'{label} cannot be blank')
    return lines


def build_tree(data, title, category, goal, depth, excludes, outcomes, concepts, idea_id=None):
    if blank(outcomes) or blank(item['title'] for item in concepts):
        raise HTTPException(422, 'Outcomes and concepts cannot be blank')
    subjects = subjects_of(category)
    nodes = []
    for index, item in enumerate(concepts):
        objectives = clean_lines(item.get('objectives') or [], 'Objectives') or []
        if item.get('rich') and not objectives:
            raise HTTPException(422, 'New nodes need objectives')
        node = place_concept(uuid.uuid4().hex, item['title'], index, [], item.get('summary', ''), objectives, item.get('teaching_notes', ''))
        link_concept(data, node, subjects, item.get('knowledge_id') or '')
        nodes.append(node)
    for node, item in zip(nodes, concepts):
        node['requires'] = resolve_requires(item.get('requires') or [], nodes, node['id'])
    assert_acyclic(nodes)
    tree = dict(id=uuid.uuid4().hex, title=title.strip(), category=category.strip(), goal=goal.strip(), depth=depth.strip(), status='planned', excludes=(excludes or '').strip(), outcomes=[item.strip() for item in outcomes], concepts=nodes)
    if idea_id:
        tree['idea_id'] = idea_id
    return tree


def apply_path_patch(data, tree, patch: PathPatch):
    for field in ('title', 'category', 'goal', 'depth'):
        value = getattr(patch, field)
        if value is None:
            continue
        if not value.strip():
            raise HTTPException(422, f'{field} cannot be blank')
        tree[field] = value.strip()
    if patch.excludes is not None:
        tree['excludes'] = patch.excludes.strip()
    if patch.outcomes is not None:
        outcomes = clean_lines(patch.outcomes, 'Outcomes')
        if not outcomes:
            raise HTTPException(422, 'Outcomes cannot be blank')
        tree['outcomes'] = outcomes
    subjects = subjects_of(tree.get('category', ''))
    if patch.concepts:
        for edit in patch.concepts:
            if edit.delete:
                if not edit.id:
                    raise HTTPException(422, 'Delete needs a concept id on this path')
                if not any(item['id'] == edit.id for item in tree['concepts']):
                    raise HTTPException(422, 'Unknown concept')
                tree['concepts'] = [item for item in tree['concepts'] if item['id'] != edit.id]
                for item in tree['concepts']:
                    item['requires'] = [req for req in item['requires'] if req != edit.id]
                continue
            current = next((item for item in tree['concepts'] if edit.id and item['id'] == edit.id), None)
            if edit.id and current is None:
                raise HTTPException(422, 'Unknown concept')
            if current is None:
                objectives = clean_lines(edit.objectives or [], 'Objectives') or []
                if not edit.title.strip() or not objectives:
                    raise HTTPException(422, 'New nodes need a title and objectives')
                current = place_concept(uuid.uuid4().hex, edit.title, len(tree['concepts']), [], edit.summary or '', objectives, edit.teaching_notes or '')
                link_concept(data, current, subjects, edit.knowledge_id or '')
                tree['concepts'].append(current)
            else:
                if edit.title.strip():
                    current['title'] = edit.title.strip()
                    remember_alias(find_knowledge(data, current.get('knowledge_id', '')), current['title'])
                if edit.objectives is not None:
                    current['objectives'] = clean_lines(edit.objectives, 'Objectives') or []
                if edit.teaching_notes is not None:
                    current['teaching_notes'] = edit.teaching_notes.strip()
                if edit.summary is not None:
                    current['summary'] = edit.summary.strip()
                if edit.knowledge_id:
                    link_concept(data, current, subjects, edit.knowledge_id)
            if edit.requires is not None and not edit.delete:
                current['requires'] = resolve_requires(edit.requires, tree['concepts'], current['id'])
        if not tree['concepts']:
            raise HTTPException(422, 'A path needs at least one concept')
        assert_acyclic(tree['concepts'])
    return tree


def write_knowledge(record, summary, evidence, confidence, state):
    if state not in STATES or state == 'unexplored':
        raise HTTPException(422, 'Invalid understanding state')
    if state == 'understood' and not evidence.strip():
        raise HTTPException(422, 'Understanding needs evidence')
    record.update(summary=summary.strip() or record.get('summary', ''), notes=summary.strip(), evidence=evidence.strip(), confidence=confidence.strip() or 'Not assessed', state=state, updated_at=now())


def topic_target(data, tree, topic: CloseTopic):
    concept = next((item for item in tree['concepts'] if topic.concept_id and item['id'] == topic.concept_id), None)
    if topic.concept_id and concept is None:
        raise HTTPException(422, 'Unknown or repeated concept ID')
    record = None
    if topic.knowledge_id:
        record = find_knowledge(data, topic.knowledge_id)
        if concept and concept.get('knowledge_id') != record['id']:
            raise HTTPException(422, 'Knowledge does not match this concept')
        if concept is None:
            concept = next((item for item in tree['concepts'] if item.get('knowledge_id') == record['id']), None)
    elif concept is not None:
        record = find_knowledge(data, concept.get('knowledge_id', ''))
    if record is None:
        raise HTTPException(422, 'Unknown or repeated concept ID')
    return concept, record


def path_by_id(data, tree_id):
    found = next((item for item in data['trees'] if item['id'] == tree_id), None)
    if not found:
        raise HTTPException(404, 'Learning path not found')
    return found


def apply_close(data, session, body: CloseSession):
    tree = path_by_id(data, session['tree_id'])
    if session.get('status') == 'accepted':
        raise HTTPException(409, 'This session has already been imported')
    if body.path is not None:
        apply_path_patch(data, tree, body.path)
    targets = []
    seen = set()
    for topic in body.topics:
        concept, record = topic_target(data, tree, topic)
        key = record['id']
        if key in seen:
            raise HTTPException(422, 'Unknown or repeated concept ID')
        seen.add(key)
        targets.append((concept, record, topic))
    for concept, record, topic in targets:
        write_knowledge(record, topic.summary, topic.evidence, topic.confidence, topic.state)
    project(data)
    stored = dict(schema_version='0.1', session_id=session['id'], tree_id=tree['id'], topics=[dict(concept_id=(concept or {}).get('id', ''), knowledge_id=record['id'], summary=topic.summary.strip(), evidence=topic.evidence.strip(), confidence=topic.confidence.strip() or 'Not assessed', state=topic.state) for concept, record, topic in targets], questions=body.questions)
    session.update(status='accepted', recap=stored)
    return tree


def search_knowledge(data, query='', subject=''):
    needle = query.strip().casefold()
    subject_needle = subject.strip().casefold()
    matches = []
    for item in data.get('knowledge', []):
        subjects = [value.casefold() for value in item.get('subjects', [])]
        if subject_needle and subject_needle not in subjects and subject_needle not in item.get('title', '').casefold():
            continue
        blob = ' '.join([item.get('title', ''), *item.get('aliases', []), item.get('summary', ''), item.get('notes', ''), item.get('evidence', '')]).casefold()
        if needle and needle not in blob:
            continue
        matches.append(dict(id=item['id'], title=item['title'], aliases=item.get('aliases', []), subjects=item.get('subjects', []), state=item.get('state', 'unexplored'), summary=(item.get('summary') or '')[:240], evidence=(item.get('evidence') or '')[:240]))
    return matches[:20]


def knowledge_digest(data, subjects=None, skip=None, limit=12):
    wanted = {item.casefold() for item in (subjects or [])}
    skipped = set(skip or [])

    def rank(item):
        overlap = 0 if wanted and wanted & {value.casefold() for value in item.get('subjects', [])} else 1
        known = 0 if item.get('state') not in ('', 'unexplored') else 1
        return (overlap, known, item.get('title', ''))

    lines = []
    for item in sorted(data.get('knowledge', []), key=rank):
        if item['id'] in skipped:
            continue
        evidence = (item.get('evidence') or '')[:160]
        lines.append(f"- {item['title']} ({item['id']}) state={item.get('state', 'unexplored')} subjects={', '.join(item.get('subjects', []))} evidence={evidence}")
        if len(lines) >= limit:
            break
    return '\n'.join(lines)


def lesson_prompt(data, tree, concept, session_id):
    record = find_knowledge(data, concept.get('knowledge_id', '')) if concept.get('knowledge_id') else None
    prerequisites = [item for item in tree['concepts'] if item['id'] in concept.get('requires', [])]
    prerequisite_knowledge = []
    for item in prerequisites:
        linked = find_knowledge(data, item.get('knowledge_id', '')) if item.get('knowledge_id') else None
        if linked:
            prerequisite_knowledge.append(knowledge_view(linked))
    catalog = [{'id': item['id'], 'title': item['title'], 'knowledge_id': item.get('knowledge_id', ''), 'objectives': item.get('objectives', [])} for item in tree['concepts']]
    example = dict(topics=[dict(concept_id=concept['id'], knowledge_id=concept.get('knowledge_id', ''), summary='What the learner can now say', evidence='What they demonstrated, or insufficient evidence', confidence='Learner reported confidence, or not assessed', state='introduced')], questions=[])
    related = knowledge_digest(data, subjects_of(tree.get('category', '')), skip=[concept.get('knowledge_id', '')])
    return (
        f"Session {session_id}. Teach me {concept['title']} through a dialogue I can end when I am ready. Stay on this concept unless I ask to change the path. "
        f"Do not preview later concepts. Do not suggest stopping, wrapping up, or ending for the day. "
        f"Path goal: {tree['goal']}. Target depth: {tree['depth']}. Outcomes: {json.dumps(tree.get('outcomes', []))}. Exclude: {tree['excludes']}. "
        f"Ask one question at a time, include active recall, and check prerequisite gaps without forcing a full prerequisite course. "
        f"Treat confidence separately from demonstrated understanding. "
        f"Current concept: {json.dumps({'id': concept['id'], 'title': concept['title'], 'summary': concept.get('summary', ''), 'objectives': concept.get('objectives', []), 'teaching_notes': concept.get('teaching_notes', ''), 'requires': concept.get('requires', []), 'knowledge_id': concept.get('knowledge_id', '')})}. "
        f"What I already understand about it: {json.dumps(knowledge_view(record) if record else {})}. "
        f"Prerequisite knowledge: {json.dumps(prerequisite_knowledge)}. "
        f"Other knowledge in this subject: {related or 'None yet.'} "
        f"Use search_knowledge before assuming I have not studied a related idea. "
        f"Use update_path when the path, a node, its objectives, or its teaching notes should change. New nodes need objectives. Reuse a knowledge_id when it is the same idea. Only this path can change. "
        f"If I say I am done, finished, or ready to stop, call close_session immediately. That saves the notes and ends the conversation. Do not only say that you will make a recap. Do not say the notes were saved until close_session succeeds. "
        f"Valid states are introduced, developing, understood, needs-review. Use understood only with demonstrated evidence. "
        f"Concepts on this path: {json.dumps(catalog)}. Field guide: {json.dumps(example)}"
    )
