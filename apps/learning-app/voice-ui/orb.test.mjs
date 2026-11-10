import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('./orb.js', import.meta.url), 'utf8');
const {createVoiceRenderer, createOrb, haloSettings} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function canvasContext() {
  const ctx = {draws:0, coordinates:[], arcs:[], colors:[], widths:[], fills:0};
  const coords = (...values) => {assert.ok(values.every(Number.isFinite));ctx.coordinates.push(values);};
  Object.assign(ctx, {beginPath(){},moveTo:coords,lineTo:coords,quadraticCurveTo:coords,closePath(){},
    arc(...values){coords(...values);ctx.arcs.push(values);},save(){},restore(){},clip(){},setTransform(){},
    clearRect(){ctx.draws++;},fill(){ctx.fills++;},stroke(){ctx.widths.push(ctx.lineWidth);},
    createLinearGradient(){return {addColorStop:(offset,color)=>ctx.colors.push(color)};},
    createRadialGradient(){return {addColorStop:(offset,color)=>ctx.colors.push(color)};}});
  return ctx;
}
const colors = [[70,146,123],[130,105,185]];
test('approved settings; exact circular idle and moving contours under constant audio', () => {
  assert.deepEqual({...haloSettings}, {speed:1.5,bumps:1.1,density:12,sensitivity:1.2,swell:.5,layers:4,stroke:2,fill:.23,weave:7,stripHeight:1});
  const render=createVoiceRenderer(), idle=canvasContext();
  render.halo(idle,380,0,0,[[124,124,124],[124,124,124]]);
  assert.equal(idle.arcs.length,1);assert.equal(idle.arcs[0][2],380*.22);
  const first=canvasContext(), next=canvasContext();
  render.halo(first,380,1,.4,colors);render.halo(next,380,2,.4,colors);
  assert.notDeepEqual(first.coordinates,next.coordinates);
  assert.equal(first.widths.length,4);
});
test('halo stays in bounds on mobile; ribbon has fill and strands crossing its center', () => {
  const render=createVoiceRenderer();
  for(const size of [243,380])for(const energy of [0,.01,.5,1])for(const time of [0,.75,8,45]){
    const ctx=canvasContext();render.halo(ctx,size,time,energy,colors);
    for(const row of ctx.coordinates)if(row.length<=4)assert.ok(row.every(v=>v>=0&&v<=size));
  }
  for(const energy of [0,.01,.5,1]){
    const ctx=canvasContext();render.ribbon(ctx,264,48,4,energy,colors);
    assert.ok(ctx.fills>0);assert.ok(ctx.coordinates.some(p=>p[1]<24));assert.ok(ctx.coordinates.some(p=>p[1]>24));
    for(const p of ctx.coordinates)assert.ok(p[0]>=0&&p[0]<=264&&p[1]>=0&&p[1]<=48);
  }
});
test('audio lifecycle: quiet syllables, overlap color, frame cap, compact pause, visibility and idle', async t => {
  const saved = new Map(); const set=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});};
  t.after(()=>{for(const[key,desc]of saved){if(desc)Object.defineProperty(globalThis,key,desc);else delete globalThis[key];}});
  let now=0,next=1,intersection,frames=new Map(),visibility;const metrics=[];
  set('requestAnimationFrame',fn=>{const id=next++;frames.set(id,fn);return id;});set('cancelAnimationFrame',id=>frames.delete(id));
  set('performance',{now:()=>now});set('devicePixelRatio',3);
  const doc={hidden:false,addEventListener(name,fn){if(name==='visibilitychange')visibility=fn;}};set('document',doc);
  set('matchMedia',()=>({matches:false,addEventListener(){}}));set('ResizeObserver',class{observe(){}});
  set('IntersectionObserver',class{constructor(fn){intersection=fn;}observe(){}});
  let closes=0,disconnects=0;
  set('AudioContext',class{async resume(){}close(){closes++;}createMediaStreamSource(stream){return {connect(meter){meter.stream=stream;},disconnect(){disconnects++;}};}createAnalyser(){return {getFloatTimeDomainData(buffer){buffer.fill(this.stream.rms);}};}});
  const sphereCtx=canvasContext(),stripCtx=canvasContext();
  const sphere={clientWidth:380,clientHeight:380,getContext:()=>sphereCtx,parentElement:{}},strip={clientWidth:264,clientHeight:48,getContext:()=>stripCtx};
  const orb=createOrb(sphere,strip,{onFrame:m=>metrics.push({...m,at:now})});
  const tick=(ms)=>{const end=now+ms;while(now<end){now+=1000/60;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));}};
  tick(100);assert.equal(frames.size,0);assert.equal(sphere.width,570);
  await orb.start();const mic={rms:.012},speaker={rms:0};orb.input(mic);orb.output(speaker);
  tick(150);
  assert.ok(metrics.at(-1).energy>.1,'small syllables must still respond promptly');
  assert.ok(metrics.at(-1).swellEnergy>0&&metrics.at(-1).swellEnergy<metrics.at(-1).energy,'overall scale should ease into the syllable');
  tick(2000);assert.ok(metrics.at(-1).energy>.1,'quiet speech should be visible');
  const start=metrics.length;tick(5000);
  const activeFrames=metrics.slice(start);
  assert.ok(activeFrames.length>=149&&activeFrames.length<=151,'target 30 updates/s');
  assert.ok(activeFrames.slice(1).every((frame,i)=>Math.abs(frame.at-activeFrames[i].at-1000/30)<1), 'space draws evenly on a 60 Hz display');
  assert.ok(sphereCtx.colors.some(c=>c.includes('70,146,123')));
  sphereCtx.colors.length=0;speaker.rms=.08;tick(1000);
  assert.ok(sphereCtx.colors.some(c=>{const rgb=c.match(/[\d.]+/g).slice(0,3).map(Number);return rgb[0]>70&&rgb[0]<130&&rgb[2]>123&&rgb[2]<185;}),'overlap should blend the speaker colors');
  mic.rms=0;tick(4000);assert.ok(sphereCtx.colors.some(c=>c.includes('130,105,185')));
  orb.setCompact(true);tick(1000);const previous=sphereCtx.draws;tick(1000);assert.equal(sphereCtx.draws,previous);assert.ok(stripCtx.draws>0);
  intersection([{isIntersecting:false}]);const draws=stripCtx.draws;tick(500);assert.equal(stripCtx.draws,draws);assert.equal(frames.size,0);
  intersection([{isIntersecting:true}]);tick(200);doc.hidden=true;visibility();tick(500);assert.equal(frames.size,0);
  doc.hidden=false;visibility();orb.setCompact(false);tick(700);assert.ok(sphereCtx.draws>previous);
  mic.rms=speaker.rms=0;tick(4500);const silence=sphereCtx.draws;tick(1000);assert.equal(sphereCtx.draws,silence,'live silence should sample but not redraw');
  orb.stop();tick(4000);assert.equal(frames.size,0);assert.equal(closes,1);assert.equal(disconnects,2);
});
