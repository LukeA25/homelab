import {createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject} from 'react';
import {api, nextConcept, type Session, type Tree, type Workspace} from '@/model';

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
  preference: string;
  setPreference: (value: string) => void;
  voiceMode: string;
  voiceQuery: string;
  voiceFrame: RefObject<HTMLIFrameElement>;
  run: (fn: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<void>;
  openTree: (tree: Tree) => void;
  openVoice: (mode: string, query?: Record<string, string>) => void;
  leaveVoice: () => void;
  startLesson: (tree: Tree, concept: Tree['concepts'][number]) => Promise<void>;
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
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState('Notes');
  const [voiceMode, setVoiceMode] = useState('lesson');
  const [voiceQuery, setVoiceQuery] = useState('');
  const [preference, setPreference] = useState('');
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
    setNotice('');
    if (page !== 'Lesson') returnRef.current = page;
    setPage('Lesson');
  }
  function leaveVoice() {
    voiceFrame.current?.contentWindow?.postMessage({type: 'grove-end'}, location.origin);
    setPage(returnRef.current === 'Lesson' ? 'Today' : returnRef.current);
  }
  async function startLesson(tree: Tree, concept: Tree['concepts'][number]) {
    await run(async () => {
      const pending = data?.sessions.find(item => item.tree_id === tree.id && item.concept_id === concept.id && item.status === 'pending');
      const next = pending || await api(`/trees/${tree.id}/sessions`, 'POST', {concept_id: concept.id});
      openVoice('lesson', {session: next.id});
      await refresh();
    });
  }

  useEffect(() => {
    if (page !== 'Lesson') return;
    let cancelled = false;
    const back = () => returnRef.current === 'Lesson' ? 'Today' : returnRef.current;
    const receive = async (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== voiceFrame.current?.contentWindow) return;
      try {
        if (event.data?.type === 'grove-path-created') {
          const created = event.data.tree as Tree;
          if (cancelled || !created?.id) return;
          await refresh();
          openTree(created);
          setNotice('Path saved. Activate it when you’re ready.');
        } else if (event.data?.type === 'grove-session-closed') {
          if (cancelled) return;
          await refresh();
          setPage(back());
          setNotice('Notes saved.');
        } else if (event.data?.type === 'grove-updated' || event.data?.type === 'grove-preference') {
          if (!cancelled) await refresh();
          if (event.data?.type === 'grove-preference') setNotice('Saved for every conversation.');
        }
      } catch (reason) {
        if (!cancelled) {
          const detail = reason instanceof Error ? reason.message : 'Could not save';
          setError(detail);
          voiceFrame.current?.contentWindow?.postMessage({type: 'grove-recap-error', detail}, location.origin);
        }
      }
    };
    window.addEventListener('message', receive);
    return () => {cancelled = true; window.removeEventListener('message', receive);};
  }, [page]);

  const tree = data?.trees.find(item => item.id === treeId);
  const concept = tree?.concepts.find(item => item.id === conceptId);
  const active = data?.trees.filter(item => item.status === 'active') || [];
  const accepted = data?.sessions.filter(item => item.status === 'accepted') || [];
  const value: Grove = {
    data, page, setPage, busy, error, notice, setNotice, clearError: () => setError(''), filter, setFilter, tab, setTab, setConceptId,
    tree, concept, active, accepted, current: active[0], preference, setPreference,
    voiceMode, voiceQuery, voiceFrame,
    run, refresh, openTree, openVoice, leaveVoice, startLesson,
  };
  return <GroveContext.Provider value={value}>{children}</GroveContext.Provider>;
}
