import assert from 'node:assert/strict';
import test from 'node:test';
import { groupHistoryByMonth, historyEntries } from './cooking-history.ts';

const meta = {
  soup: { favorite: false, cookings: [
    { id: 's2', cookedAt: '2026-10-22T12:00:00.000Z', note: 'Меньше соли' },
    { id: 's1', cookedAt: '2026-09-03T12:00:00.000Z', rating: 'great' },
  ] },
  pancakes: { favorite: true, cookings: [
    { id: 'p2', cookedAt: '2026-10-24T09:00:00.000Z' },
    { id: 'p1', cookedAt: '2026-10-12T09:00:00.000Z' },
  ] },
  unused: { favorite: true, cookings: [] },
};

test('every recipe\'s cookings form one list, newest first', () => {
  assert.deepEqual(historyEntries(meta).map(entry => entry.id), ['p2', 's2', 'p1', 's1']);
  assert.deepEqual(historyEntries(meta)[1], { id: 's2', recipeId: 'soup', cookedAt: '2026-10-22T12:00:00.000Z', note: 'Меньше соли' });
});

test('a recipe id narrows the list to that recipe', () => {
  assert.deepEqual(historyEntries(meta, 'soup').map(entry => entry.id), ['s2', 's1']);
  assert.deepEqual(historyEntries(meta, 'missing'), []);
});

test('the stored history is read, never changed', () => {
  const before = JSON.stringify(meta);
  historyEntries(meta);
  assert.equal(JSON.stringify(meta), before);
});

test('entries group by month in order, an unreadable date goes last', () => {
  const entries = historyEntries({
    ...meta,
    broken: { favorite: false, cookings: [{ id: 'x', cookedAt: 'not a date' }] },
  });
  const months = groupHistoryByMonth(entries);
  assert.deepEqual(months.map(month => [month.key, month.entries.map(entry => entry.id)]), [
    ['2026-10', ['p2', 's2', 'p1']],
    ['2026-09', ['s1']],
    ['', ['x']],
  ]);
  assert.equal(months[0].year, 2026);
  assert.equal(months[0].month, 9);
});

test('no cookings, no months', () => {
  assert.deepEqual(groupHistoryByMonth(historyEntries({})), []);
});
