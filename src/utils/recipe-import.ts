import { CATEGORIES } from '../constants/recipes.ts';

// A recipe read from a cooking site's page: Schema.org Recipe in JSON-LD only. The page is
// untrusted text that is already decoded (bytes and charset are the caller's job); it is
// scanned for <script type="application/ld+json">, never run or rendered. Nothing is fetched,
// stored or changed here.

type Category = (typeof CATEGORIES)[number];
// What the page gave, in the shape of a Recipe but not one: no id, and a time that may be
// unknown. Only the person, through the form or the preview, turns it into a saved recipe.
export type RecipeDraft = { title: string; category: Category | null; time: number | null; ingredients: string[]; steps: string[] };
export type ImportField = keyof RecipeDraft;
export type ImportProblem =
  | { field: ImportField; problem: 'missing' }
  // time: unreadable value, not whole minutes, zero, beyond MAX_MINUTES, or prep + cook above the total.
  | { field: 'time'; problem: 'invalid' | 'notWholeMinutes' | 'zero' | 'outOfRange' | 'conflicting' }
  // time: the total is longer than prep + cook (marinating, rising, chilling).
  | { field: 'time'; problem: 'mayIncludeWaiting'; activeMinutes: number }
  // time: no total, taken from the only one of prepTime / cookTime the page has.
  | { field: 'time'; problem: 'onlyPart'; part: 'prepTime' | 'cookTime' }
  | { field: 'category'; problem: 'ambiguous' }
  | { field: 'title' | 'ingredients' | 'steps'; problem: 'tooLong' | 'tooMany'; limit: number };
// recipes: Recipe objects found; skippedBlocks: JSON-LD blocks that were damaged or too large.
export type ImportSource = { recipes: number; skippedBlocks: number };
export type RecipeImportResult =
  // Every field found and readable.
  | { status: 'complete'; draft: RecipeDraft; problems: []; source: ImportSource }
  // A draft to check: problems names each missing or doubtful field. Without a title it cannot be saved as is.
  | { status: 'partial'; draft: RecipeDraft; problems: ImportProblem[]; source: ImportSource }
  | { status: 'noRecipe'; source: ImportSource }
  // JSON-LD was there but none of it could be read.
  | { status: 'invalidData'; source: ImportSource }
  // Beyond the limits below: refused as a whole, never shortened.
  | { status: 'unsupported'; reason: 'pageTooLarge' | 'dataTooLarge'; limit: number }
  | { status: 'unsupported'; reason: 'recipeTooLarge'; problems: ImportProblem[] };

// Safe-parsing bounds, well above the pages seen in research (largest 1.9 MB, 24 ingredients,
// 16 steps) and independent of the Monorec link format.
export const IMPORT_LIMITS = {
  pageChars: 6_000_000, blockChars: 1_000_000, blocks: 100, objects: 10_000, depth: 32,
  titleChars: 500, lines: 500, lineChars: 5_000,
};
// 30 days: past any recipe's time, marinating and fermenting included.
const MAX_MINUTES = 30 * 24 * 60;

// --- Finding the JSON-LD blocks --------------------------------------------------------------

const startsWithAt = (text: string, at: number, word: string) => text.slice(at, at + word.length).toLowerCase() === word;
// The ">" closing a start tag, skipping ">" inside quoted attribute values.
function endOfTag(html: string, from: number) {
  let quote = '';
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === "'") quote = c; else if (c === '>') return i;
  }
  return -1;
}
function typeAttribute(attributes: string) {
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const m of attributes.matchAll(re)) if (m[1].toLowerCase() === 'type') return (m[2] ?? m[3] ?? m[4] ?? '').trim().toLowerCase();
  return '';
}
// Script contents are raw text up to the first "</script"; comments outside scripts hide what
// they contain. Some sites wrap the JSON in <!-- --> or CDATA markers.
function jsonLdBlocks(html: string) {
  const blocks: string[] = [];
  for (let i = html.indexOf('<'); i !== -1; i = html.indexOf('<', i + 1)) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      if (end === -1) break;
      i = end + 2;
      continue;
    }
    if (!startsWithAt(html, i, '<script') || !/[\s/>]/.test(html[i + 7] ?? '')) continue;
    const open = endOfTag(html, i + 7);
    if (open === -1) break;
    let close = html.indexOf('</', open);
    while (close !== -1 && !startsWithAt(html, close, '</script')) close = html.indexOf('</', close + 2);
    if (close === -1) break;
    if (typeAttribute(html.slice(i + 7, open)).split(';')[0].trim() === 'application/ld+json') {
      blocks.push(html.slice(open + 1, close).trim()
        .replace(/^(?:\/\/\s*)?<!\[CDATA\[|^<!--/, '').replace(/(?:\/\/\s*)?\]\]>$|-->$/, '').trim());
    }
    i = close + 7;
  }
  return blocks;
}

function parseBlock(block: string): { ok: true; value: unknown } | { ok: false } {
  try { return { ok: true, value: JSON.parse(block) }; } catch { /* tried once more below */ }
  // Raw line breaks and tabs inside strings are invalid JSON but common; as spaces they are harmless.
  try { return { ok: true, value: JSON.parse(block.replace(/[\u0000-\u001f]+/g, ' ')) }; } catch { return { ok: false }; }
}

const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isType = (node: Record<string, unknown>, type: string) =>
  ([] as unknown[]).concat(node['@type'] ?? []).some(t => typeof t === 'string' && t.replace(/^.*[/#:]/, '') === type);

// Every Recipe object in page order (depth first), within the object and depth limits.
function findRecipes(blocks: string[]) {
  const recipes: Record<string, unknown>[] = [];
  let skipped = 0, objects = 0, exceeded: number | null = null;
  for (const block of blocks.slice(0, IMPORT_LIMITS.blocks)) {
    if (block.length > IMPORT_LIMITS.blockChars) { skipped++; exceeded ??= IMPORT_LIMITS.blockChars; continue; }
    const parsed = parseBlock(block);
    if (!parsed.ok) { skipped++; continue; }
    const stack: [unknown, number][] = [[parsed.value, 0]];
    while (stack.length) {
      const [value, depth] = stack.pop()!;
      if (value === null || typeof value !== 'object') continue;
      if (depth > IMPORT_LIMITS.depth) { exceeded ??= IMPORT_LIMITS.depth; continue; }
      const children = Array.isArray(value) ? value : Object.values(value);
      if (plain(value)) {
        if (++objects > IMPORT_LIMITS.objects) { exceeded ??= IMPORT_LIMITS.objects; stack.length = 0; break; }
        if (isType(value, 'Recipe')) { recipes.push(value); continue; }
      }
      for (let k = children.length - 1; k >= 0; k--) stack.push([children[k], depth + 1]);
    }
  }
  if (blocks.length > IMPORT_LIMITS.blocks) exceeded ??= IMPORT_LIMITS.blocks;
  return { recipes, skipped, exceeded };
}

// --- Text ------------------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”',
  lsquo: '‘', rsquo: '’', mdash: '—', ndash: '–', minus: '−', hellip: '…', deg: '°', times: '×', frac12: '½', frac14: '¼',
  frac34: '¾', frac13: '⅓', frac23: '⅔', middot: '·', bull: '•', shy: '', copy: '©', reg: '®', trade: '™', eacute: 'é',
};
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi;
const HAS_ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/i;
function decodeEntities(text: string) {
  return text.replace(ENTITY, (all, code: string) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? all;
    const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return n > 0 && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff) ? String.fromCodePoint(n) : all;
  });
}
// Markup inside a JSON-LD string: tags dropped (block tags become line breaks), then entities
// decoded, twice at most for sites that encode them twice (&amp;amp;). Decoding after the tags
// keeps "&lt;3" as text.
const BLOCK_TAG = /<\/?(?:br|p|div|li|ol|ul|h[1-6]|tr|section|article)\b[^>]*>/gi;
function textOf(value: unknown, lines: boolean) {
  if (typeof value !== 'string') return '';
  let text = value.replace(BLOCK_TAG, '\n').replace(/<[^>]*>/g, '');
  text = decodeEntities(text);
  if (HAS_ENTITY.test(text)) text = decodeEntities(text);
  const parts = text.replace(/ /g, ' ').split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return lines ? parts.join('\n') : parts.join(' ');
}
const oneLine = (value: unknown) => textOf(value, false);

// --- Fields ----------------------------------------------------------------------------------

function steps(value: unknown, depth = 0): string[] {
  if (depth > IMPORT_LIMITS.depth || value == null) return [];
  if (typeof value === 'string') return textOf(value, true).split('\n').filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(item => typeof item === 'string' ? [oneLine(item)].filter(Boolean) : steps(item, depth + 1));
  if (!plain(value)) return [];
  // A section's name leads its first step, so the order and the steps themselves stay as they were.
  if (isType(value, 'HowToSection')) {
    const inner = steps(value.itemListElement, depth + 1);
    const name = oneLine(value.name);
    if (name && inner.length) inner[0] = `${/[:.]$/.test(name) ? name : `${name}:`} ${inner[0]}`;
    return inner;
  }
  if (isType(value, 'ListItem') && value.item !== undefined) return steps(value.item, depth + 1);
  if (isType(value, 'ItemList') || (!('text' in value) && Array.isArray(value.itemListElement))) return steps(value.itemListElement, depth + 1);
  const text = oneLine(value.text) || oneLine(value.name);
  return text ? [text] : [];
}

const listOf = (value: unknown) => ([] as unknown[]).concat(value ?? []);

// ISO 8601 duration to minutes: weeks, days, hours, minutes, seconds (no years or months, whose
// length is not fixed). null when unreadable; fractions are allowed when the total is exact.
const DURATION = /^P(?!$)(?:(\d+(?:[.,]\d+)?)W)?(?:(\d+(?:[.,]\d+)?)D)?(?:T(?=\d)(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/;
function duration(value: unknown): { minutes: number } | { problem: 'invalid' | 'notWholeMinutes' } {
  const m = typeof value === 'string' ? value.trim().toUpperCase().match(DURATION) : null;
  if (!m) return { problem: 'invalid' };
  const n = (part?: string) => (part ? Number(part.replace(',', '.')) : 0);
  const seconds = ((n(m[1]) * 7 + n(m[2])) * 24 * 60 + n(m[3]) * 60 + n(m[4])) * 60 + n(m[5]);
  const minutes = seconds / 60;
  return Math.abs(minutes - Math.round(minutes)) < 1e-9 ? { minutes: Math.round(minutes) } : { problem: 'notWholeMinutes' };
}
const given = (value: unknown) => value !== undefined && value !== null && value !== '';

type TimeResult = { time: number | null; problem?: ImportProblem };
function time(recipe: Record<string, unknown>): TimeResult {
  const read = (key: 'totalTime' | 'prepTime' | 'cookTime') => (given(recipe[key]) ? duration(recipe[key]) : null);
  const total = read('totalTime'), prep = read('prepTime'), cook = read('cookTime');
  const known = (d: ReturnType<typeof read>) => (d && 'minutes' in d ? d.minutes : null);
  const checked = (minutes: number, problem?: ImportProblem): TimeResult => {
    if (minutes === 0) return { time: null, problem: { field: 'time', problem: 'zero' } };
    if (minutes > MAX_MINUTES) return { time: null, problem: { field: 'time', problem: 'outOfRange' } };
    return { time: minutes, problem };
  };
  if (total) {
    if ('problem' in total) return { time: null, problem: { field: 'time', problem: total.problem } };
    const [p, c] = [known(prep), known(cook)];
    if (p === null || c === null || p + c === total.minutes) return checked(total.minutes);
    if (p + c > total.minutes) return { time: null, problem: { field: 'time', problem: 'conflicting' } };
    return checked(total.minutes, { field: 'time', problem: 'mayIncludeWaiting', activeMinutes: p + c });
  }
  if (!prep && !cook) return { time: null, problem: { field: 'time', problem: 'missing' } };
  for (const part of [prep, cook]) if (part && 'problem' in part) return { time: null, problem: { field: 'time', problem: part.problem } };
  if (prep && cook) return checked(known(prep)! + known(cook)!);
  return checked(known(prep ?? cook)!, { field: 'time', problem: 'onlyPart', part: prep ? 'prepTime' : 'cookTime' });
}

// Only a sure match: every category the page names is the same one of Breakfast, Lunch, Dinner.
const CATEGORY_WORDS: Record<string, Category> = {
  завтрак: 'Завтрак', завтраки: 'Завтрак', breakfast: 'Завтрак', breakfasts: 'Завтрак',
  обед: 'Обед', обеды: 'Обед', lunch: 'Обед', lunches: 'Обед',
  ужин: 'Ужин', ужины: 'Ужин', dinner: 'Ужин', dinners: 'Ужин', supper: 'Ужин',
};
function category(value: unknown): { category: Category | null; problem?: ImportProblem } {
  const names = listOf(value).flatMap(item => (typeof item === 'string' ? oneLine(item).split(/[,;/|]/) : []))
    .map(name => name.trim().toLowerCase()).filter(Boolean);
  const matched = new Set(names.map(name => Object.hasOwn(CATEGORY_WORDS, name) ? CATEGORY_WORDS[name] : null));
  if (!names.length || (matched.size === 1 && matched.has(null))) return { category: null, problem: { field: 'category', problem: 'missing' } };
  if (matched.size > 1) return { category: null, problem: { field: 'category', problem: 'ambiguous' } };
  return { category: [...matched][0] };
}

function tooLarge(draft: RecipeDraft): ImportProblem[] {
  const found: ImportProblem[] = [];
  if (draft.title.length > IMPORT_LIMITS.titleChars) found.push({ field: 'title', problem: 'tooLong', limit: IMPORT_LIMITS.titleChars });
  for (const field of ['ingredients', 'steps'] as const) {
    if (draft[field].length > IMPORT_LIMITS.lines) found.push({ field, problem: 'tooMany', limit: IMPORT_LIMITS.lines });
    else if (draft[field].some(line => line.length > IMPORT_LIMITS.lineChars)) found.push({ field, problem: 'tooLong', limit: IMPORT_LIMITS.lineChars });
  }
  return found;
}

// --- The page --------------------------------------------------------------------------------

// The recipe of a page: the first Recipe in page order that has a title (or the first one when
// none has), never a mix of several.
export function parseRecipePage(html: string): RecipeImportResult {
  if (html.length > IMPORT_LIMITS.pageChars) return { status: 'unsupported', reason: 'pageTooLarge', limit: IMPORT_LIMITS.pageChars };
  const blocks = jsonLdBlocks(html);
  const { recipes, skipped, exceeded } = findRecipes(blocks);
  const source = { recipes: recipes.length, skippedBlocks: skipped };
  if (!recipes.length) {
    if (exceeded !== null) return { status: 'unsupported', reason: 'dataTooLarge', limit: exceeded };
    return skipped ? { status: 'invalidData', source } : { status: 'noRecipe', source };
  }
  const recipe = recipes.find(r => oneLine(listOf(r.name)[0])) ?? recipes[0];
  const timed = time(recipe);
  const sorted = category(recipe.recipeCategory);
  const draft: RecipeDraft = {
    title: oneLine(listOf(recipe.name)[0]),
    category: sorted.category,
    time: timed.time,
    ingredients: listOf(recipe.recipeIngredient ?? recipe.ingredients).map(oneLine).filter(Boolean),
    steps: steps(recipe.recipeInstructions),
  };
  const limits = tooLarge(draft);
  if (limits.length) return { status: 'unsupported', reason: 'recipeTooLarge', problems: limits };
  const problems: ImportProblem[] = [
    ...(draft.title ? [] : [{ field: 'title', problem: 'missing' } as const]),
    ...(timed.problem ? [timed.problem] : []),
    ...(sorted.problem ? [sorted.problem] : []),
    ...(draft.ingredients.length ? [] : [{ field: 'ingredients', problem: 'missing' } as const]),
    ...(draft.steps.length ? [] : [{ field: 'steps', problem: 'missing' } as const]),
  ];
  return problems.length ? { status: 'partial', draft, problems, source } : { status: 'complete', draft, problems: [], source };
}
