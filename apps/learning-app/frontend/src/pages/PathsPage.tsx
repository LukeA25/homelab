import {Plus, Search} from 'lucide-react';
import {motion} from 'motion/react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {PathCard} from '@/components/paths/PathCard';
import {groupTrees, subjectHue} from '@/model';
import {useGrove} from '@/app/useGrove';

export function PathsPage() {
  const {data, filter, setFilter, setPage} = useGrove();
  const trees = (data?.trees || []).filter(tree => (tree.title + tree.category).toLowerCase().includes(filter.toLowerCase()));
  return (
    <motion.div initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} transition={{duration: 0.25}}>
      <div className="mb-6 flex items-center justify-between gap-4"><h1 className="font-display text-4xl font-semibold">Learning paths</h1><Button onClick={() => setPage('Explore')}><Plus size={16} /> New path</Button></div>
      <label className="mb-6 flex max-w-md items-center gap-2 rounded-md border border-border bg-card px-3 text-muted-foreground"><Search size={16} /><Input className="border-0 bg-transparent shadow-none focus-visible:ring-0" placeholder="Find a path or subject…" value={filter} onChange={event => setFilter(event.target.value)} /></label>
      {groupTrees(trees).map(([group, shelf]) => {
        const hue = subjectHue(group);
        return (
          <section key={group} className="mb-6 rounded-2xl px-4 py-4" style={{background: `hsl(${hue} 26% 95%)`}}>
            <h2 className="mb-3 font-display text-2xl" style={{color: `hsl(${hue} 24% 34%)`}}>{group}</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{shelf.map(tree => <PathCard key={tree.id} tree={tree} />)}</div>
          </section>
        );
      })}
    </motion.div>
  );
}
