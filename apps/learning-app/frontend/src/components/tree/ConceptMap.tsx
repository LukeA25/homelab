import {conceptRank, place, subjectHue, type Concept, type Tree} from '@/model';

export default function ConceptMap({tree, selected, onSelect}: {tree: Tree; selected: Concept; onSelect: (concept: Concept) => void}) {
  const width = Math.max(...tree.concepts.map(concept => concept.x)) + 240;
  const hue = subjectHue(place(tree.category).group);
  const max = Math.max(0, ...tree.concepts.map(concept => conceptRank(tree, concept.id)));
  const line = `hsl(${hue} 18% 70%)`;
  return (
    <div className="overflow-auto overscroll-x-contain bg-[radial-gradient(#d5dece_1px,transparent_1px)] bg-[size:20px_20px] bg-[#fafbf7]" aria-label="Concept map; scroll horizontally to explore">
      <div className="relative h-[440px]" style={{width}}>
        <svg width={width} height="440" className="absolute inset-0" aria-hidden="true">
          <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke={line} /></marker></defs>
          {tree.concepts.flatMap(concept => concept.requires.map(id => {
            const previous = tree.concepts.find(node => node.id === id);
            return previous ? <path key={id + concept.id} d={`M${previous.x + 130},${previous.y + 25} C${previous.x + 205},${previous.y + 25} ${concept.x - 65},${concept.y + 25} ${concept.x},${concept.y + 25}`} fill="none" stroke={line} strokeWidth="1.5" markerEnd="url(#arrow)" /> : null;
          }))}
        </svg>
        {tree.concepts.map(concept => {
          const step = max <= 0 ? 0 : conceptRank(tree, concept.id) / max;
          const edge = `hsl(${hue} ${Math.round(32 + step * 38)}% ${Math.round(68 - step * 30)}%)`;
          return (
            <button key={concept.id} type="button" className="absolute w-[135px] min-h-[88px] rounded-[10px] border border-[#d8e1d0] bg-[#fafcf8] px-2 py-2 text-center text-foreground" style={{left: concept.x, top: concept.y, borderTop: `3px solid ${edge}`, outline: selected.id === concept.id ? '2px solid var(--accent)' : undefined, outlineOffset: selected.id === concept.id ? 2 : undefined, boxShadow: [selected.id === concept.id ? '0 0 0 4px var(--accent-soft)' : '', concept.state === 'needs-review' ? 'inset 0 -4px 0 #c9aa70' : ''].filter(Boolean).join(', ') || undefined}} onClick={() => onSelect(concept)}>
              <span className="block text-xl leading-none text-[#98a88d]">{concept.state === 'understood' ? '✓' : concept.state === 'unexplored' ? '○' : '◉'}</span>
              <strong className="mt-1 block text-[11px] font-medium">{concept.title}</strong>
              <small className="mt-1 block text-[10px] capitalize text-muted-foreground">{concept.state.replace('-', ' ')}</small>
            </button>
          );
        })}
        <span className="absolute bottom-6 left-7 text-[11px] text-[#9aa68d]">Foundations <span className="mx-4">→</span> Later concepts</span>
      </div>
    </div>
  );
}
