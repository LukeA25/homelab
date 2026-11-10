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
    document.body.classList.toggle('with-visual', !board.hidden);
    onVisibilityChange?.(!board.hidden);
    document.getElementById('board-title').textContent = spec.title || 'Whiteboard';
    document.getElementById('board-caption').textContent = spec.caption || '';
    document.getElementById('neural').hidden = spec.kind !== 'neural';
    drawing.hidden = ['neural','clear'].includes(spec.kind);
    drawing.replaceChildren();
    if (['plot','chart'].includes(spec.kind)) drawChart(spec);
    if (spec.kind === 'diagram') drawDiagram(spec);
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
  function drawDiagram(spec) {
    const svg = canvas();
    const defs=element('defs',{}), marker=element('marker',{id:'arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto-start-reverse'});
    marker.append(element('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#90a798'}));defs.append(marker);svg.append(defs);
    const columns=Math.min(4,spec.nodes.length), rows=Math.ceil(spec.nodes.length/columns);
    const positions=new Map(spec.nodes.map((n,i)=>[n.id,{x:100+(i%columns)*600/Math.max(1,columns-1),y:80+Math.floor(i/columns)*230/Math.max(1,rows-1)}]));
    for (const edge of spec.edges) {
      const a=positions.get(edge.from), b=positions.get(edge.to), length=Math.hypot(b.x-a.x,b.y-a.y)||1;
      svg.append(element('line',{x1:a.x,y1:a.y,x2:b.x-(b.x-a.x)*46/length,y2:b.y-(b.y-a.y)*46/length,stroke:'#90a798','stroke-width':2,'marker-end':'url(#arrow)'}));
      if (edge.label) svg.append(element('text',{x:(a.x+b.x)/2,y:(a.y+b.y)/2-9,'text-anchor':'middle',fill:'#64776c','font-size':12},edge.label));
    }
    for (const node of spec.nodes) {
      const p=positions.get(node.id), active=spec.highlight?.includes(node.id);
      svg.append(element('rect',{x:p.x-65,y:p.y-27,width:130,height:54,rx:18,fill:active?'#ccdec8':'#f4f6f0',stroke:active?'#538b6a':'#b8c9b8'}));
      const label=element('text',{x:p.x,y:p.y+5,'text-anchor':'middle',fill:'#2d4b3b','font-size':12},node.label);
      if (node.label.length>20) {label.setAttribute('textLength','115');label.setAttribute('lengthAdjust','spacingAndGlyphs');}
      svg.append(label);
    }
  }
  return {show, read:()=>current};
}
