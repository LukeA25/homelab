import {validateVisual, plotSeries} from './visuals.mjs';
const colors = ['#519b86','#8675c6','#c58d56','#598fb9','#b86e87'];
const ns = 'http://www.w3.org/2000/svg';
function element(tag, attributes, text) {
  const node = document.createElementNS(ns, tag);
  for (const [key,value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
export function createBoard(network, onVisibilityChange) {
  const board = document.getElementById('board');
  const drawing = document.getElementById('drawing');
  let current = {kind:'clear'};
  function show(input) {
    const spec = validateVisual(input);
    current = spec;
    board.hidden = spec.kind === 'clear';
    document.getElementById('recap-card').hidden = true;
    document.getElementById('save-lesson').hidden = true;
    document.getElementById('clear').hidden = false;
    document.body.classList.toggle('with-visual', !board.hidden);
    onVisibilityChange?.(!board.hidden);
    document.getElementById('board-title').textContent = spec.title || 'Whiteboard';
    document.getElementById('board-caption').textContent = spec.caption || '';
    document.getElementById('neural').hidden = spec.kind !== 'neural';
    drawing.hidden = ['neural','clear'].includes(spec.kind);
    drawing.replaceChildren();
    if (['plot','chart'].includes(spec.kind)) drawChart(spec);
    if (spec.kind === 'diagram') drawDiagram(spec);
    if (spec.kind === 'neural') network.load(spec);
    const math = document.getElementById('math');
    math.replaceChildren();
    math.hidden = !spec.equation;
    if (spec.equation) {
      katex.render(spec.equation, math, {displayMode:true, output:'mathml', throwOnError:false, trust:false, maxExpand:1000});
    }
    return {visual:current, ...(spec.kind === 'neural' ? {network:network.read()} : {})};
  }
  function canvas() {
    const svg = element('svg', {viewBox:'0 0 800 380',role:'img','aria-label':current.title || current.kind});
    drawing.append(svg);
    return svg;
  }
  function drawChart(spec) {
    const svg = canvas();
    const series = plotSeries(spec), points = series.flatMap(s => s.points);
    let xMin = Math.min(...points.map(p => p.x)), xMax = Math.max(...points.map(p => p.x));
    let yMin = Math.min(0,...points.map(p => p.y)), yMax = Math.max(0,...points.map(p => p.y));
    if (xMin === xMax) { xMin -= 1; xMax += 1; }
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    const x = v => 75 + (v-xMin)/(xMax-xMin)*650;
    const y = v => 310 - (v-yMin)/(yMax-yMin)*270;
    for (let i=0;i<=5;i++) {
      const xv=xMin+(xMax-xMin)*i/5, yv=yMin+(yMax-yMin)*i/5;
      svg.append(element('line',{x1:75,x2:725,y1:y(yv),y2:y(yv),stroke:'#e3e8e1'}));
      svg.append(element('text',{x:62,y:y(yv)+4,'text-anchor':'end',fill:'#728277','font-size':11},Number(yv.toPrecision(3))));
      svg.append(element('text',{x:x(xv),y:335,'text-anchor':'middle',fill:'#728277','font-size':11},Number(xv.toPrecision(3))));
    }
    svg.append(element('line',{x1:75,x2:725,y1:y(0),y2:y(0),stroke:'#9daa9f'}));
    for (const [index,s] of series.entries()) {
      const color=colors[index];
      if (spec.kind === 'chart') {
        const width=Math.min(40,500/points.length);
        for (const p of s.points) svg.append(element('rect',{x:x(p.x)-width/2+index*3,y:Math.min(y(p.y),y(0)),width,height:Math.abs(y(p.y)-y(0)),fill:color,rx:3}));
      } else {
        svg.append(element('polyline',{points:s.points.map(p=>`${x(p.x)},${y(p.y)}`).join(' '),fill:'none',stroke:color,'stroke-width':3}));
      }
      svg.append(element('text',{x:80+index*140,y:365,fill:color,'font-size':12},s.label));
    }
  }
  function wrapped(label) {
    const words = label.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const parts = word.length > 22 ? word.match(/.{1,22}/g) : [word];
      for (const part of parts) {
        if (!line) line = part;
        else if (`${line} ${part}`.length <= 22) line += ` ${part}`;
        else { lines.push(line); line = part; }
      }
    }
    if (line) lines.push(line);
    return lines.slice(0, 4);
  }
  function drawDiagram(spec) {
    const boxes = new Map(spec.nodes.map(node => {
      const lines = wrapped(node.label);
      const width = Math.max(120, Math.min(230, Math.max(...lines.map(line => line.length)) * 7.6 + 28));
      return [node.id, {lines, width, height: Math.max(52, lines.length * 16 + 24)}];
    }));
    const incoming = new Map(spec.nodes.map(node => [node.id, 0]));
    const outgoing = new Map(spec.nodes.map(node => [node.id, []]));
    for (const edge of spec.edges) { incoming.set(edge.to, incoming.get(edge.to) + 1); outgoing.get(edge.from).push(edge.to); }
    const queue = [...incoming].filter(([, count]) => count === 0).map(([id]) => id);
    let seen = 0;
    const pending = new Map(incoming);
    while (queue.length) {
      const id = queue.shift();
      seen += 1;
      for (const next of outgoing.get(id)) {
        pending.set(next, pending.get(next) - 1);
        if (pending.get(next) === 0) queue.push(next);
      }
    }
    const flow = seen === spec.nodes.length && spec.edges.length > 0;
    const rank = new Map(spec.nodes.map(node => [node.id, 0]));
    if (flow) {
      const sources = new Map(spec.nodes.map(node => [node.id, []]));
      for (const edge of spec.edges) sources.get(edge.to).push(edge.from);
      let changed = true;
      while (changed) {
        changed = false;
        for (const node of spec.nodes) {
          const next = sources.get(node.id).reduce((max, id) => Math.max(max, rank.get(id) + 1), 0);
          if (next !== rank.get(node.id)) { rank.set(node.id, next); changed = true; }
        }
      }
    }
    const columns = new Map();
    if (flow) {
      for (const node of spec.nodes) {
        const list = columns.get(rank.get(node.id)) || [];
        list.push(node.id);
        columns.set(rank.get(node.id), list);
      }
    } else columns.set(0, spec.nodes.map(node => node.id));
    const positions = new Map();
    let x = 36, height = 80;
    for (const ids of [...columns.keys()].sort((a, b) => a - b).map(key => columns.get(key))) {
      const widest = Math.max(...ids.map(id => boxes.get(id).width));
      let y = 36;
      for (const id of ids) {
        const box = boxes.get(id);
        positions.set(id, {x: x + widest / 2, y: y + box.height / 2, ...box});
        y += box.height + 28;
      }
      height = Math.max(height, y);
      x += widest + 72;
    }
    const skips = spec.edges.filter(edge => (rank.get(edge.to) ?? 0) > (rank.get(edge.from) ?? 0) + 1).length;
    const svg = element('svg', {viewBox: `0 0 ${Math.max(360, x - 20)} ${height + 24 + skips * 18}`, role: 'img', 'aria-label': spec.title || 'Diagram'});
    drawing.append(svg);
    const defs = element('defs', {}), marker = element('marker', {id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 9, markerHeight: 9, orient: 'auto'});
    marker.append(element('path', {d: 'M 0 0 L 10 5 L 0 10 z', fill: '#5f7d68'}));
    defs.append(marker);
    svg.append(defs);
    for (const node of spec.nodes) {
      const box = positions.get(node.id), active = spec.highlight?.includes(node.id);
      svg.append(element('rect', {x: box.x - box.width / 2, y: box.y - box.height / 2, width: box.width, height: box.height, rx: 16, fill: active ? '#d7e7d2' : '#f7f8f3', stroke: active ? '#538b6a' : '#b7c7b6', 'stroke-width': 1.6}));
      const label = element('text', {x: box.x, y: box.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#2d4b3b', 'font-size': 13});
      const lineHeight = 16, offset = -((box.lines.length - 1) * lineHeight) / 2;
      box.lines.forEach((line, index) => label.append(element('tspan', {x: box.x, y: box.y + offset + index * lineHeight, 'dominant-baseline': 'middle'}, line)));
      svg.append(label);
    }
    const slot = (box, index, count) => count <= 1 ? box.y : box.y - Math.min(box.height - 20, (count - 1) * 16) / 2 + Math.min(box.height - 20, (count - 1) * 16) * index / (count - 1);
    const fromEdges = new Map(), toEdges = new Map();
    for (const edge of spec.edges) {
      fromEdges.set(edge.from, [...(fromEdges.get(edge.from) || []), edge]);
      toEdges.set(edge.to, [...(toEdges.get(edge.to) || []), edge]);
    }
    let bus = 0;
    for (const edge of spec.edges) {
      const from = positions.get(edge.from), to = positions.get(edge.to);
      const outs = fromEdges.get(edge.from), ins = toEdges.get(edge.to);
      const startY = slot(from, outs.indexOf(edge), outs.length);
      const endY = slot(to, ins.indexOf(edge), ins.length);
      const startX = from.x + from.width / 2, endX = to.x - to.width / 2;
      const adjacent = (rank.get(edge.to) ?? 0) === (rank.get(edge.from) ?? 0) + 1;
      const lane = height + 6 + bus * 18;
      const d = adjacent && endX > startX + 16
        ? `M ${startX} ${startY} H ${endX - 26} V ${endY} H ${endX}`
        : `M ${startX} ${startY} H ${startX + 18} V ${lane} H ${endX - 26} V ${endY} H ${endX}`;
      if (!adjacent || endX <= startX + 16) bus += 1;
      svg.append(element('path', {d, fill: 'none', stroke: '#5f7d68', 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'marker-end': 'url(#arrow)'}));
      if (edge.label) svg.append(element('text', {x: startX + 28, y: startY - 8, fill: '#5c6e63', 'font-size': 12}, edge.label));
    }
  }
  return {show, read:()=>current};
}
