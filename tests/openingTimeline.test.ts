import test from 'node:test';
import assert from 'node:assert/strict';
import { openingScale, phaseStartMs } from '../src/hero/useOpeningSequence.ts';

test('the first opening reaches the writing/recording invitation in about four seconds, in the original order', () => {
  const marks = phaseStartMs();
  const order = [marks.black, marks.emerging, marks.title, marks.prompt, marks.interaction, marks.idle];
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.equal(marks.black, 0);
  assert.ok(marks.title <= 2000, 'the title starts within two seconds');
  assert.ok(marks.interaction <= 4500, 'the circle is ready within four and a half seconds');
  assert.equal(openingScale(), 1);
});
