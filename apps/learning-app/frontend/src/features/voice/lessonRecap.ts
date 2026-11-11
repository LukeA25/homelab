import type {Concept, Recap, Session} from '@/model';

export function lessonRecap(raw: Record<string, unknown>, session: Session, concepts: Concept[]): Recap {
  const allowed = new Set(['introduced', 'developing', 'understood', 'needs-review']);
  const incoming = Array.isArray(raw.topics) ? raw.topics : raw.topics ? [raw.topics] : [];
  const topics = new Map<string, Recap['topics'][number]>();
  for (const item of incoming) {
    if (!item || typeof item !== 'object') continue;
    const source = item as Record<string, unknown>;
    const label = String(source.concept_id || source.concept || source.title || source.name || '').trim();
    const match = concepts.find(concept => concept.id === label) || concepts.find(concept => concept.title.toLowerCase() === label.toLowerCase());
    const concept_id = match?.id || session.concept_id;
    let state = String(source.state || 'introduced').trim().toLowerCase().replace(/[\s_]+/g, '-');
    if (state === 'needsreview') state = 'needs-review';
    if (!allowed.has(state)) state = 'introduced';
    const evidence = String(source.evidence || source.demonstration || '').trim().slice(0, 8000);
    if (state === 'understood' && !evidence) state = 'developing';
    const summary = String(source.summary || source.notes || source.note || '').trim().slice(0, 8000);
    const confidence = String(source.confidence || 'Not assessed').trim().slice(0, 100) || 'Not assessed';
    const previous = topics.get(concept_id);
    topics.set(concept_id, {
      concept_id,
      summary: [previous?.summary, summary].filter(Boolean).join('\n').slice(0, 8000) || 'No notes were captured.',
      evidence: [previous?.evidence, evidence].filter(value => value && value !== 'Not assessed.').join('\n').slice(0, 8000) || 'Not assessed.',
      confidence,
      state,
    });
  }
  if (!topics.size) topics.set(session.concept_id, {concept_id: session.concept_id, summary: 'No notes were captured.', evidence: 'Not assessed.', confidence: 'Not assessed.', state: 'introduced'});
  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : raw.questions ? [raw.questions] : [];
  const questions = rawQuestions.map(item => typeof item === 'string' ? item : item && typeof item === 'object' && 'text' in item ? String((item as {text: unknown}).text) : '').map(item => item.trim()).filter(Boolean).slice(0, 30);
  return {schema_version: '0.1', session_id: session.id, tree_id: session.tree_id, topics: [...topics.values()], questions};
}
