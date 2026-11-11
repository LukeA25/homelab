import type {CSSProperties} from 'react';
import {ArrowRight, Check, ChevronLeft} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {Badge} from '@/components/ui/badge';
import ConceptMap from '@/components/tree/ConceptMap';
import {api, place, subjectHue} from '@/model';
import {useGrove} from '@/app/useGrove';

const statuses = [['active', 'Active'], ['planned', 'Planned'], ['paused', 'Paused'], ['completed', 'Completed']] as const;

export function TreePage() {
  const {tree, concept, setConceptId, setTab, tab, setPage, run, refresh, accepted, startLesson, busy} = useGrove();
  if (!tree || !concept) return null;
  const home = place(tree.category);
  const hue = subjectHue(home.group);
  const accent = `hsl(${hue} 42% 36%)`;
  const accentSoft = `hsl(${hue} 32% 91%)`;
  const history = accepted.filter(session => session.tree_id === tree.id && session.recap?.topics.some(topic => topic.concept_id === concept.id));
  return (
    <div style={{'--accent': accent, '--accent-soft': accentSoft} as CSSProperties}>
      <Button variant="link" onClick={() => setPage('Learning paths')}><ChevronLeft size={16} /> All learning paths</Button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">{home.group}{home.subject !== home.group && <><ArrowRight size={14} />{home.subject}</>}</p>
          <h1 className="font-display text-4xl font-semibold">{tree.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{tree.goal}</p>
        </div>
        <Select value={tree.status} onValueChange={status => run(async () => {await api(`/trees/${tree.id}`, 'PATCH', {status}); await refresh();})}>
          <SelectTrigger className="w-40" style={{borderColor: accent, color: accent, background: accentSoft}} aria-label="Path status"><SelectValue /></SelectTrigger>
          <SelectContent>{statuses.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_290px]">
        <Card className="overflow-hidden">
          <div className="px-5 py-4"><h2 className="font-display text-sm">Concept map</h2></div>
          <ConceptMap tree={tree} selected={concept} onSelect={item => {setConceptId(item.id); setTab('Notes');}} />
          <div className="flex flex-wrap gap-3 px-5 py-3 text-[11px] capitalize text-[#8a9680]">{['unexplored', 'introduced', 'developing', 'understood', 'needs-review'].map(state => <span key={state} className="flex items-center gap-1"><i className={`h-2 w-2 rounded-full border border-[#ccd7c0] ${state === 'understood' ? 'bg-[#5f8058]' : state === 'developing' ? 'bg-[#a8bf90]' : state === 'introduced' ? 'bg-[#dce3b6]' : state === 'needs-review' ? 'bg-[#ddc18d]' : 'bg-[#e9ece4]'}`} />{state.replace('-', ' ')}</span>)}</div>
          <div className="border-t border-border px-5 py-5">
            <h3 className="font-display text-sm">The finish line</h3>
            {tree.outcomes.map(outcome => <p key={outcome} className="mt-2 flex items-start gap-2 text-sm" style={{color: accent}}><Check size={15} className="mt-0.5 shrink-0" /><span className="text-foreground">{outcome}</span></p>)}
            <p className="mt-4 text-xs text-muted-foreground">Outside this path: {tree.excludes || 'Not specified yet'}</p>
          </div>
        </Card>
        <Card className="flex flex-col p-6" style={{'--accent': accent} as CSSProperties}>
          <Badge className="w-fit" style={{background: accentSoft, color: accent}}>{concept.state.replace('-', ' ')}</Badge>
          {(concept.state === 'introduced' || concept.state === 'developing') && <p className="mt-3 text-sm text-muted-foreground">This concept is not counted as understood until evidence is saved.</p>}
          <h2 className="mt-4 font-display text-2xl">{concept.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{concept.summary || 'Explore this concept in a conversation and build your own explanation.'}</p>
          <Tabs value={tab} onValueChange={setTab} className="mt-4">
            <TabsList><TabsTrigger value="Notes">Notes</TabsTrigger><TabsTrigger value="Evidence">Evidence</TabsTrigger><TabsTrigger value="History">History</TabsTrigger></TabsList>
            <TabsContent value="Notes"><h3 className="font-display text-sm">Your working notes</h3><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{concept.notes || 'No accepted notes yet. After a conversation, review and save the tutor’s recap here.'}</p></TabsContent>
            <TabsContent value="Evidence"><h3 className="font-display text-sm">Self-reported confidence</h3><p className="mt-2 text-sm">{concept.confidence}</p><h3 className="mt-4 font-display text-sm">Demonstrated understanding</h3><p className="mt-2 text-sm text-muted-foreground">{concept.evidence || 'Not assessed. Exposure alone is not evidence of understanding.'}</p></TabsContent>
            <TabsContent value="History">{history.length ? history.map(session => <article key={session.id} className="mb-3"><p className="text-xs text-muted-foreground">{new Date(session.created_at).toLocaleDateString()}</p><p className="text-sm">{session.recap?.topics.find(topic => topic.concept_id === concept.id)?.summary}</p></article>) : <p className="text-sm text-muted-foreground">No saved sessions for this concept.</p>}</TabsContent>
          </Tabs>
          <div className="mt-auto pt-6">
            <Button className="w-full" style={{background: accent}} disabled={busy} onClick={() => startLesson(tree, concept)}>Learn this concept <ArrowRight size={16} /></Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">A focused conversation, at your pace.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
