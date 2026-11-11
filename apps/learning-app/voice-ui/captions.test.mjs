import test from 'node:test';
import assert from 'node:assert/strict';
import {appendCaption, finishCaption} from './captions.mjs';

test('recent speech keeps both speakers and splits a pause', () => {
  const turns = [];
  appendCaption(turns, 'you', 'What is ', 1000, 1200);
  appendCaption(turns, 'you', 'a model', 1200, 1800);
  appendCaption(turns, 'tutor', 'A model ', 1900, 2200);
  appendCaption(turns, 'tutor', 'Next thought.', 4000, 4600);
  assert.deepEqual(turns.map(turn => [turn.who, turn.text]), [
    ['you', 'What is a model'],
    ['tutor', 'A model '],
    ['tutor', 'Next thought.'],
  ]);
});

test('a finished transcript replaces the partial line', () => {
  const turns = [];
  appendCaption(turns, 'tutor', 'A mod');
  finishCaption(turns, 'tutor', 'A model learns from examples.');
  finishCaption(turns, 'you', 'That helps.');
  assert.equal(turns[0].text, 'A model learns from examples.');
  assert.equal(turns[1].who, 'you');
});
