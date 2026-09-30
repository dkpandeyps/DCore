import test from 'node:test';
import assert from 'node:assert/strict';
import { answer } from '../src/frozen.mjs';

test('frozen fixture expects an unsatisfiable change', () => {
  assert.equal(answer, 100);
});
