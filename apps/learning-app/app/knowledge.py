"""Shared learner knowledge and path-structure edits."""
import json
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException


def now():
    return datetime.now(timezone.utc).isoformat()


def norm(value):
    return ' '.join(str(value or '').lower().split())


def subjects_of(category):
    parts = [part.strip() for part in str(category or '').replace('\\', '/').split('/') if part.strip()]
    return parts or ['General']


def blank_knowledge(title, subjects, **extra):
    return dict(
        id=extra.get('id') or uuid.uuid4().hex,
        title=title.strip(),
        aliases=list(extra.get('aliases') or []),
        subjects=list(subjects),
        summary=extra.get('summary') or '',
        state=extra.get('state') or 'unexplored',
        confidence=extra.get('confidence') or 'Not assessed',
        evidence=extra.get('evidence') or '',
        notes=extra.get('notes') or '',
        updated_at=extra.get('updated_at') or now(),
    )


def names_of(record):
    return {norm(record.get('title')), *(norm(alias) for alias in record.get('aliases') or [])}


def find_knowledge(knowledge, title, subjects, knowledge_id=None):
    if knowledge_id:
        found = next((item for item in knowledge if item['id'] == knowledge_id), None)
        if not found:
            raise HTTPException(422, 'Unknown knowledge id')
        return found
    key = norm(title)
    wanted = {norm(subject) for subject in subjects}
    ranked = []
    for item in knowledge:
        if key not in names_of(item):
            continue
        overlap = bool(wanted & {norm(subject) for subject in item.get('subjects') or []})
        if overlap:
            ranked.append(item)
    return ranked[0] if ranked else None


def touch_subjects(record, subjects):
    have = {norm(subject) for subject in record.get('subjects') or []}
    for subject in subjects:
        if norm(subject) not in have:
            record.setdefault('subjects', []).append(subject)
            have.add(norm(subject))


def project(concept, record):
    if not record:
        return False
    changed = False
    fields = {
        'state': record.get('state') or 'unexplored',
        'confidence': record.get('confidence') or 'Not assessed',
        'evidence': record.get('evidence') or '',
        'notes': record.get('notes') or '',
    }
    if not concept.get('summary') and record.get('summary'):
        fields['summary'] = record['summary']
    for key, value in fields.items():
        if concept.get(key) != value:
            concept[key] = value
            changed = True
    return changed


def knowledge_by_id(data, knowledge_id):
    return next((item for item in data.get('knowledge', []) if item['id'] == knowledge_id), None)


def project_all(data):
    changed = False
    for tree in data.get('trees', []):
        for concept in tree.get('concepts', []):
            if project(concept, knowledge_by_id(data, concept.get('knowledge_id'))):
                changed = True
    return changed


def ensure_knowledge(data):
    changed = False
    data.setdefault('knowledge', [])
    data.setdefault('ideas', [])
    data.setdefault('drafts', [])
    data.setdefault('preferences', [])
    data.setdefault('sessions', [])
    data.setdefault('trees', [])
    for tree in data['trees']:
        subjects = subjects_of(tree.get('category'))
        for concept in tree.get('concepts', []):
            if 'objectives' not in concept:
                concept['objectives'] = []
                changed = True
            if 'teaching_notes' not in concept:
                concept['teaching_notes'] = ''
                changed = True
            linked = knowledge_by_id(data, concept.get('knowledge_id'))
            if linked:
                before = list(linked.get('subjects') or [])
                touch_subjects(linked, subjects)
                if linked.get('subjects') != before:
                    changed = True
                continue
            match = find_knowledge(data['knowledge'], concept.get('title', ''), subjects)
            if match:
                concept['knowledge_id'] = match['id']
                touch_subjects(match, subjects)
                if not match.get('evidence') and concept.get('evidence'):
                    match.update(
                        state=concept.get('state') or match.get('state') or 'unexplored',
                        confidence=concept.get('confidence') or match.get('confidence') or 'Not assessed',
                        evidence=concept.get('evidence') or '',
                        notes=concept.get('notes') or match.get('notes') or '',
                        summary=match.get('summary') or concept.get('summary') or '',
                        updated_at=now(),
                    )
                changed = True
                continue
            record = blank_knowledge(
                concept.get('title') or 'Untitled',
                subjects,
                summary=concept.get('summary') or '',
                state=concept.get('state') or 'unexplored',
                confidence=concept.get('confidence') or 'Not assessed',
                evidence=concept.get('evidence') or '',
                notes=concept.get('notes') or '',
            )
            data['knowledge'].append(record)
            concept['knowledge_id'] = record['id']
            changed = True
    if project_all(data):
        changed = True
    return changed


def public_knowledge(record):
    if not record:
        return None
    return {key: record.get(key) for key in ('id', 'title', 'subjects', 'state', 'confidence', 'summary', 'evidence', 'notes')}


def digest(knowledge, subjects=None, limit=16, skip=()):
    skip = set(skip)
    wanted = {norm(subject) for subject in subjects or []}

    def rank(item):
        overlap = 1 if wanted and wanted & {norm(subject) for subject in item.get('subjects') or []} else 0
        known = 0 if item.get('state') in (None, '', 'unexplored') and not item.get('evidence') and not item.get('notes') else 1
        return (overlap, known)

    items = [item for item in knowledge if item['id'] not in skip]
    if wanted:
        matched = [item for item in items if rank(item)[0]]
        if matched:
            items = matched
    chosen = sorted(items, key=rank, reverse=True)[:limit]
    return [{'id': item['id'], 'title': item['title'], 'subjects': item.get('subjects') or [], 'state': item.get('state'), 'evidence': (item.get('evidence') or '')[:180]} for item in chosen]


def search_records(knowledge, query='', subject=''):
    words = [norm(part) for part in (query or '').split() if norm(part)]
    subject_key = norm(subject)
    found = []
    for item in knowledge:
        if subject_key and subject_key not in {norm(part) for part in item.get('subjects') or []}:
            continue
        haystack = ' '.join([item.get('title') or '', ' '.join(item.get('aliases') or []), item.get('summary') or '', item.get('evidence') or '', item.get('notes') or ''])
        folded = norm(haystack)
        if words and not all(word in folded for word in words):
            continue
        found.append(public_knowledge(item))
        if len(found) >= 20:
            break
    return found


def link_knowledge(data, title, subjects, knowledge_id=None, summary=''):
    if knowledge_id == '':
        knowledge_id = None
    record = find_knowledge(data['knowledge'], title, subjects, knowledge_id)
    if record:
        touch_subjects(record, subjects)
        if summary and not record.get('summary'):
            record['summary'] = summary
        return record
    record = blank_knowledge(title, subjects, summary=summary)
    data['knowledge'].append(record)
    return record


def node(title, x, y, requires, record, objectives, teaching_notes, summary=''):
    concept = dict(
        id=uuid.uuid4().hex,
        title=title.strip(),
        x=x,
        y=y,
        requires=list(requires),
        state='unexplored',
        summary=summary or record.get('summary') or '',
        confidence='Not assessed',
        evidence='',
        notes='',
        knowledge_id=record['id'],
        objectives=[item.strip() for item in objectives if item and item.strip()],
        teaching_notes=teaching_notes.strip(),
    )
    project(concept, record)
    return concept


def resolve_requires(tokens, concepts, indexes=None):
    by_id = {concept['id'] for concept in concepts}
    by_title = {}
    for concept in concepts:
        by_title.setdefault(norm(concept['title']), []).append(concept['id'])
    resolved = []
    for token in tokens or []:
        text = str(token).strip()
        if not text:
            continue
        if indexes is not None and text.isdigit():
            index = int(text)
            if index < 0 or index >= len(indexes):
                raise HTTPException(422, 'Unknown prerequisite')
            resolved.append(indexes[index])
            continue
        if text in by_id:
            resolved.append(text)
            continue
        matches = by_title.get(norm(text), [])
        if len(matches) != 1:
            raise HTTPException(422, 'Unknown prerequisite')
        resolved.append(matches[0])
    unique = []
    for item in resolved:
        if item not in unique:
            unique.append(item)
    return unique


def assert_acyclic(concepts):
    graph = {concept['id']: concept.get('requires') or [] for concept in concepts}
    seen, stack = set(), set()

    def visit(node_id):
        if node_id in stack:
            raise HTTPException(422, 'Concept prerequisites cannot form a cycle')
        if node_id in seen:
            return
        if node_id not in graph:
            raise HTTPException(422, 'Unknown prerequisite')
        stack.add(node_id)
        seen.add(node_id)
        for nxt in graph[node_id]:
            visit(nxt)
        stack.remove(node_id)

    for node_id in graph:
        visit(node_id)


def cleaned_objectives(values, required):
    if values is None:
        if required:
            raise HTTPException(422, 'Each new concept needs at least one objective')
        return None
    objectives = [item.strip() for item in values if item and str(item).strip()]
    if required and not objectives:
        raise HTTPException(422, 'Each new concept needs at least one objective')
    if values is not None and not objectives:
        raise HTTPException(422, 'Objectives cannot be blank')
    return objectives


def apply_path_patch(data, tree, patch):
    for field in ('title', 'category', 'goal', 'depth', 'excludes'):
        if patch.get(field) is not None:
            value = str(patch[field]).strip()
            if field != 'excludes' and not value:
                raise HTTPException(422, f'{field} cannot be blank')
            tree[field] = value
    if patch.get('status'):
        tree['status'] = patch['status']
    if patch.get('outcomes') is not None:
        outcomes = [item.strip() for item in patch['outcomes'] if item and str(item).strip()]
        if not outcomes:
            raise HTTPException(422, 'Outcomes cannot be blank')
        tree['outcomes'] = outcomes
    subjects = subjects_of(tree.get('category'))
    concepts = tree['concepts']
    for item in patch.get('concepts') or []:
        if not item.get('delete'):
            continue
        if not item.get('id') or not any(concept['id'] == item['id'] for concept in concepts):
            raise HTTPException(422, 'Unknown concept')
        concepts = [concept for concept in concepts if concept['id'] != item['id']]
        for concept in concepts:
            concept['requires'] = [req for req in concept['requires'] if req != item['id']]
    fresh = []
    for item in patch.get('concepts') or []:
        if item.get('delete'):
            continue
        if item.get('id'):
            concept = next((concept for concept in concepts if concept['id'] == item['id']), None)
            if not concept:
                raise HTTPException(422, 'Unknown concept')
            if item.get('title') is not None:
                title = item['title'].strip()
                if not title:
                    raise HTTPException(422, 'Concept title cannot be blank')
                concept['title'] = title
            if item.get('objectives') is not None:
                concept['objectives'] = cleaned_objectives(item.get('objectives'), required=False)
            if item.get('teaching_notes') is not None:
                concept['teaching_notes'] = item['teaching_notes'].strip()
            if item.get('summary') is not None:
                concept['summary'] = item['summary'].strip()
            if item.get('knowledge_id'):
                record = link_knowledge(data, concept['title'], subjects, item['knowledge_id'], concept.get('summary') or '')
                concept['knowledge_id'] = record['id']
                project(concept, record)
            continue
        title = (item.get('title') or '').strip()
        objectives = cleaned_objectives(item.get('objectives'), required=True)
        if not title:
            raise HTTPException(422, 'Each new concept needs a title')
        record = link_knowledge(data, title, subjects, item.get('knowledge_id'), (item.get('summary') or '').strip())
        index = len(concepts) + len(fresh)
        concept = node(title, 70 + index * 240, 150 + (index % 2) * 120, [], record, objectives, item.get('teaching_notes') or '', (item.get('summary') or '').strip())
        concepts.append(concept)
        fresh.append((item, concept))
    if not concepts:
        raise HTTPException(422, 'A path needs at least one concept')
    by_id = {concept['id']: concept for concept in concepts}
    for item in patch.get('concepts') or []:
        if item.get('delete') or not item.get('id') or item.get('requires') is None:
            continue
        concept = by_id.get(item['id'])
        if not concept:
            raise HTTPException(422, 'Unknown concept')
        concept['requires'] = resolve_requires(item.get('requires'), concepts)
    for item, concept in fresh:
        if item.get('requires') is not None:
            concept['requires'] = resolve_requires(item.get('requires'), concepts)
    assert_acyclic(concepts)
    for concept in concepts:
        record = knowledge_by_id(data, concept.get('knowledge_id'))
        if record:
            touch_subjects(record, subjects)
            project(concept, record)
    tree['concepts'] = concepts
    return tree


def build_tree(data, payload):
    subjects = subjects_of(payload.category)
    specs = []
    for index, item in enumerate(payload.concepts):
        objectives = cleaned_objectives(item.objectives, required=True)
        specs.append(dict(title=item.title.strip(), objectives=objectives, teaching_notes=item.teaching_notes.strip(), requires=list(item.requires), knowledge_id=item.knowledge_id or None, summary=item.summary.strip()))
    concepts = []
    for index, spec in enumerate(specs):
        record = link_knowledge(data, spec['title'], subjects, spec['knowledge_id'], spec['summary'])
        concepts.append(node(spec['title'], 70 + index * 240, 150 + (index % 2) * 120, [], record, spec['objectives'], spec['teaching_notes'], spec['summary']))
    for concept, spec in zip(concepts, specs):
        concept['requires'] = resolve_requires(spec['requires'], concepts, indexes=[concept['id'] for concept in concepts])
    assert_acyclic(concepts)
    tree = dict(
        id=uuid.uuid4().hex,
        title=payload.title.strip(),
        category=payload.category.strip(),
        goal=payload.goal.strip(),
        depth=payload.depth.strip(),
        status='planned',
        excludes=payload.excludes.strip(),
        outcomes=[item.strip() for item in payload.outcomes if item.strip()],
        concepts=concepts,
    )
    if not tree['outcomes']:
        raise HTTPException(422, 'Outcomes cannot be blank')
    return tree


def resolve_topic_concept(tree, topic):
    token = (topic.get('concept_id') or '').strip()
    if not token:
        return None
    by_id = next((concept for concept in tree['concepts'] if concept['id'] == token), None)
    if by_id:
        return by_id
    matches = [concept for concept in tree['concepts'] if norm(concept['title']) == norm(token)]
    if len(matches) == 1:
        return matches[0]
    raise HTTPException(422, 'Unknown concept')


def apply_topics(data, tree, topics):
    seen = set()
    stored = []
    for topic in topics:
        concept = resolve_topic_concept(tree, topic)
        record = None
        if topic.get('knowledge_id'):
            record = knowledge_by_id(data, topic['knowledge_id'])
            if not record:
                raise HTTPException(422, 'Unknown knowledge id')
        if concept and record and concept.get('knowledge_id') != record['id']:
            raise HTTPException(422, 'Concept does not match that knowledge record')
        if concept and not record:
            record = knowledge_by_id(data, concept.get('knowledge_id'))
        if not record:
            raise HTTPException(422, 'Topic needs a concept or knowledge id')
        if topic.get('state') == 'understood' and not str(topic.get('evidence') or '').strip():
            raise HTTPException(422, 'Understanding needs evidence')
        if record['id'] in seen:
            raise HTTPException(422, 'Unknown or repeated concept ID')
        seen.add(record['id'])
        record.update(
            summary=topic.get('summary') or record.get('summary') or '',
            evidence=topic.get('evidence') or '',
            confidence=topic.get('confidence') or 'Not assessed',
            state=topic.get('state'),
            notes=topic.get('summary') or '',
            updated_at=now(),
        )
        for other in data['trees']:
            for node_item in other['concepts']:
                if node_item.get('knowledge_id') == record['id']:
                    project(node_item, record)
        stored.append(dict(
            concept_id=concept['id'] if concept else '',
            knowledge_id=record['id'],
            summary=record['notes'],
            evidence=record['evidence'],
            confidence=record['confidence'],
            state=record['state'],
        ))
    return stored


def lesson_prompt(data, tree, concept, session_id):
    record = knowledge_by_id(data, concept.get('knowledge_id'))
    prereq_nodes = [item for item in tree['concepts'] if item['id'] in (concept.get('requires') or [])]
    prereq_knowledge = [public_knowledge(knowledge_by_id(data, item.get('knowledge_id'))) for item in prereq_nodes]
    related = digest(data.get('knowledge', []), subjects_of(tree.get('category')), skip={concept.get('knowledge_id')})
    recent = []
    for earlier in data.get('sessions', []):
        if earlier.get('tree_id') != tree['id'] or earlier.get('status') != 'accepted':
            continue
        for topic in (earlier.get('recap') or {}).get('topics', []):
            recent.append({'concept_id': topic.get('concept_id'), 'knowledge_id': topic.get('knowledge_id'), 'state': topic.get('state'), 'summary': (topic.get('summary') or '')[:400]})
        if len(recent) >= 6:
            break
    example = dict(topics=[dict(concept_id=concept['id'], knowledge_id=concept.get('knowledge_id'), summary='Replace with session notes', evidence='Describe what the learner demonstrated, or state insufficient evidence', confidence='Learner reported confidence, or not assessed', state='introduced')], questions=[])
    current = dict(id=concept['id'], title=concept['title'], objectives=concept.get('objectives') or [], teaching_notes=concept.get('teaching_notes') or '', summary=concept.get('summary') or '', requires=concept.get('requires') or [])
    return (
        f"Teach me {concept['title']} through a dialogue I can end when I am ready. Stay on this concept. Do not preview later concepts. "
        f"Do not suggest stopping, wrapping up, or ending for the day. Path goal: {tree['goal']}. Target depth: {tree['depth']}. "
        f"Outcomes: {json.dumps(tree.get('outcomes') or [])}. Exclude: {tree.get('excludes') or ''}. "
        "Ask one question at a time, include active recall, and check prerequisite gaps without forcing a full prerequisite course. "
        "Treat confidence separately from demonstrated understanding. "
        f"Current concept: {json.dumps(current)}. What I already understand about it: {json.dumps(public_knowledge(record))}. "
        f"Prerequisite knowledge: {json.dumps(prereq_knowledge)}. Other knowledge in this subject: {json.dumps(related)}. "
        f"Recent accepted notes on this path, newest first: {json.dumps(recent[:6])}. "
        "Use them to start where the explanation actually is. Skip what I already explained, and repair a thin explanation before adding more. "
        "If I say I am done, finished, or ready to stop, call close_session immediately. It saves the notes and any path update, then ends the conversation. "
        "Do not ask me to press save. Use update_path during the session when this path’s goal, outcomes, exclusions, or a node’s title, objectives, teaching notes, or prerequisites should change. "
        "New nodes need objectives. Prefer an existing knowledge_id when the topic is one I already know. Do not edit any other path. "
        "Valid states are introduced, developing, understood, needs-review. Use understood only with demonstrated evidence. "
        f"Only use concept ids from this path: {json.dumps([item['id'] for item in tree['concepts']])}. "
        f"Session {session_id}. Field guide: {json.dumps(example)}"
    )
