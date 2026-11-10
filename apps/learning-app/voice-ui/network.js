import {initial, values, update} from './model.mjs';
export function createNetwork(onChange) {
const $ = id => document.getElementById(id);
const svg = $('network'), NS = 'http://www.w3.org/2000/svg';
let state = initial(), animStart = 0, animationFrame = 0, drag = null;
const pos={x1:[110,130],x2:[110,290],h1:[400,130],h2:[400,290],y:[690,210]};
const edges=[['x1','h1',()=>state.weight],['x2','h1',()=>.5],['x1','h2',()=>-.6],['x2','h2',()=>1.2],['h1','y',()=>.8],['h2','y',()=>.4]];
function el(tag,attrs,text){const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
function render(){
 const s=values(state);svg.replaceChildren();
 for(const [x,label] of [[110,'INPUTS'],[400,'HIDDEN LAYER'],[690,'OUTPUT']])svg.append(el('text',{x,y:35,'text-anchor':'middle',fill:'#849182','font-size':10,'letter-spacing':2},label));
 for(const [a,b,w] of edges){const [x1,y1]=pos[a],[x2,y2]=pos[b],weight=w(),em=state.focus==='all'||state.focus==='weight'&&a==='x1'&&b==='h1'||state.focus==='hidden'&&b[0]==='h'||state.focus==='output'&&b==='y'||state.focus==='inputs'&&a[0]==='x';svg.append(el('line',{x1,y1,x2,y2,stroke:weight<0?'#c58b65':'#74a48a','stroke-width':Math.abs(weight)*3+1,opacity:em?.8:.15,class:'edge'}));svg.append(el('text',{x:x1+(x2-x1)*.67,y:y1+(y2-y1)*.67-8,'text-anchor':'middle',fill:weight<0?'#b87950':'#668a73','font-size':11},weight.toFixed(2)));}
 for(const [id,[x,y]]of Object.entries(pos)){const active=state.focus==='all'||state.focus==='inputs'&&id[0]==='x'||state.focus==='hidden'&&id[0]==='h'||state.focus==='output'&&id==='y'||state.focus==='weight'&&['x1','h1'].includes(id);const g=el('g',{class:'node','data-id':id});g.append(el('circle',{cx:x,cy:y,r:39,fill:active?'#e2edda':'#fbfcf7',stroke:active?'#6d9777':'#dbe3d7','stroke-width':2}));g.append(el('text',{x,y:y-6,'text-anchor':'middle',fill:'#294d3b','font-size':16},id));g.append(el('text',{x,y:y+15,'text-anchor':'middle',fill:'#739079','font-size':12},s[id].toFixed(3)));svg.append(g);}
 $('caption').textContent=state.caption;
 $('eq1').textContent=`max(0, ${state.weight.toFixed(2)} × ${state.x1.toFixed(2)} + 0.5 × ${state.x2.toFixed(2)} − 0.3) = ${s.h1.toFixed(3)}`;
 $('eq2').textContent=`max(0, −0.6 × ${state.x1.toFixed(2)} + 1.2 × ${state.x2.toFixed(2)} + 0.1) = ${s.h2.toFixed(3)}`;
 $('eq3').textContent=`0.8 × ${s.h1.toFixed(3)} + 0.4 × ${s.h2.toFixed(3)} = ${s.y.toFixed(3)}`;
 for(const[k,id]of [['x1','v1'],['x2','v2'],['weight','vw']]){$(k).value=state[k];$(id).textContent=state[k].toFixed(2);}
}
function animate(){if(document.hidden)return;animStart=performance.now();if(!animationFrame)animationFrame=requestAnimationFrame(frame);}
function frame(now){
 animationFrame=0;
 svg.querySelectorAll('.particle').forEach(n=>n.remove());
 if(document.hidden||svg.closest('[hidden]')||!animStart){animStart=0;return;}
 const t=(now-animStart)/1800;
 if(t>2){animStart=0;return;}
 for(const[a,b,w]of edges){const phase=a[0]==='h'?t-1:t;if(phase<0||phase>1)continue;const[x,y]=pos[a],[ex,ey]=pos[b];svg.append(el('circle',{cx:x+(ex-x)*phase,cy:y+(ey-y)*phase,r:5,fill:w()<0?'#d99a66':'#426e52',class:'particle'}));}
 animationFrame=requestAnimationFrame(frame);
}

function send(event){if(dc?.readyState==='open')dc.send(JSON.stringify(event));}
function context(){ onChange(values(state)); }
for(const k of ['x1','x2','weight']){$(k).oninput=()=>{state=update(state,{[k]:Number($(k).value)});render();};$(k).onchange=()=>{animate();context();};}
$('pulse').onclick=animate;$('reset').onclick=()=>{state=initial();Object.assign(pos,{x1:[110,130],x2:[110,290],h1:[400,130],h2:[400,290],y:[690,210]});render();context();};
svg.onpointerdown=e=>{const id=e.target.closest('[data-id]')?.dataset.id;if(id){drag=id;svg.setPointerCapture(e.pointerId);}};
svg.onpointermove=e=>{if(!drag)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());pos[drag]=[Math.max(45,Math.min(755,p.x)),Math.max(80,Math.min(360,p.y))];render();};svg.onpointerup=svg.onpointercancel=()=>drag=null;

render();
return {read: () => values(state), apply(args) { state = update(state, args); render(); if (args.animate) animate(); return values(state); }};
}
