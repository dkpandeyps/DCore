import test from 'node:test';
import assert from 'node:assert/strict';
import { sum, product } from '../src/calc.mjs';

test('sum adds two numbers', () => {
  assert.equal(sum(2, 3), 5);
});

test('product multiplies two numbers', () => {
  assert.equal(product(2, 3), 6);
});
