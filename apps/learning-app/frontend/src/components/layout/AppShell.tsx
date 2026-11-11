import {Compass, GitBranch, Home, Inbox, Leaf, Plus, Settings, X} from 'lucide-react';
import {AnimatePresence, motion} from 'motion/react';
import {Button} from '@/components/ui/button';
import {TodayPage} from '@/pages/TodayPage';
import {PathsPage} from '@/pages/PathsPage';
import {TreePage} from '@/pages/TreePage';
import {ExplorePage} from '@/pages/ExplorePage';
import {IdeasPage} from '@/pages/IdeasPage';
import {SettingsPage} from '@/pages/SettingsPage';
import {useGrove} from '@/app/useGrove';

const nav = [
  ['Today', Home],
  ['Learning paths', GitBranch],
  ['Explore', Compass],
  ['Ideas', Inbox],
  ['Settings', Settings],
] as const;

export function AppShell() {
  const {data, page, setPage, setSourceIdea, error, notice, setNotice, clearError, refresh, run, leaveVoice, openVoice, voiceFrame, voiceQuery} = useGrove();
  if (page === 'Lesson') {
    return (
      <div className="fixed inset-0 z-30 flex bg-[#f8f9f5]">
        <Button variant="outline" size="icon" className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 rounded-full bg-card" aria-label="Close" onClick={leaveVoice}><X size={16} /></Button>
        {error && <p role="alert" className="absolute left-4 right-16 top-[max(0.75rem,env(safe-area-inset-top))] z-10 rounded-md bg-[#f7e7df] p-3 text-sm text-[#a34731]">{error}</p>}
        <iframe ref={voiceFrame} className="h-full w-full border-0 bg-[#f8f9f5]" title="Grove voice" src={`/voice/?${voiceQuery}`} allow="microphone; autoplay" />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background text-foreground md:pl-[235px]">
      <aside className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-[#f0f3eb]/95 backdrop-blur md:inset-y-0 md:right-auto md:w-[235px] md:flex-col md:border-r md:border-t-0 md:bg-[#f0f3eb] md:px-5 md:py-8">
        <a href="#today" className="mb-9 hidden items-center gap-2 font-display text-2xl font-bold md:flex" onClick={event => {event.preventDefault(); setPage('Today');}}><span className="grid rounded-xl bg-primary p-2 text-primary-foreground"><Leaf size={20} /></span>Grove</a>
        <nav className="flex w-full justify-around md:grid md:gap-1">{nav.map(([label, Icon], index) => (
          <button key={label} type="button" className={`flex min-w-14 flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] md:flex-row md:gap-3 md:px-3 md:py-3 md:text-sm ${page === label || (page === 'Tree' && index === 1) ? 'bg-accent font-semibold text-primary' : 'text-[#788276]'}`} onClick={() => {if (label === 'Explore') setSourceIdea(''); setPage(label);}}>
            <Icon size={18} /><span>{label}</span>{index === 3 && !!data?.ideas.length && <b className="md:ml-auto">{data.ideas.length}</b>}
          </button>
        ))}</nav>
        <button type="button" className="mt-auto hidden w-full items-center gap-3 border-t border-border pt-5 text-left text-sm font-semibold md:flex" onClick={() => setPage('Settings')}><span className="grid h-9 w-9 place-items-center rounded-full bg-[#dedfcf] text-xs">LA</span>Luke Anderson</button>
      </aside>
      <div className="pb-20 md:pb-0">
        <header className="flex h-16 items-center justify-end border-b border-border px-5 md:px-10"><Button variant="outline" size="sm" onClick={() => openVoice('capture')}><Plus size={14} /> Capture an idea</Button></header>
        {error && <div className="flex items-center justify-between gap-3 bg-[#fbe7df] px-5 py-3 text-sm text-[#9b4030]" role="alert">{error}<button type="button" aria-label="Dismiss error" onClick={clearError}><X size={16} /></button></div>}
        {notice && <div className="flex items-center justify-between gap-3 bg-[#e6efdc] px-5 py-3 text-sm text-[#49653a]" role="status">{notice}<button type="button" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}
        <main className="mx-auto max-w-[1470px] px-5 py-8 md:px-10">
          {!data ? <div><h1 className="font-display text-3xl">{error ? 'Unable to load your workspace' : 'Opening your learning space…'}</h1><Button className="mt-4" variant="outline" onClick={() => run(refresh)}>Retry</Button></div> : (
            <AnimatePresence mode="wait">
              <motion.div key={page}>
                {page === 'Today' && <TodayPage />}
                {page === 'Learning paths' && <PathsPage />}
                {page === 'Tree' && <TreePage />}
                {page === 'Explore' && <ExplorePage />}
                {page === 'Ideas' && <IdeasPage />}
                {page === 'Settings' && <SettingsPage />}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>
    </div>
  );
}
