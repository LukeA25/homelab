const kinds = ['text', 'equation', 'plot', 'chart', 'diagram', 'neural', 'clear'];
const functions = {
  relu: x => Math.max(0, x), sigmoid: x => 1 / (1 + Math.exp(-x)),
  linear: x => x, quadratic: x => x * x, sin: x => Math.sin(x),
};
export function validateVisual(spec) {
  if (!spec || !kinds.includes(spec.kind)) throw Error('Unsupported visual kind');
  if (JSON.stringify(spec).length > 30000) throw Error('Visual is too large');
  for (const field of ['title', 'caption', 'equation']) {
    if (spec[field] !== undefined && (typeof spec[field] !== 'string' || spec[field].length > 1500)) throw Error(`Invalid ${field}`);
  }
  if (spec.kind === 'equation' && !spec.equation) throw Error('Supply a LaTeX equation');
  if (spec.kind === 'diagram') {
    if (!Array.isArray(spec.nodes) || spec.nodes.length < 1 || spec.nodes.length > 16) throw Error('Supply 1–16 nodes');
    const ids = new Set();
    for (const node of spec.nodes) {
      if (typeof node.id !== 'string' || typeof node.label !== 'string' || node.label.length > 60 || ids.has(node.id)) throw Error('Invalid or duplicate node');
      ids.add(node.id);
    }
    if (!Array.isArray(spec.edges) || spec.edges.length > 40) throw Error('Supply at most 40 edges');
    for (const edge of spec.edges) {
      if (!ids.has(edge.from) || !ids.has(edge.to) || (edge.label !== undefined && typeof edge.label !== 'string')) throw Error('Invalid edge');
    }
    if (spec.highlight !== undefined && (!Array.isArray(spec.highlight) || spec.highlight.some(id => !ids.has(id)))) throw Error('Unknown highlight node');
  }
  if (spec.kind === 'plot' || spec.kind === 'chart') {
    if (spec.function !== undefined) {
      if (!Object.hasOwn(functions, spec.function)) throw Error('Unsupported function');
      for (const field of ['a','b','xMin','xMax']) {
        if (spec[field] !== undefined && (!Number.isFinite(spec[field]) || Math.abs(spec[field]) > 10000)) throw Error(`Invalid ${field}`);
      }
      if ((spec.xMin ?? -4) >= (spec.xMax ?? 4)) throw Error('xMin must be smaller than xMax');
    } else {
      if (!Array.isArray(spec.series) || spec.series.length < 1 || spec.series.length > 5) throw Error('Supply 1–5 series');
      for (const series of spec.series) {
        if (typeof series.label !== 'string' || !Array.isArray(series.points) || series.points.length < 1 || series.points.length > 200) throw Error('Invalid series');
        for (const point of series.points) {
          if (![point.x,point.y].every(n => Number.isFinite(n) && Math.abs(n) <= 1e9)) throw Error('Invalid point');
        }
      }
    }
  }
  return structuredClone(spec);
}
export function plotSeries(spec) {
  if (!spec.function) return spec.series;
  const lo = spec.xMin ?? -4, hi = spec.xMax ?? 4;
  return [{label: spec.function, points: Array.from({length:161}, (_, i) => {
    const x = lo + (hi - lo) * i / 160;
    return {x, y:(spec.a ?? 1) * functions[spec.function](x) + (spec.b ?? 0)};
  })}];
}
