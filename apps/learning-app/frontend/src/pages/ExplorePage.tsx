import {ArrowRight, Compass, MessageCircle} from 'lucide-react';
import {motion} from 'motion/react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {api} from '@/model';
import {useGrove} from '@/app/useGrove';

export function ExplorePage() {
  const {data, draft, setDraft, sourceIdea, busy, run, refresh, openTree, setNotice, setSourceIdea, openVoice} = useGrove();
  return (
    <motion.div initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} transition={{duration: 0.25}}>
      <h1 className="font-display text-4xl font-semibold">Plan a learning path</h1>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">Talk it through, edit the draft, then save.</p>
      {!!data?.drafts?.length && <Button className="mt-4" variant="outline" onClick={() => {const saved = data.drafts?.[0]; if (!saved) return; setSourceIdea(saved.idea_id || ''); setDraft({title: saved.title, category: saved.category, goal: saved.goal, depth: saved.depth, excludes: saved.excludes, outcomes: saved.outcomes.join('\n'), concepts: saved.concepts.join('\n')});}}>Open saved draft</Button>}
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(250px,1fr)]">
        <form className="rounded-xl border border-border bg-card p-6" onSubmit={event => {event.preventDefault(); run(async () => {const tree = await api('/trees', 'POST', {...draft, outcomes: draft.outcomes.split('\n').filter(line => line.trim()), concepts: draft.concepts.split('\n').filter(line => line.trim()), ...(sourceIdea ? {idea_id: sourceIdea} : {})}); setSourceIdea(''); await refresh(); openTree(tree); setNotice('Path saved as planned. Activate it when you’re ready.');});}}>
          <div className="grid gap-4">
            <Label>Give your path a name<Input required maxLength={150} className="mt-2" value={draft.title} onChange={event => setDraft({...draft, title: event.target.value})} placeholder="e.g. Machine learning foundations" /></Label>
            <Label>What do you want to be able to do?<Textarea required className="mt-2" value={draft.goal} onChange={event => setDraft({...draft, goal: event.target.value})} placeholder="I want to explain…" /></Label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Label>Subject / folder<Input required className="mt-2" value={draft.category} onChange={event => setDraft({...draft, category: event.target.value})} /></Label>
              <Label>How deep?
                <Select value={draft.depth} onValueChange={depth => setDraft({...draft, depth})}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>{['Conversational fluency', 'Interview readiness', 'Technical mastery'].map(depth => <SelectItem key={depth} value={depth}>{depth}</SelectItem>)}</SelectContent>
                </Select>
              </Label>
            </div>
            <Label>Learning outcomes <span className="block text-xs font-normal text-muted-foreground">One capability per line</span><Textarea required className="mt-2" value={draft.outcomes} onChange={event => setDraft({...draft, outcomes: event.target.value})} placeholder="Explain how a model learns from examples" /></Label>
            <Label>Concepts to explore <span className="block text-xs font-normal text-muted-foreground">One per line, foundations first.</span><Textarea required className="mt-2" value={draft.concepts} onChange={event => setDraft({...draft, concepts: event.target.value})} /></Label>
            <Label>What’s outside this path?<Input className="mt-2" value={draft.excludes} onChange={event => setDraft({...draft, excludes: event.target.value})} placeholder="Keep the finish line within reach" /></Label>
            {sourceIdea && <p className="text-sm text-muted-foreground">Linked to a saved idea.</p>}
            <Button disabled={busy}>Save planned path <ArrowRight size={16} /></Button>
          </div>
        </form>
        <aside className="px-2 text-[#819571]">
          <Compass size={28} />
          <h2 className="mt-4 font-display text-2xl text-foreground">Plan a learning path</h2>
          <p className="mt-3 text-sm">Talk through what you want to get out of it, what you already know, how deep to go, and where it should finish.</p>
          <Button className="mt-6" variant="outline" onClick={() => openVoice('plan', sourceIdea ? {idea: sourceIdea} : {})}><MessageCircle size={16} /> {sourceIdea ? 'Plan this idea' : 'Plan a learning path'}</Button>
        </aside>
      </div>
    </motion.div>
  );
}
