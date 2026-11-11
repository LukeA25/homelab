import {forward, withSlider} from './model.mjs';

const NS = 'http://www.w3.org/2000/svg';

function element(tag, attributes, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function linesOf(label, width = 16) {
  const words = (label || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const parts = word.length > width ? word.match(new RegExp(`.{1,${width}}`, 'g')) : [word];
    for (const part of parts) {
      if (!line) line = part;
      else if (`${line} ${part}`.length <= width) line += ` ${part}`;
      else { lines.push(line); line = part; }
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function edgesOf(spec) {
  if (spec.connections?.length) return spec.connections;
  const edges = [];
  for (let index = 0; index < spec.layers.length - 1; index++) {
    for (const from of spec.layers[index].nodes) {
      for (const to of spec.layers[index + 1].nodes) edges.push({from: from.id, to: to.id});
    }
  }
  return edges;
}

export function createNetwork(onChange) {
  const svg = document.getElementById('network');
  const caption = document.getElementById('caption');
  const readout = document.getElementById('neural-readout');
  const sliderWrap = document.getElementById('slider-wrap');
  const sliderLabel = document.getElementById('slider-label');
  const sliderValue = document.getElementById('slider-value');
  const slider = document.getElementById('slider');
  let spec = null, animationFrame = 0, animStart = 0;

  function render() {
    const values = forward(spec);
    const positions = new Map();
    const layers = spec.layers;
    svg.replaceChildren();
    svg.setAttribute('aria-label', spec.title || 'Neural network');
    const defs = element('defs');
    const marker = element('marker', {id: 'net-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto-start-reverse'});
    marker.append(element('path', {d: 'M 0 0 L 10 5 L 0 10 z', fill: '#6d8f78'}));
    defs.append(marker);
    svg.append(defs);
    layers.forEach((layer, index) => {
      const x = layers.length === 1 ? 400 : 90 + index * 620 / (layers.length - 1);
      svg.append(element('text', {x, y: 28, 'text-anchor': 'middle', fill: '#849182', 'font-size': 11}, layer.label || ''));
      layer.nodes.forEach((node, nodeIndex) => {
        const y = 70 + (nodeIndex + 1) * 300 / (layer.nodes.length + 1);
        positions.set(node.id, {x, y, r: Math.max(18, Math.min(30, 120 / layer.nodes.length))});
      });
    });
    for (const edge of edgesOf(spec)) {
      const from = positions.get(edge.from), to = positions.get(edge.to);
      if (!from || !to) continue;
      const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy) || 1;
      const x1 = from.x + dx * from.r / length, y1 = from.y + dy * from.r / length;
      const x2 = to.x - dx * (to.r + 8) / length, y2 = to.y - dy * (to.r + 8) / length;
      const weighted = Number.isFinite(edge.weight);
      svg.append(element('line', {
        x1, y1, x2, y2, 'data-from': edge.from, 'data-to': edge.to,
        stroke: weighted && edge.weight < 0 ? '#c58b65' : '#6d8f78',
        'stroke-width': weighted ? Math.min(6, Math.abs(edge.weight) * 2 + 1.5) : 1.5,
        'marker-end': 'url(#net-arrow)', class: 'edge',
      }));
      if (weighted) svg.append(element('text', {x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 6, 'text-anchor': 'middle', fill: '#5f7368', 'font-size': 11}, String(Math.round(edge.weight * 100) / 100)));
    }
    for (const layer of layers) {
      for (const node of layer.nodes) {
        const point = positions.get(node.id);
        const active = spec.highlight?.includes(node.id) || spec.slider?.node === node.id;
        const group = element('g', {'data-id': node.id});
        group.append(element('circle', {cx: point.x, cy: point.y, r: point.r, fill: active ? '#e2edda' : '#fbfcf7', stroke: active ? '#538b6a' : '#c5d4c6', 'stroke-width': 2}));
        const value = values[node.id];
        if (Number.isFinite(value)) group.append(element('text', {x: point.x, y: point.y + 4, 'text-anchor': 'middle', fill: '#294d3b', 'font-size': 12}, String(Math.round(value * 100) / 100)));
        const label = element('text', {x: point.x, y: point.y + point.r + 16, 'text-anchor': 'middle', fill: '#4d6458', 'font-size': 11});
        linesOf(node.label || node.id).forEach((line, index) => label.append(element('tspan', {x: point.x, dy: index ? 13 : 0}, line)));
        group.append(label);
        svg.append(group);
      }
    }
    caption.textContent = spec.caption || '';
    readout.replaceChildren();
    for (const layer of layers) {
      for (const node of layer.nodes) {
        if (!Number.isFinite(values[node.id])) continue;
        const row = document.createElement('p');
        row.textContent = `${node.label || node.id}: ${Math.round(values[node.id] * 100) / 100}`;
        readout.append(row);
      }
    }
    const control = spec.slider;
    sliderWrap.hidden = !control;
    if (control) {
      const min = control.min ?? 0, max = control.max ?? 1;
      sliderLabel.textContent = control.label || control.node;
      slider.min = min; slider.max = max; slider.step = (max - min) / 100;
      slider.value = control.value ?? min;
      sliderValue.textContent = String(Math.round(Number(slider.value) * 100) / 100);
    }
    return values;
  }

  function animate() {
    if (document.hidden) return;
    animStart = performance.now();
    if (!animationFrame) animationFrame = requestAnimationFrame(frame);
  }
  function frame(now) {
    animationFrame = 0;
    svg.querySelectorAll('.particle').forEach(node => node.remove());
    if (document.hidden || svg.closest('[hidden]') || !animStart || !spec) { animStart = 0; return; }
    const t = (now - animStart) / 1600;
    if (t > 2) { animStart = 0; return; }
    for (const edge of edgesOf(spec)) {
      const from = svg.querySelector(`[data-id="${CSS.escape(edge.from)}"] circle`);
      const to = svg.querySelector(`[data-id="${CSS.escape(edge.to)}"] circle`);
      if (!from || !to) continue;
      const phase = t > 1 ? t - 1 : t;
      svg.append(element('circle', {
        cx: Number(from.getAttribute('cx')) + (Number(to.getAttribute('cx')) - Number(from.getAttribute('cx'))) * phase,
        cy: Number(from.getAttribute('cy')) + (Number(to.getAttribute('cy')) - Number(from.getAttribute('cy'))) * phase,
        r: 4, fill: '#426e52', class: 'particle',
      }));
    }
    animationFrame = requestAnimationFrame(frame);
  }

  slider.oninput = () => {
    if (!spec?.slider) return;
    spec = withSlider(spec, Number(slider.value));
    render();
    onChange();
  };

  return {
    read: () => spec ? {values: forward(spec), slider: spec.slider?.value ?? null} : {},
    load(next) { spec = structuredClone(next); if (spec.slider && spec.slider.value === undefined) spec = withSlider(spec, spec.slider.min ?? 0); return render(); },
    apply(args = {}) {
      if (!spec || document.getElementById('neural').hidden) throw Error('Show a network before updating it');
      if (args.slider !== undefined) spec = withSlider(spec, args.slider);
      if (args.highlight !== undefined) {
        if (!Array.isArray(args.highlight)) throw Error('Invalid highlight');
        spec = structuredClone(spec);
        spec.highlight = args.highlight;
      }
      const values = render();
      if (args.animate) animate();
      return values;
    },
  };
}
