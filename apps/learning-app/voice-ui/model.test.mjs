import test from 'node:test';
import assert from 'node:assert/strict';
import {forward, withSlider} from './model.mjs';
import {validateVisual} from './visuals.mjs';

const spec = () => validateVisual({
  kind: 'neural',
  layers: [
    {label: 'Inputs', nodes: [{id: 'x', label: 'Clue', value: 1}]},
    {label: 'Hidden', activation: 'relu', nodes: [{id: 'h', label: 'Mix', bias: -0.2}]},
    {label: 'Output', nodes: [{id: 'y', label: 'Score'}]},
  ],
  connections: [{from: 'x', to: 'h', weight: 0.5}, {from: 'h', to: 'y', weight: 2}],
  slider: {node: 'x', min: 0, max: 1, value: 1},
});

test('a specified network computes from its own weights', () => {
  const values = forward(spec());
  assert.equal(values.h, 0.3);
  assert.equal(values.y, 0.6);
  assert.equal(forward(withSlider(spec(), 0)).h, 0);
});

test('slider changes stay inside the range the tutor set', () => {
  assert.throws(() => withSlider(spec(), 2));
  assert.throws(() => withSlider({layers: spec().layers}, 0));
});
