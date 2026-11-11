import {ArrowUpRight, Church, Cpu, GitBranch, type LucideIcon} from 'lucide-react';
import {Badge} from '@/components/ui/badge';
import {conceptRank, depthColor, place, subjectHue, type Tree} from '@/model';
import {useGrove} from '@/app/useGrove';

function categoryIcon(group: string): LucideIcon {
  const key = group.toLowerCase();
  if (key === 'computer science') return Cpu;
  if (key === 'theology') return Church;
  return GitBranch;
}

export function PathCard({tree}: {tree: Tree}) {
  const {openTree} = useGrove();
  const home = place(tree.category);
  const hue = subjectHue(home.group);
  const max = Math.max(0, ...tree.concepts.map(concept => conceptRank(tree, concept.id)));
  const accent = depthColor(hue, Math.min(max, 2), Math.max(max, 2));
  const understood = tree.concepts.filter(concept => concept.state === 'understood').length;
  const Icon = categoryIcon(home.group);
  return (
    <button type="button" onClick={() => openTree(tree)} className="flex min-h-52 w-full flex-col items-stretch rounded-xl border border-border bg-card p-5 text-left shadow-sm transition-colors hover:border-[#9aac8c]" style={{borderTopWidth: 4, borderTopColor: accent.background}}>
      <div className="mb-4 flex w-full items-center gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{background: depthColor(hue, 0, Math.max(max, 1)).background, color: `hsl(${hue} 24% 34%)`}}><Icon size={20} /></span>
        <Badge>{tree.status}</Badge>
      </div>
      {home.subject !== home.group && <p className="text-xs text-muted-foreground">{home.subject}</p>}
      <h3 className="mt-1 font-display text-lg font-semibold leading-snug">{tree.title}</h3>
      <div className="mt-auto flex gap-1 pt-5">{tree.concepts.map(concept => {
        const tone = depthColor(hue, conceptRank(tree, concept.id), max);
        return <span key={concept.id} title={concept.state.replace('-', ' ')} className="h-2 flex-1 rounded-full" style={{background: tone.background, boxShadow: concept.state === 'needs-review' ? 'inset 0 -3px 0 #c9aa70' : undefined, opacity: concept.state === 'unexplored' ? 0.45 : 1}} />;
      })}</div>
      <footer className="mt-3 flex items-center justify-between text-xs text-muted-foreground" title="Introduced or developing concepts stay out of this count until evidence is saved.">
        <span>{understood} of {tree.concepts.length} understood</span>
        <ArrowUpRight size={16} />
      </footer>
    </button>
  );
}
