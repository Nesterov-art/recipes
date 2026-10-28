import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { utf8FitsIn, utf8Length } from './utf8.ts';

// The implementation before stage 7.7.2, kept here as the reference the faster one must match.
function previousUtf8Length(text) {
  let size = 0;
  for (const char of text) {
    const cp = char.codePointAt(0);
    size += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return size;
}
// Real UTF-8: TextEncoder and Buffer both write a lone surrogate as U+FFFD (3 bytes).
const encoded = text => new TextEncoder().encode(text).length;
function expectSame(text, label) {
  const expected = encoded(text);
  assert.equal(Buffer.byteLength(text, 'utf8'), expected, `${label}: Buffer and TextEncoder agree`);
  assert.equal(previousUtf8Length(text), expected, `${label}: previous implementation`);
  assert.equal(utf8Length(text), expected, `${label}: current implementation`);
}

const samples = {
  empty: '',
  ascii: 'Omelette with cheese - 2 eggs, 50 g {"json": [1, 2, 3]}\n\t',
  cyrillic: 'Сырники «как у бабушки» — творог 5%, ёжик, Ёлка',
  diacritics: 'Crème brûlée, jalapeño, Ångström, façade, naïve, Øresund',
  chinese: '宫保鸡丁 麻婆豆腐 北京烤鸭 𠀀𠀁',
  emoji: '😊🍳🥘👩‍🍳🇷🇺 1️⃣ ❤️',
  pair: '😊',
  loneHighAtEnd: 'abc\ud800',
  loneHighBeforeText: '\ud800abc',
  loneHighBeforeHigh: '\ud800😊',
  loneLow: 'a\udc00b',
  lowThenHigh: '\udc00\ud800',
  twoLoneHigh: '\ud800\ud800',
  boundaries: '\u007f\u0080߿ࠀ퟿￿',
};

test('utf8Length counts real UTF-8 bytes for every kind of text, as the previous code did', () => {
  for (const [label, text] of Object.entries(samples)) expectSame(text, label);
});

test('utf8Length matches real UTF-8 on a large JSON book and on random text', () => {
  const recipes = Array.from({ length: 300 }, (_, i) => ({
    id: `${i}`, title: `${samples.cyrillic} ${i} ${samples.emoji}`, category: i % 2 ? 'Ужин' : null, time: i,
    ingredients: [samples.diacritics, samples.chinese, samples.ascii], steps: [`${i}. ${samples.cyrillic}`],
  }));
  expectSame(JSON.stringify({ recipes, recipeMeta: {} }), 'large JSON');
  // Seeded, so a failure is reproducible: any UTF-16 code unit, lone surrogates included.
  let seed = 7;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = [0x41, 0x7f, 0x80, 0x44f, 0x7ff, 0x800, 0x4e2d, 0xd83d, 0xde0a, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xe000, 0xffff];
  for (let round = 0; round < 500; round++) {
    const units = Array.from({ length: Math.floor(next() * 40) }, () => (next() < 0.5 ? pick[Math.floor(next() * pick.length)] : Math.floor(next() * 0x10000)));
    expectSame(String.fromCharCode(...units), `random ${round}`);
  }
});

test('utf8FitsIn answers exactly whether the UTF-8 size is within a limit', () => {
  for (const text of [...Object.values(samples), 'я'.repeat(16384), 'я'.repeat(16385), 'a'.repeat(32768), 'a'.repeat(32769), '😊'.repeat(8192), '😊'.repeat(8193), '中'.repeat(10923)]) {
    for (const limit of [0, 1, 3, 4, 32767, 32768, 32769]) {
      assert.equal(utf8FitsIn(text, limit), encoded(text) <= limit, `${JSON.stringify(text.slice(0, 8))}… (${text.length}) within ${limit}`);
    }
  }
});
