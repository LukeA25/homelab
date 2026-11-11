import {createContext, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction} from 'react';
import {api, nextConcept, type IdeaDraft, type Recap, type Session, type Tree, type Workspace} from '@/model';
import {lessonRecap} from '@/features/voice/lessonRecap';

export type PathForm = {title: string; category: string; goal: string; depth: string; excludes: string; outcomes: string; concepts: string};
export const emptyDraft = (): IdeaDraft => ({title: '', idea: '', why: '', direction: '', starting_point: '', source: '', suggestion: ''});
const emptyPath = (): PathForm => ({title: '', category: 'Computer Science', goal: '', depth: 'Conversational fluency', excludes: '', outcomes: '', concepts: ''});

type Grove = {
  data: Workspace | null;
  page: string;
  setPage: (page: string) => void;
  busy: boolean;
  error: string;
  notice: string;
  setNotice: (value: string) => void;
  clearError: () => void;
  filter: string;
  setFilter: (value: string) => void;
  tab: string;
  setTab: (value: string) => void;
  setConceptId: (value: string) => void;
  tree?: Tree;
  concept?: Tree['concepts'][number];
  active: Tree[];
  accepted: Session[];
  current?: Tree;
  draft: PathForm;
  setDraft: (value: PathForm) => void;
  sourceIdea: string;
  setSourceIdea: (value: string) => void;
  preference: string;
  setPreference: (value: string) => void;
  idea: string;
  setIdea: (value: string) => void;
  ideaDrafts: IdeaDraft[] | null;
  setIdeaDrafts: Dispatch<SetStateAction<IdeaDraft[] | null>>;
  editDraft: (index: number, patch: Partial<IdeaDraft>) => void;
  voiceMode: string;
  voiceQuery: string;
  voiceFrame: RefObject<HTMLIFrameElement>;
  run: (fn: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<void>;
  openTree: (tree: Tree) => void;
  openVoice: (mode: string, query?: Record<string, string>) => void;
  leaveVoice: () => void;
  startLesson: (tree: Tree, concept: Tree['concepts'][number]) => Promise<void>;
  planIdea: (idea: Workspace['ideas'][number]) => void;
};

const GroveContext = createContext<Grove | null>(null);
export function useGrove() {
  const value = useContext(GroveContext);
  if (!value) throw new Error('useGrove must be used inside GroveProvider');
  return value;
}

export function GroveProvider({children}: {children: ReactNode}) {
  const [data, setData] = useState<Workspace | null>(null);
  const [page, setPage] = useState('Today');
  const [treeId, setTreeId] = useState('');
  const [conceptId, setConceptId] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [idea, setIdea] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState('Notes');
  const [voiceMode, setVoiceMode] = useState('lesson');
  const [voiceQuery, setVoiceQuery] = useState('');
  const [ideaDrafts, setIdeaDrafts] = useState<IdeaDraft[] | null>(null);
  const [sourceIdea, setSourceIdea] = useState('');
  const [draft, setDraft] = useState<PathForm>(emptyPath);
  const [preference, setPreference] = useState('');
  const reviewRef = useRef<Recap | null>(null);
  const pendingRef = useRef<{kind: 'ideas'; ideas: IdeaDraft[]} | {kind: 'path'; draft: Record<string, unknown>} | null>(null);
  const voiceIdeaRef = useRef('');
  const returnRef = useRef('Today');
  const voiceFrame = useRef<HTMLIFrameElement>(null);

  async function refresh() {setData(await api('/workspace'));}
  useEffect(() => {refresh().catch(reason => setError(reason instanceof Error ? reason.message : 'Could not load'));}, []);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {await fn();}
    catch (reason) {setError(reason instanceof Error ? reason.message : 'Something went wrong');}
    finally {setBusy(false);}
  }
  function openTree(tree: Tree) {setTreeId(tree.id); setConceptId(nextConcept(tree).id); setPage('Tree'); setTab('Notes');}
  function openVoice(mode: string, query: Record<string, string> = {}) {
    setVoiceMode(mode);
    setVoiceQuery(new URLSearchParams({mode, ...query}).toString());
    reviewRef.current = null;
    pendingRef.current = null;
    voiceIdeaRef.current = query.idea || '';
    setIdeaDrafts(null);
    setNotice('');
    if (page !== 'Lesson') returnRef.current = page;
    setPage('Lesson');
  }
  function leaveVoice() {
    voiceFrame.current?.contentWindow?.postMessage({type: 'grove-end'}, location.origin);
    reviewRef.current = null;
    pendingRef.current = null;
    sessionStorage.removeItem('grove-review');
    setPage(returnRef.current === 'Lesson' ? 'Today' : returnRef.current);
  }
  async function startLesson(tree: Tree, concept: Tree['concepts'][number]) {
    await run(async () => {
      const pending = data?.sessions.find(item => item.tree_id === tree.id && item.concept_id === concept.id && item.status === 'pending');
      const next = pending || await api(`/trees/${tree.id}/sessions`, 'POST', {concept_id: concept.id});
      setSession(next);
      openVoice('lesson', {session: next.id});
      await refresh();
    });
  }
  function planIdea(item: Workspace['ideas'][number]) {
    setSourceIdea(item.id);
    setDraft({title: item.title || '', category: 'General', goal: item.direction || item.idea || item.text || '', depth: 'Conversational fluency', excludes: '', outcomes: '', concepts: ''});
    setPage('Explore');
  }
  function editDraft(index: number, patch: Partial<IdeaDraft>) {
    setIdeaDrafts(list => list ? list.map((item, itemIndex) => itemIndex === index ? {...item, ...patch} : item) : list);
  }

  useEffect(() => {
    if (page !== 'Lesson') return;
    let cancelled = false;
    const back = () => returnRef.current === 'Lesson' ? 'Today' : returnRef.current;
    const receive = async (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== voiceFrame.current?.contentWindow) return;
      try {
        const tell = (type: string, extra: Record<string, unknown> = {}) => voiceFrame.current?.contentWindow?.postMessage({type, ...extra}, location.origin);
        if (event.data?.type === 'grove-recap') {
          if (!session) throw Error('Open the lesson again before reviewing');
          const concepts = data?.trees.find(tree => tree.id === session.tree_id)?.concepts || [];
          const proposal = await api('/import/preview', 'POST', lessonRecap(event.data.recap || {}, session, concepts)) as Recap;
          if (cancelled) return;
          reviewRef.current = proposal;
          sessionStorage.setItem('grove-review', JSON.stringify(proposal));
          const titles = Object.fromEntries(concepts.map(item => [item.id, item.title]));
          tell('grove-recap-show', {topics: proposal.topics.map(topic => ({title: titles[topic.concept_id] || 'Concept', state: topic.state, summary: topic.summary, evidence: topic.evidence, confidence: topic.confidence}))});
        } else if (event.data?.type === 'grove-accept') {
          let proposal = reviewRef.current;
          if (!proposal) {
            try { proposal = JSON.parse(sessionStorage.getItem('grove-review') || 'null') as Recap | null; } catch { proposal = null; }
          }
          if (!proposal || (session && proposal.session_id !== session.id)) {
            setError('The summary is not ready to save.');
            tell('grove-save-error', {detail: 'The summary is not ready to save.'});
            return;
          }
          await api('/import/accept', 'POST', proposal);
          if (cancelled) return;
          reviewRef.current = null;
          sessionStorage.removeItem('grove-review');
          await refresh();
          tell('grove-saved');
          setPage(back());
          setNotice('Recap saved.');
        } else if (event.data?.type === 'grove-preference') {
          if (!cancelled) {await refresh(); setNotice('Saved for every conversation.');}
        } else if (event.data?.type === 'grove-ideas') {
          const proposal = await api('/ideas/preview', 'POST', {ideas: event.data.ideas});
          if (cancelled) return;
          const ideas = proposal.ideas.map((item: IdeaDraft) => ({...emptyDraft(), ...item}));
          pendingRef.current = {kind: 'ideas', ideas: ideas.map(({title, idea: body, why, direction, starting_point, source, suggestion}: IdeaDraft) => ({title, idea: body, why, direction, starting_point, source, suggestion}))};
          voiceFrame.current?.contentWindow?.postMessage({type: 'grove-ideas-show', ideas}, location.origin);
        } else if (event.data?.type === 'grove-ideas-accept') {
          const pending = pendingRef.current;
          if (pending?.kind !== 'ideas') return;
          await api('/ideas/batch', 'POST', {ideas: pending.ideas});
          if (cancelled) return;
          pendingRef.current = null;
          await refresh();
          setPage(back());
          setNotice('Ideas saved.');
        } else if (event.data?.type === 'grove-path') {
          const incoming = event.data.draft || {};
          const proposal = await api('/drafts/preview', 'POST', {...incoming, ...(voiceIdeaRef.current ? {idea_id: voiceIdeaRef.current} : {})});
          if (cancelled) return;
          pendingRef.current = {kind: 'path', draft: proposal};
          voiceFrame.current?.contentWindow?.postMessage({type: 'grove-path-show', draft: proposal}, location.origin);
        } else if (event.data?.type === 'grove-path-accept') {
          const pending = pendingRef.current;
          if (pending?.kind !== 'path') return;
          const proposal = await api('/drafts', 'POST', pending.draft);
          if (cancelled) return;
          pendingRef.current = null;
          setDraft({title: proposal.title || '', category: proposal.category || 'General', goal: proposal.goal || '', depth: proposal.depth || 'Conversational fluency', excludes: proposal.excludes || '', outcomes: (proposal.outcomes || []).join('\n'), concepts: (proposal.concepts || []).join('\n')});
          setSourceIdea(proposal.idea_id || '');
          setPage('Explore');
          setNotice('Edit the draft, then save the path.');
        }
      } catch (reason) {
        if (!cancelled) {
          const detail = reason instanceof Error ? reason.message : 'Could not validate the draft';
          setError(detail);
          const frame = voiceFrame.current?.contentWindow;
          frame?.postMessage({type: 'grove-recap-error', detail}, location.origin);
          frame?.postMessage({type: 'grove-save-error', detail}, location.origin);
        }
      }
    };
    window.addEventListener('message', receive);
    return () => {cancelled = true; window.removeEventListener('message', receive);};
  }, [page, session, data]);

  const tree = data?.trees.find(item => item.id === treeId);
  const concept = tree?.concepts.find(item => item.id === conceptId);
  const active = data?.trees.filter(item => item.status === 'active') || [];
  const accepted = data?.sessions.filter(item => item.status === 'accepted') || [];
  const value: Grove = {
    data, page, setPage, busy, error, notice, setNotice, clearError: () => setError(''), filter, setFilter, tab, setTab, setConceptId,
    tree, concept, active, accepted, current: active[0], draft, setDraft, sourceIdea, setSourceIdea, preference, setPreference,
    idea, setIdea, ideaDrafts, setIdeaDrafts, editDraft, voiceMode, voiceQuery, voiceFrame,
    run, refresh, openTree, openVoice, leaveVoice, startLesson, planIdea,
  };
  return <GroveContext.Provider value={value}>{children}</GroveContext.Provider>;
}
