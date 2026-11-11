import {Check, Inbox, MessageCircle, Plus, X} from 'lucide-react';
import {motion} from 'motion/react';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {api, type IdeaDraft} from '@/model';
import {emptyDraft, useGrove} from '@/app/useGrove';

export function IdeasPage() {
  const {data, idea, setIdea, ideaDrafts, setIdeaDrafts, openVoice, planIdea, run, refresh, busy, setNotice} = useGrove();
  const ideas = data?.ideas || [];
  return (
    <motion.div initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} transition={{duration: 0.25}}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="font-display text-4xl font-semibold">Ideas</h1><p className="mt-2 max-w-xl text-sm text-muted-foreground">Save an interest now. Turn it into a path later.</p></div>
        <Button variant="outline" onClick={() => openVoice('interview')}><MessageCircle size={16} /> Talk through my ideas</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => openVoice('capture')}><Plus size={16} /> Capture an idea</Button>
      </div>
      <form className="mt-6 max-w-2xl" onSubmit={event => {event.preventDefault(); setIdeaDrafts([{...emptyDraft(), idea, source: idea}]);}}>
        <Label>Or write it here<Textarea required maxLength={4000} className="mt-2" value={idea} onChange={event => setIdea(event.target.value)} placeholder="What would you like to explore?" /></Label>
        <Button className="mt-3" variant="outline" disabled={busy}>Review draft</Button>
      </form>
      {ideaDrafts && <div className="mt-6 max-w-2xl">
        <h2 className="font-display text-xl">Review ideas</h2>
        <p className="mt-2 rounded-md bg-secondary p-3 text-sm">Nothing is saved yet. Edit, merge, or omit drafts, then save the ones you want.</p>
        {ideaDrafts.map((item, index) => <DraftCard key={index} item={item} index={index} />)}
        <Button className="mt-3" disabled={busy || !ideaDrafts.length} onClick={() => run(async () => {await api('/ideas/batch', 'POST', {ideas: ideaDrafts.map(({title, idea: body, why, direction, starting_point, source, suggestion}) => ({title, idea: body, why, direction, starting_point, source, suggestion}))}); setIdea(''); setIdeaDrafts(null); await refresh(); setNotice('Ideas saved.');})}><Check size={16} /> Save ideas</Button>
      </div>}
      <div className="mt-6 grid gap-3">
        {ideas.length ? ideas.map(item => (
          <Card key={item.id} className="flex flex-wrap items-start justify-between gap-4 p-5">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</p>
              <h2 className="mt-1 font-display text-lg">{item.title || 'Untitled idea'}</h2>
              {item.title || item.idea ? <>
                {item.idea && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.idea}</p>}
                {item.why && <p className="mt-2 text-sm">Why it interests you: {item.why}</p>}
                {item.direction && <p className="mt-1 text-sm">Direction: {item.direction}</p>}
                {item.starting_point && <p className="mt-1 text-sm">Starting point: {item.starting_point}</p>}
                {item.suggestion && <p className="mt-2 rounded-md bg-[#f6f3ea] p-2 text-sm">Suggestion: {item.suggestion}</p>}
                {item.source && <p className="mt-1 text-sm text-muted-foreground">Source: {item.source}</p>}
              </> : <p className="mt-2 whitespace-pre-wrap text-sm">{item.text}</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => planIdea(item)}>Plan this idea</Button>
              <Button variant="ghost" size="icon" aria-label="Delete idea" onClick={() => run(async () => {await api(`/ideas/${item.id}`, 'DELETE'); await refresh();})}><X size={16} /></Button>
            </div>
          </Card>
        )) : <div className="rounded-xl border border-dashed border-[#d7e0ce] px-6 py-16 text-center text-[#9aaa8c]"><Inbox className="mx-auto" size={32} /><h2 className="mt-4 font-display text-lg text-foreground">No ideas yet.</h2><p className="mt-2 text-sm">Capture a fragment, or talk through what has been on your mind.</p></div>}
      </div>
    </motion.div>
  );
}

function DraftCard({item, index}: {item: IdeaDraft; index: number}) {
  const {editDraft, ideaDrafts, setIdeaDrafts} = useGrove();
  if (!ideaDrafts) return null;
  return (
    <div className="mt-3 rounded-lg border border-border bg-card p-4">
      {(['title', 'idea', 'why', 'direction', 'starting_point', 'source'] as const).map(field => (
        <Label key={field} className="mt-3 block capitalize">{field.replace('_', ' ')}{field === 'title' ? <Input className="mt-1 font-normal normal-case" value={item[field]} onChange={event => editDraft(index, {[field]: event.target.value})} /> : <Textarea className="mt-1 font-normal normal-case" value={item[field]} onChange={event => editDraft(index, {[field]: event.target.value})} />}</Label>
      ))}
      {item.suggestion && <p className="mt-3 rounded-md bg-[#f6f3ea] p-2 text-sm">Suggestion, kept separate: {item.suggestion}</p>}
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={index === ideaDrafts.length - 1} onClick={() => setIdeaDrafts(list => list && list.length > 1 ? list.flatMap((entry, entryIndex) => entryIndex === index ? [] : entryIndex === index + 1 ? [{...emptyDraft(), ...entry, title: item.title || entry.title, idea: [item.idea, entry.idea].filter(Boolean).join('\n'), why: [item.why, entry.why].filter(Boolean).join('\n'), direction: [item.direction, entry.direction].filter(Boolean).join('\n'), starting_point: [item.starting_point, entry.starting_point].filter(Boolean).join('\n'), source: [item.source, entry.source].filter(Boolean).join('\n'), suggestion: [item.suggestion, entry.suggestion].filter(Boolean).join('\n')}] : [entry]) : list)}>Merge with next</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setIdeaDrafts(list => list?.filter((_, entryIndex) => entryIndex !== index) || null)}>Omit</Button>
      </div>
    </div>
  );
}
