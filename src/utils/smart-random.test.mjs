import assert from 'node:assert/strict';
import test from 'node:test';
import { getRecipeWeight, pickSmartRandom } from './smart-random.ts';

const now = Date.parse('2026-10-22T12:00:00Z');
const day = 86400000;
const recipes = ['a', 'b', 'c'].map(id => ({ id, title: id, category: null, time: 10, ingredients: [], steps: [] }));
const cooked = days => ({ favorite: false, cookings: [{ id: 'event', cookedAt: new Date(now - days * day).toISOString() }] });

test('never cooked and older recipes receive greater weights than recent ones', () => {
  const meta = { a: cooked(0), b: cooked(20), c: cooked(100) };
  assert(getRecipeWeight('a', meta, now) < getRecipeWeight('b', meta, now));
  assert(getRecipeWeight('b', meta, now) < getRecipeWeight('c', meta, now));
  assert(getRecipeWeight('c', meta, now) < getRecipeWeight('new', meta, now));
  assert.equal(getRecipeWeight('c', meta, now), getRecipeWeight('b', { b: cooked(55) }, now));
});

test('weight uses latest cooking regardless of array order and handles future dates safely', () => {
  const meta = { a: { favorite: true, cookings: [...cooked(40).cookings, ...cooked(1).cookings] } };
  assert.equal(getRecipeWeight('a', meta, now), getRecipeWeight('a', { a: cooked(1) }, now));
  assert.equal(getRecipeWeight('a', { a: cooked(-3) }, now), getRecipeWeight('a', { a: cooked(0) }, now));
});

test('random selection respects supplied candidates and never immediately repeats with alternatives', () => {
  for (const random of [0, 0.2, 0.5, 0.999999]) {
    const selected = pickSmartRandom(recipes.slice(0, 2), {}, { lastRecipeId: 'a', nowMs: now, random: () => random });
    assert.equal(selected.id, 'b');
  }
  assert.equal(pickSmartRandom([], {}), null);
  assert.equal(pickSmartRandom([recipes[0]], {}, { lastRecipeId: 'a' }).id, 'a');
});

test('weighted thresholds remain random, not a deterministic oldest-first sort', () => {
  const meta = { a: cooked(0) };
  assert.equal(pickSmartRandom(recipes.slice(0, 2), meta, { nowMs: now, random: () => 0 }).id, 'a');
  assert.equal(pickSmartRandom(recipes.slice(0, 2), meta, { nowMs: now, random: () => 0.5 }).id, 'b');
});
