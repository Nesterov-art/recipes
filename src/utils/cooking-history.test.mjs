import assert from 'node:assert/strict';
import test from 'node:test';
import { groupHistoryByMonth, historyEntries, historyRows } from './cooking-history.ts';

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
  assert.deepEqual(historyRows([]), []);
});

test('cookings at the same moment keep their stored order', () => {
  const at = '2026-10-01T10:00:00.000Z';
  const entries = historyEntries({
    a: { favorite: false, cookings: [{ id: 'a1', cookedAt: at }, { id: 'a2', cookedAt: 'broken' }, { id: 'a3', cookedAt: at }] },
    b: { favorite: false, cookings: [{ id: 'b1', cookedAt: at }, { id: 'b2', cookedAt: '2026-10-02T10:00:00.000Z' }] },
  });
  assert.deepEqual(entries.map(entry => entry.id), ['b2', 'a1', 'a3', 'b1', 'a2']);
});

// The screen renders one flat, virtualized list: a heading row per month, then its entries.
test('rows list each month heading before its entries, with the card edges marked', () => {
  const rows = historyRows(groupHistoryByMonth(historyEntries(meta)));
  assert.deepEqual(rows.map(row => row.type === 'month' ? `${row.key} (${row.count})` : `${row.entry.id}${row.first ? ' first' : ''}${row.last ? ' last' : ''}`), [
    '2026-10 (3)', 'p2 first', 's2', 'p1 last',
    '2026-09 (1)', 's1 first last',
  ]);
  assert.deepEqual(rows[0], { type: 'month', key: '2026-10', year: 2026, month: 9, count: 3 });
});

test('row keys are unique even when two recipes share a cooking id', () => {
  const rows = historyRows(groupHistoryByMonth(historyEntries({
    a: { favorite: false, cookings: [{ id: 'same', cookedAt: '2026-10-01T10:00:00.000Z' }] },
    b: { favorite: false, cookings: [{ id: 'same', cookedAt: '2026-10-02T10:00:00.000Z' }] },
  })));
  const keys = rows.map(row => row.key);
  assert.equal(new Set(keys).size, keys.length);
});

for (const size of [1, 100, 1000, 20_202]) {
  test(`${size} cookings keep every entry in order, newest first`, () => {
    const cookings = Array.from({ length: size }, (_, i) => ({
      id: `c${i}`, cookedAt: new Date(Date.parse('2026-10-14T09:00:00.000Z') - i * 3 * 3600_000).toISOString(),
    }));
    const rows = historyRows(groupHistoryByMonth(historyEntries({ x: { favorite: false, cookings: [...cookings].reverse() } })));
    const entries = rows.filter(row => row.type === 'entry');
    assert.equal(entries.length, size);
    assert.deepEqual(entries.map(row => row.entry.id), cookings.map(cooking => cooking.id));
    const months = rows.filter(row => row.type === 'month');
    assert.equal(months.reduce((sum, row) => sum + row.count, 0), size);
    assert.equal(entries.filter(row => row.first).length, months.length);
    assert.equal(entries.filter(row => row.last).length, months.length);
  });
}
