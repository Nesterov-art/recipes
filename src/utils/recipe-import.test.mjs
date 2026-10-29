import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { IMPORT_LIMITS, parseRecipePage } from './recipe-import.ts';

// A page as sites serve it: JSON-LD in <head>, the visible recipe in <body>. The shapes below
// follow pages seen during research (eda.ru, gastronom.ru, edimdoma.ru, bbcgoodfood.com,
// recipetineats.com, tasty.co, epicurious.com, delish.com, iamcook.ru); the texts are our own.
const ld = data => `<script type="application/ld+json">${typeof data === 'string' ? data : JSON.stringify(data)}</script>`;
const page = (...blocks) => `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Рецепт</title>${blocks.join('\n')}</head><body><h1>Рецепт</h1><p>Текст страницы</p></body></html>`;
const syrniki = (over = {}) => ({
  '@context': 'https://schema.org', '@type': 'Recipe', name: 'Сырники из творога', recipeCategory: 'Завтрак',
  prepTime: 'PT10M', cookTime: 'PT20M', totalTime: 'PT30M',
  recipeIngredient: ['Творог 5% — 400 г', 'Яйцо — 1 шт.', 'Мука — 3 ст. л.'],
  recipeInstructions: [{ '@type': 'HowToStep', text: 'Смешать творог, яйцо и муку.' }, { '@type': 'HowToStep', text: 'Обжарить по 3 минуты с каждой стороны.' }],
  ...over,
});
const parse = (...blocks) => parseRecipePage(page(...blocks));
const problems = result => result.problems.map(p => `${p.field}:${p.problem}`);

test('a full Recipe is complete and keeps every line as written', () => {
  const result = parse(ld(syrniki()));
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.draft, {
    title: 'Сырники из творога', category: 'Завтрак', time: 30,
    ingredients: ['Творог 5% — 400 г', 'Яйцо — 1 шт.', 'Мука — 3 ст. л.'],
    steps: ['Смешать творог, яйцо и муку.', 'Обжарить по 3 минуты с каждой стороны.'],
  });
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.source, { recipes: 1, skippedBlocks: 0 });
});

test('the draft is not a saveable Recipe: no id, and unknown time stays null, not 0', () => {
  const result = parse(ld(syrniki({ totalTime: undefined, prepTime: undefined, cookTime: undefined })));
  assert.equal(result.status, 'partial');
  assert.equal(result.draft.time, null);
  assert.equal('id' in result.draft, false);
  assert.deepEqual(problems(result), ['time:missing']);
});

test('JSON-LD as an array, inside @graph, and @type as an array are found', () => {
  const array = parse(ld([{ '@type': 'WebSite', name: 'Сайт' }, syrniki()]));
  const graph = parse(ld({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', name: 'Издатель' }, { '@type': 'BreadcrumbList', itemListElement: [] },
    syrniki({ '@type': ['Recipe', 'NewsArticle'] }),
  ] }));
  const nested = parse(ld({ '@type': 'WebPage', mainEntity: syrniki({ '@type': 'http://schema.org/Recipe' }) }));
  for (const result of [array, graph, nested]) {
    assert.equal(result.status, 'complete');
    assert.equal(result.draft.title, 'Сырники из творога');
  }
});

test('several Recipe: the first one in page order with a title is taken, nothing is merged', () => {
  const related = syrniki({ name: 'Похожий рецепт: блины', recipeIngredient: ['Молоко — 500 мл'] });
  const result = parse(ld(syrniki({ name: '' })), ld([syrniki(), related]));
  assert.equal(result.draft.title, 'Сырники из творога');
  assert.deepEqual(result.draft.ingredients, ['Творог 5% — 400 г', 'Яйцо — 1 шт.', 'Мука — 3 ст. л.']);
  assert.equal(result.source.recipes, 3);
  // Same page, same choice.
  assert.deepEqual(parse(ld(syrniki({ name: '' })), ld([syrniki(), related])), result);
  // Order decides, not size: the second recipe is not chosen for having more lines.
  assert.equal(parse(ld(related), ld(syrniki())).draft.title, 'Похожий рецепт: блины');
});

test('damaged JSON-LD does not throw; a valid block next to it is still read', () => {
  assert.equal(parse(ld('{"@type": "Recipe", "name": "Сломанный",}')).status, 'invalidData');
  assert.equal(parse(ld('{"@type": "Recipe"'), ld('not json at all')).status, 'invalidData');
  const mixed = parse(ld('{"@type": "Recipe", "name": "Сломанный",}'), ld(syrniki()));
  assert.equal(mixed.status, 'complete');
  assert.equal(mixed.draft.title, 'Сырники из творога');
  assert.deepEqual(mixed.source, { recipes: 1, skippedBlocks: 1 });
  // A raw line break inside a string (common authoring error) is read as a space.
  const raw = parse(ld('{"@type":"Recipe","name":"Борщ\nукраинский","recipeIngredient":["Свёкла — 2 шт."],"recipeInstructions":"Сварить.","totalTime":"PT1H","recipeCategory":"Обед"}'));
  assert.equal(raw.draft.title, 'Борщ украинский');
});

test('no Recipe on the page, or no JSON-LD at all', () => {
  assert.deepEqual(parse(ld({ '@type': 'Organization', name: 'Издатель' })), { status: 'noRecipe', source: { recipes: 0, skippedBlocks: 0 } });
  assert.equal(parseRecipePage('<html><body><h1>Сырники</h1></body></html>').status, 'noRecipe');
  assert.equal(parseRecipePage('').status, 'noRecipe');
});

test('only script elements of type application/ld+json are read, whatever the case, spacing and attributes', () => {
  const data = JSON.stringify(syrniki());
  for (const tag of [
    `<script type="application/ld+json">${data}</script>`,
    `<SCRIPT TYPE="Application/LD+JSON">${data}</SCRIPT>`,
    `<script data-x="a>b" type = 'application/ld+json' id=schema >${data}</script >`,
    `<script type=application/ld+json>${data}</script>`,
    `<script type="application/ld+json; charset=utf-8">\n<!--\n${data}\n-->\n</script>`,
    `<script type="application/ld+json">//<![CDATA[\n${data}\n//]]></script>`,
  ]) assert.equal(parseRecipePage(page(tag)).draft?.title, 'Сырники из творога', tag.slice(0, 50));
  for (const tag of [
    `<script>${data}</script>`,
    `<script type="application/json">${data}</script>`,
    `<script type="text/plain" data-type="application/ld+json">${data}</script>`,
    `<!-- <script type="application/ld+json">${data}</script> -->`,
    `<noscript-like type="application/ld+json">${data}</noscript-like>`,
  ]) assert.equal(parseRecipePage(page(tag)).status, 'noRecipe', tag.slice(0, 50));
});

test('HowToStep: text, or name when there is no text; each step stays its own line', () => {
  const result = parse(ld(syrniki({ recipeInstructions: [
    { '@type': 'HowToStep', text: 'Смешать.' },
    { '@type': 'HowToStep', name: 'Обжарить.', url: 'https://example.com/#step2', image: 'https://example.com/2.jpg' },
    { '@type': 'HowToStep', text: 'Подавать со сметаной.<br>Можно с вареньем.' },
  ] })));
  assert.deepEqual(result.draft.steps, ['Смешать.', 'Обжарить.', 'Подавать со сметаной. Можно с вареньем.']);
});

test('HowToSection: the section name leads its first step, order is kept, sections are not merged', () => {
  const result = parse(ld(syrniki({ recipeInstructions: [
    { '@type': 'HowToSection', name: 'Тесто', itemListElement: [{ '@type': 'HowToStep', text: 'Замесить.' }, { '@type': 'HowToStep', text: 'Дать отдохнуть 20 минут.' }] },
    { '@type': 'HowToSection', name: 'Начинка', itemListElement: [{ '@type': 'HowToStep', text: 'Нарезать яблоки.' }] },
    { '@type': 'HowToSection', name: '', itemListElement: [{ '@type': 'HowToStep', text: 'Собрать и испечь.' }] },
  ] })));
  assert.deepEqual(result.draft.steps, ['Тесто: Замесить.', 'Дать отдохнуть 20 минут.', 'Начинка: Нарезать яблоки.', 'Собрать и испечь.']);
});

test('instructions as one text, as an array of strings, and as an ItemList', () => {
  assert.deepEqual(parse(ld(syrniki({ recipeInstructions: 'Смешать творог.\nОбжарить.\n\n  Подавать.  ' }))).draft.steps, ['Смешать творог.', 'Обжарить.', 'Подавать.']);
  assert.deepEqual(parse(ld(syrniki({ recipeInstructions: '<ol><li>Смешать.</li><li>Обжарить.</li></ol>' }))).draft.steps, ['Смешать.', 'Обжарить.']);
  assert.deepEqual(parse(ld(syrniki({ recipeInstructions: ['Смешать.', 'Обжарить.'] }))).draft.steps, ['Смешать.', 'Обжарить.']);
  assert.deepEqual(parse(ld(syrniki({ recipeInstructions: { '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', position: 1, item: { '@type': 'HowToStep', text: 'Смешать.' } }, { '@type': 'ListItem', text: 'Обжарить.' }] } }))).draft.steps, ['Смешать.', 'Обжарить.']);
});

test('missing ingredients or steps make the result partial and are named', () => {
  const noIngredients = parse(ld(syrniki({ recipeIngredient: undefined })));
  assert.equal(noIngredients.status, 'partial');
  assert.deepEqual(problems(noIngredients), ['ingredients:missing']);
  const empty = parse(ld(syrniki({ recipeIngredient: ['', '  ', '<br>', 42, null] })));
  assert.deepEqual(empty.draft.ingredients, []);
  assert.deepEqual(problems(empty), ['ingredients:missing']);
  const noSteps = parse(ld(syrniki({ recipeInstructions: [] })));
  assert.deepEqual(problems(noSteps), ['steps:missing']);
  // As on iamcook.ru: a title and a time, nothing else.
  const bare = parse(ld({ '@type': 'Recipe', name: 'Карп в аэрогриле', totalTime: 'PT30M' }));
  assert.equal(bare.status, 'partial');
  assert.deepEqual(problems(bare), ['category:missing', 'ingredients:missing', 'steps:missing']);
});

test('without a title there is no recipe ready to save, only a partial draft to complete', () => {
  for (const name of [undefined, '', '   ', '<b></b>', 42]) {
    const result = parse(ld(syrniki({ name })));
    assert.equal(result.status, 'partial');
    assert.equal(result.draft.title, '');
    assert.deepEqual(problems(result), ['title:missing']);
  }
});

test('ISO 8601 durations become whole minutes', () => {
  const time = value => parse(ld(syrniki({ totalTime: value, prepTime: undefined, cookTime: undefined }))).draft.time;
  assert.equal(time('PT30M'), 30);
  assert.equal(time('PT1H30M'), 90);
  assert.equal(time('PT90M'), 90);
  assert.equal(time('P0DT0H45M'), 45);
  assert.equal(time('P1DT2H'), 1560);
  assert.equal(time('P1W'), 10080);
  assert.equal(time('PT0.5H'), 30);
  assert.equal(time('PT1,5H'), 90);
  assert.equal(time('PT120S'), 2);
  assert.equal(time(' pt45m '), 45);
});

test('unreadable, fractional, zero or contradictory time is not guessed: null and a named problem', () => {
  const result = over => parse(ld(syrniki({ prepTime: undefined, cookTime: undefined, ...over })));
  for (const value of ['10 minutes', 'PT', 'P', '30', 'PT-5M', 'P1M', 'P1Y', 'PT1H30', 'PTM', 30, { value: 30 }]) {
    const r = result({ totalTime: value });
    assert.equal(r.draft.time, null, String(value));
    assert.deepEqual(problems(r), ['time:invalid'], String(value));
  }
  // 90 seconds is 1.5 minutes: not rounded.
  assert.deepEqual(problems(result({ totalTime: 'PT90S' })), ['time:notWholeMinutes']);
  assert.equal(result({ totalTime: 'PT90S' }).draft.time, null);
  // An explicit zero is not taken as the recipe's time.
  assert.deepEqual(problems(result({ totalTime: 'PT0M' })), ['time:zero']);
  assert.equal(result({ totalTime: 'PT0S' }).draft.time, null);
  // Far beyond any recipe.
  assert.deepEqual(problems(result({ totalTime: 'P400D' })), ['time:outOfRange']);
  // Preparation and cooking longer than the total: the page contradicts itself.
  const conflict = result({ totalTime: 'PT20M', prepTime: 'PT15M', cookTime: 'PT30M' });
  assert.equal(conflict.draft.time, null);
  assert.deepEqual(problems(conflict), ['time:conflicting']);
});

test('totalTime is used and a longer total than prep + cook is flagged as possibly including waiting', () => {
  // As on tasty.co: 30 min prep, 2 h 15 min cooking, 5 h 45 min in total (marinating).
  const tasty = parse(ld(syrniki({ prepTime: 'PT30M', cookTime: 'PT2H15M', totalTime: 'PT5H45M' })));
  assert.equal(tasty.draft.time, 345);
  assert.deepEqual(tasty.problems, [{ field: 'time', problem: 'mayIncludeWaiting', activeMinutes: 165 }]);
  // As on eda.ru: an explicit zero prep next to the cooking time is fine.
  assert.equal(parse(ld(syrniki({ prepTime: 'PT0M', cookTime: 'PT30M', totalTime: 'PT30M' }))).status, 'complete');
  // As on gastronom.ru: an empty prepTime ("PT") next to a good total does not spoil it.
  const gastronom = parse(ld(syrniki({ prepTime: 'PT', cookTime: 'PT2H30M', totalTime: 'PT2H30M' })));
  assert.equal(gastronom.draft.time, 150);
  assert.equal(gastronom.status, 'complete');
});

test('without totalTime: prep + cook when both are known, one of them is flagged as an estimate', () => {
  const both = parse(ld(syrniki({ totalTime: undefined, prepTime: 'PT15M', cookTime: 'PT1H' })));
  assert.equal(both.draft.time, 75);
  assert.equal(both.status, 'complete');
  const cookOnly = parse(ld(syrniki({ totalTime: undefined, prepTime: undefined, cookTime: 'PT40M' })));
  assert.equal(cookOnly.draft.time, 40);
  assert.deepEqual(cookOnly.problems, [{ field: 'time', problem: 'onlyPart', part: 'cookTime' }]);
  const prepOnly = parse(ld(syrniki({ totalTime: undefined, prepTime: 'PT10M', cookTime: 'nonsense' })));
  assert.equal(prepOnly.draft.time, null);
  assert.deepEqual(problems(prepOnly), ['time:invalid']);
});

test('HTML markup is removed and entities are decoded, keeping the meaning of the text', () => {
  const result = parse(ld(syrniki({
    name: 'Пирог &laquo;Шарлотка&raquo; <em>с&nbsp;яблоками</em> &amp; корицей',
    recipeIngredient: ['Мука &mdash; 200&nbsp;г', 'Сахар &ndash; &frac12; стакана', 'Соль &#8212; щепотка', 'Ваниль &#x2014; 1 г', 'Сердечко &lt;3 и 5 &gt; 3', 'Масло &amp;amp; сливки'],
    recipeInstructions: [{ '@type': 'HowToStep', text: '<p>Разогреть духовку до 180&deg;C.</p>' }, { '@type': 'HowToStep', text: '  Печь   <strong>40</strong>\n минут  ' }],
  })));
  assert.equal(result.draft.title, 'Пирог «Шарлотка» с яблоками & корицей');
  assert.deepEqual(result.draft.ingredients, ['Мука — 200 г', 'Сахар – ½ стакана', 'Соль — щепотка', 'Ваниль — 1 г', 'Сердечко <3 и 5 > 3', 'Масло & сливки']);
  assert.deepEqual(result.draft.steps, ['Разогреть духовку до 180°C.', 'Печь 40 минут']);
  // An unknown entity stays as it was rather than disappearing.
  assert.equal(parse(ld(syrniki({ name: 'Суп &unknown; дня' }))).draft.title, 'Суп &unknown; дня');
});

test('Cyrillic, emoji and quotes come through unchanged', () => {
  const result = parse(ld(syrniki({ name: 'Сырники «как у бабушки» 😊', recipeIngredient: ['Творог — 400 г 🧀', 'Ёжик «тест» & чай #1'] })));
  assert.equal(result.draft.title, 'Сырники «как у бабушки» 😊');
  assert.deepEqual(result.draft.ingredients, ['Творог — 400 г 🧀', 'Ёжик «тест» & чай #1']);
});

test('category is set only when it surely is one of Breakfast, Lunch, Dinner', () => {
  const category = value => parse(ld(syrniki({ recipeCategory: value })));
  assert.equal(category('Завтраки').draft.category, 'Завтрак');
  assert.equal(category('breakfast').draft.category, 'Завтрак');
  assert.equal(category(['Обед']).draft.category, 'Обед');
  assert.equal(category('Dinner').draft.category, 'Ужин');
  assert.equal(category('Ужины').draft.category, 'Ужин');
  // As on bbcgoodfood.com: breakfast and main course at once.
  assert.equal(category('Breakfast, Brunch, Main course').draft.category, null);
  assert.deepEqual(problems(category('Breakfast, Brunch, Main course')), ['category:ambiguous']);
  assert.deepEqual(problems(category(['Завтрак', 'Ужин'])), ['category:ambiguous']);
  // Something else, or nothing: no guess.
  for (const value of ['Выпечка', ['Main'], 'Супы', 'side dish', undefined, '', 7]) {
    assert.equal(category(value).draft.category, null, String(value));
    assert.deepEqual(problems(category(value)), ['category:missing'], String(value));
  }
});

test('limits: a page, a JSON-LD block or a recipe beyond them is refused with the limit, never cut', () => {
  const huge = page(ld(syrniki())) + ' '.repeat(IMPORT_LIMITS.pageChars);
  assert.deepEqual(parseRecipePage(huge), { status: 'unsupported', reason: 'pageTooLarge', limit: IMPORT_LIMITS.pageChars });
  // An oversized block is skipped, not parsed; the result says so.
  const bigBlock = ld({ '@type': 'Organization', description: 'x'.repeat(IMPORT_LIMITS.blockChars) });
  assert.deepEqual(parse(bigBlock), { status: 'unsupported', reason: 'dataTooLarge', limit: IMPORT_LIMITS.blockChars });
  assert.equal(parse(bigBlock, ld(syrniki())).status, 'complete');
  // Too many ingredients, steps or too long a field: the recipe is not shortened.
  const many = parse(ld(syrniki({ recipeIngredient: Array.from({ length: IMPORT_LIMITS.lines + 1 }, (_, i) => `Продукт ${i}`) })));
  assert.deepEqual(many, { status: 'unsupported', reason: 'recipeTooLarge', problems: [{ field: 'ingredients', problem: 'tooMany', limit: IMPORT_LIMITS.lines }] });
  const longStep = parse(ld(syrniki({ recipeInstructions: ['Шаг. '.repeat(IMPORT_LIMITS.lineChars)] })));
  assert.deepEqual(longStep.problems, [{ field: 'steps', problem: 'tooLong', limit: IMPORT_LIMITS.lineChars }]);
  const longTitle = parse(ld(syrniki({ name: 'Т'.repeat(IMPORT_LIMITS.titleChars + 1) })));
  assert.deepEqual(longTitle.problems, [{ field: 'title', problem: 'tooLong', limit: IMPORT_LIMITS.titleChars }]);
  // At the limits everything is kept.
  const atLimit = parse(ld(syrniki({ name: 'Т'.repeat(IMPORT_LIMITS.titleChars), recipeIngredient: Array.from({ length: IMPORT_LIMITS.lines }, (_, i) => `Продукт ${i}`) })));
  assert.equal(atLimit.status, 'complete');
  assert.equal(atLimit.draft.ingredients.length, IMPORT_LIMITS.lines);
});

test('limits: too many JSON-LD blocks, objects or too deep nesting end the search safely', () => {
  const blocks = Array.from({ length: IMPORT_LIMITS.blocks }, () => ld({ '@type': 'Thing' }));
  assert.deepEqual(parse(...blocks, ld(syrniki())), { status: 'unsupported', reason: 'dataTooLarge', limit: IMPORT_LIMITS.blocks });
  assert.equal(parse(ld(syrniki()), ...blocks).status, 'complete');
  const crowd = ld({ '@graph': Array.from({ length: IMPORT_LIMITS.objects }, (_, i) => ({ '@type': 'Thing', name: `n${i}` })).concat(syrniki()) });
  assert.deepEqual(parse(crowd), { status: 'unsupported', reason: 'dataTooLarge', limit: IMPORT_LIMITS.objects });
  let deep = syrniki();
  for (let i = 0; i < IMPORT_LIMITS.depth + 2; i++) deep = { '@type': 'WebPage', mainEntity: deep };
  assert.deepEqual(parse(ld(deep)), { status: 'unsupported', reason: 'dataTooLarge', limit: IMPORT_LIMITS.depth });
  // Nesting far beyond what JSON.parse handles is a damaged block, not a crash.
  assert.doesNotThrow(() => parseRecipePage(page(ld('['.repeat(200_000) + ']'.repeat(200_000)))));
});

test('pages shaped like the researched sites', () => {
  // eda.ru: @graph-less blocks next to a breadcrumb, HowToStep, "Завтраки".
  const eda = parse(ld({ '@type': 'BreadcrumbList', itemListElement: [] }), ld(syrniki({ recipeCategory: 'Завтраки', prepTime: 'PT0M', cookTime: 'PT30M' })), ld({ '@type': 'Organization' }));
  assert.equal(eda.status, 'complete');
  // recipetineats.com: two sections, the first a short version of the second.
  const tineats = parse(ld({ '@graph': [{ '@type': 'WebPage' }, syrniki({ recipeCategory: ['Main'], recipeInstructions: [
    { '@type': 'HowToSection', name: 'Abbreviated Recipe:', itemListElement: [{ '@type': 'HowToStep', text: 'Brown chicken, then simmer.' }] },
    { '@type': 'HowToSection', name: 'Full method', itemListElement: [{ '@type': 'HowToStep', text: 'Brown the chicken.' }, { '@type': 'HowToStep', text: 'Simmer for 45 minutes.' }] },
  ] })] }));
  assert.deepEqual(tineats.draft.steps, ['Abbreviated Recipe: Brown chicken, then simmer.', 'Full method: Brown the chicken.', 'Simmer for 45 minutes.']);
  assert.deepEqual(problems(tineats), ['category:missing']);
  // epicurious.com: time in words.
  const epi = parse(ld(syrniki({ totalTime: '10 minutes', prepTime: undefined, cookTime: undefined, recipeCategory: undefined })));
  assert.deepEqual(problems(epi), ['time:invalid', 'category:missing']);
  // delish.com: cookTime "PT0S", sections with names.
  const delish = parse(ld(syrniki({ totalTime: 'PT40M', prepTime: 'PT10M', cookTime: 'PT0S', recipeCategory: ['vegetarian', 'side dish'] })));
  assert.equal(delish.draft.time, 40);
  assert.deepEqual(problems(delish), ['time:mayIncludeWaiting', 'category:missing']);
});

test('a page decoded from windows-1251 by the platform decoder reads like any other', () => {
  // How stage 8.2 is expected to decode: bytes + charset -> TextDecoder, then parseRecipePage.
  // "Сырники" in windows-1251 is D1 FB F0 ED E8 EA E8; the rest of this page is ASCII.
  const bytes = Buffer.concat([
    Buffer.from('<html><head><meta charset="windows-1251"><script type="application/ld+json">{"@type":"Recipe","name":"', 'ascii'),
    Buffer.from([0xd1, 0xfb, 0xf0, 0xed, 0xe8, 0xea, 0xe8]),
    Buffer.from('","recipeIngredient":["1 kg"]}</script></head></html>', 'ascii'),
  ]);
  assert.equal(parseRecipePage(new TextDecoder('windows-1251').decode(bytes)).draft.title, 'Сырники');
  // Read as UTF-8 by mistake, the same bytes do not give the title: decoding belongs before parsing.
  assert.notEqual(parseRecipePage(new TextDecoder('utf-8').decode(bytes)).draft.title, 'Сырники');
});

test('the parser only reads: same input, same result; results are separate; no storage or network is touched', () => {
  const html = page(ld(syrniki()));
  const copy = String(html);
  const saved = { fetch: globalThis.fetch, localStorage: globalThis.localStorage, XMLHttpRequest: globalThis.XMLHttpRequest };
  const touched = [];
  const trap = name => new Proxy(() => {}, { get: () => { touched.push(name); throw new Error(name); }, apply: () => { touched.push(name); throw new Error(name); } });
  Object.assign(globalThis, { fetch: trap('fetch'), localStorage: trap('localStorage'), XMLHttpRequest: trap('XMLHttpRequest') });
  try {
    const first = parseRecipePage(html);
    first.draft.ingredients.push('changed'); first.draft.title = 'changed';
    const second = parseRecipePage(html);
    assert.equal(second.draft.title, 'Сырники из творога');
    assert.equal(second.draft.ingredients.length, 3);
  } finally { Object.assign(globalThis, saved); }
  assert.equal(html, copy);
  assert.deepEqual(touched, []);
});
