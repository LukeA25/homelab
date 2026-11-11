import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVisual, plotSeries} from './visuals.mjs';
test('function plots compute values and preserve discontinuity at ReLU zero', () => {
  const spec=validateVisual({kind:'plot',function:'relu',xMin:-4,xMax:4});
  const points=plotSeries(spec)[0].points;
  assert.equal(points[0].y,0);
  assert.equal(points[80].y,0);
  assert.equal(points.at(-1).y,4);
  assert.equal(plotSeries({function:'sigmoid',xMin:0,xMax:1})[0].points[0].y,.5);
});
test('visual validation rejects invalid data before replacing the board', () => {
  for (const spec of [
    {kind:'plot',function:'constructor'},
    {kind:'plot',function:'sin',xMin:2,xMax:1},
    {kind:'chart',series:[{label:'bad',points:[{x:1,y:Infinity}]}]},
    {kind:'diagram',nodes:[{id:'a',label:'A'}],edges:[{from:'a',to:'missing'}]},
    {kind:'diagram',nodes:[{id:'a',label:'A'},{id:'a',label:'B'}],edges:[]},
    {kind:'equation'},
    {kind:'neural', layers:[{nodes:[{id:'only'}]}]},
    {kind:'neural', layers:[{nodes:[{id:'x'}]},{nodes:[{id:'y'}]}], connections:[{from:'x', to:'missing'}]},
  ]) assert.throws(()=>validateVisual(spec));
  const network = validateVisual({kind:'neural', layers:[{label:'Inputs', nodes:[{id:'a', label:'Email length'}]},{label:'Output', nodes:[{id:'b', label:'Spam'}]}]});
  assert.equal(network.layers[0].nodes[0].label, 'Email length');
});
