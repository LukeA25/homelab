const activations = {
  linear: value => value,
  relu: value => Math.max(0, value),
  sigmoid: value => 1 / (1 + Math.exp(-value)),
};

function nodes(spec) {
  return spec.layers.flatMap(layer => layer.nodes);
}

export function forward(spec) {
  const values = new Map(nodes(spec).map(node => [node.id, Number.isFinite(node.value) ? node.value : null]));
  const incoming = new Map([...values.keys()].map(id => [id, []]));
  for (const edge of spec.connections || []) incoming.get(edge.to)?.push(edge);
  for (const layer of spec.layers) {
    const activate = activations[layer.activation || 'linear'];
    for (const node of layer.nodes) {
      const weighted = (incoming.get(node.id) || []).filter(edge => Number.isFinite(edge.weight));
      if (!weighted.length) continue;
      const sum = weighted.reduce((total, edge) => total + edge.weight * (values.get(edge.from) || 0), node.bias || 0);
      values.set(node.id, activate(sum));
    }
  }
  return Object.fromEntries(values);
}

export function withSlider(spec, next) {
  if (!spec.slider) throw Error('This network has no slider');
  const min = spec.slider.min ?? 0, max = spec.slider.max ?? 1;
  if (typeof next !== 'number' || !Number.isFinite(next) || next < min || next > max) throw Error('Invalid slider value');
  const copy = structuredClone(spec);
  copy.slider.value = next;
  for (const node of nodes(copy)) if (node.id === copy.slider.node) node.value = next;
  return copy;
}
