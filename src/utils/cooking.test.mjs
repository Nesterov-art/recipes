import assert from 'node:assert/strict';
import test from 'node:test';
import { cookingSteps } from './cooking.ts';

test('cooking steps keep the saved order and skip blank directions', () => {
  assert.deepEqual(cookingSteps(['  Нарежь лук ', '', '   ', 'Обжарь']), ['Нарежь лук', 'Обжарь']);
});

test('a recipe without usable directions has no cooking steps', () => {
  assert.deepEqual(cookingSteps([]), []);
  assert.deepEqual(cookingSteps(['', ' \n ']), []);
});

test('the recipe steps themselves are not changed', () => {
  const steps = Object.freeze([' a ', '']);
  cookingSteps(steps);
  assert.deepEqual(steps, [' a ', '']);
});
