import {ArrowRight, ArrowUpRight, BookOpen, Compass, MessageCircle, Sparkles} from 'lucide-react';
import {motion} from 'motion/react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {PathCard} from '@/components/paths/PathCard';
import {nextConcept} from '@/model';
import {useGrove} from '@/app/useGrove';

const suggestions = [
  {name: 'Statistics for machine learning', why: 'A bridge from probability to the models you want to understand.', concepts: 'Random variables\nExpectation\nStatistical estimation'},
  {name: 'Networking behind your homelab', why: 'Make sense of DNS, reverse proxies, and the routes your requests take.', concepts: 'DNS\nReverse proxies\nPrivate networking'},
];

export function TodayPage() {
  const {current, active, accepted, busy, openTree, startLesson, setPage, setDraft, draft} = useGrove();
  const next = current ? nextConcept(current) : undefined;
  return (
    <motion.div initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} transition={{duration: 0.25}}>
      <div className="mb-6 flex items-center justify-between"><h1 className="font-display text-4xl font-semibold">Today</h1><span className="text-sm text-muted-foreground">{new Date().toLocaleDateString(undefined, {month: 'short', day: 'numeric', weekday: 'short'})}</span></div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2.7fr)_minmax(220px,1fr)]">
        <section className="relative flex min-h-72 overflow-hidden rounded-xl border border-[#dce5d4] bg-secondary p-7">
          <div className="relative z-10 max-w-xl">
            <h2 className="font-display text-3xl font-semibold">{next ? next.title : 'Choose a path'}</h2>
            <p className="mt-2 max-w-md text-sm text-[#6b7b63]">{current ? (next?.summary || current.title) : 'Plan a path, or open one you already have.'}</p>
            <p className="mt-4 flex items-center gap-2 text-xs text-[#7e8c73]"><MessageCircle size={15} /> Voice lesson</p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <Button disabled={busy} onClick={() => current && next ? startLesson(current, next) : setPage('Explore')}>{current ? 'Start voice lesson' : 'Plan a path'} <ArrowRight size={16} /></Button>
              {current && <Button variant="link" onClick={() => openTree(current)}>Open this path <ArrowUpRight size={14} /></Button>}
            </div>
          </div>
          <svg className="pointer-events-none absolute right-2 top-5 hidden h-56 w-[34%] md:block" viewBox="0 0 260 250" aria-hidden="true"><path d="M35 190 Q110 190 120 125 T225 50 M120 125 Q180 130 220 175 M80 180 Q65 110 35 75" fill="none" stroke="#90a888" strokeWidth="1.5" />{[[35, 190], [120, 125], [225, 50], [220, 175], [35, 75], [80, 180]].map(([x, y], index) => <g key={index}><circle cx={x} cy={y} r={index === 1 ? 24 : 14} fill={index === 1 ? '#426846' : '#e5ecde'} stroke="#789672" /><circle cx={x} cy={y} r="4" fill={index === 1 ? '#fff' : '#789672'} /></g>)}</svg>
        </section>
        <Card className="hidden lg:block"><CardHeader><CardTitle>Progress</CardTitle></CardHeader><CardContent><p className="font-display text-4xl">{accepted.length}</p><p className="text-sm text-muted-foreground">{accepted.length === 1 ? 'session reviewed' : 'sessions reviewed'}</p><div className="my-4 border-t border-border" /><p className="text-xs text-muted-foreground">{active.length} active {active.length === 1 ? 'path' : 'paths'}</p></CardContent></Card>
      </div>
      <div className="mb-4 mt-8 flex items-center justify-between"><h2 className="font-display text-xl">Active paths <span className="ml-2 rounded-md border border-border px-1.5 text-xs">{active.length}</span></h2><Button variant="link" onClick={() => setPage('Learning paths')}>All paths <ArrowRight size={16} /></Button></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{active.map(tree => <PathCard key={tree.id} tree={tree} />)}</div>
      <div className="mb-4 mt-10"><h2 className="flex items-center justify-between font-display text-xl">Suggested paths <Sparkles size={18} /></h2><p className="text-sm text-muted-foreground">Examples, not an assessment of what you know.</p></div>
      <div className="grid gap-4 md:grid-cols-2">{suggestions.map((item, index) => (
        <button key={item.name} type="button" className="flex items-center gap-4 rounded-xl border border-[#e6e8df] bg-[#f0f1e9] p-5 text-left" onClick={() => {setDraft({...draft, title: item.name, goal: item.why, concepts: item.concepts}); setPage('Explore');}}>
          <span className={`grid h-10 w-10 place-items-center rounded-lg ${index ? 'bg-[#e9e4d7] text-[#a3916b]' : 'bg-[#e4e8d8] text-[#82906c]'}`}>{index ? <Compass size={18} /> : <BookOpen size={18} />}</span>
          <span><span className="font-display text-sm font-semibold">{item.name}</span><span className="mt-1 block text-xs text-muted-foreground">{item.why}</span></span>
          <ArrowUpRight className="ml-auto shrink-0 text-[#8b987d]" size={18} />
        </button>
      ))}</div>
    </motion.div>
  );
}
