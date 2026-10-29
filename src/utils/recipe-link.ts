import { CATEGORIES, type Recipe } from '../constants/recipes.ts';

// One recipe in a link: <origin>/shared-recipe#1.<data>, where 1 is the format version and
// <data> is base64url of UTF-8 JSON with short keys. After "#" the data never reaches a
// server. Only the recipe itself travels: no local id, history, notes, favourites,
// groceries or settings.
export type SharedRecipe = Omit<Recipe, 'id'>;
export const RECIPE_LINK_PATH = '/shared-recipe';
// Native apps link to the existing web version; the web version links to its own address.
export const SHARE_ORIGIN = 'https://neyroshi-recipes.expo.app';
const VERSION = 1;
// A messenger message holds about 4 096 characters; the link has to fit in one with its title.
export const MAX_LINK_LENGTH = 4000;
export const LINK_LIMITS = { title: 200, items: 100, ingredient: 500, step: 2000, time: 10_000 };
const CODES = { b: CATEGORIES[0], l: CATEGORIES[1], d: CATEGORIES[2] } as const;
type Code = keyof typeof CODES;
type Payload = { t: string; c: Code | null; m: number; i: string[]; s: string[] };

// The field of a recipe that does not fit the link format.
export type LinkLimit = 'title' | 'time' | 'ingredients' | 'steps';
export class RecipeLinkError extends Error {
  // missing: no Monorec recipe link; invalid: damaged or cut; version: newer format; size: too long;
  // unsupported: a recipe the format cannot carry, refused when building (limit names the field).
  code: 'missing' | 'invalid' | 'version' | 'size' | 'unsupported';
  limit?: LinkLimit;
  constructor(code: RecipeLinkError['code'], limit?: LinkLimit) { super(code); this.code = code; this.limit = limit; }
}
// The receiver's message for each failure, as a translation key. A link is never built from
// an unsupported recipe, so a received one that breaks the limits is a damaged one.
export const LINK_ERRORS = {
  missing: 'recipeLinkMissing', invalid: 'recipeLinkInvalid', version: 'recipeLinkVersion', size: 'recipeLinkSize', unsupported: 'recipeLinkInvalid',
} as const satisfies Record<RecipeLinkError['code'], string>;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function utf8(text: string) {
  const bytes: number[] = [];
  for (const char of text) {
    const c = char.codePointAt(0)!;
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | c >> 6, 0x80 | c & 63);
    else if (c < 0x10000) bytes.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    else bytes.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
  }
  return bytes;
}
function fromUtf8(bytes: number[]) {
  let text = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    const size = b < 0x80 ? 1 : b >> 5 === 6 ? 2 : b >> 4 === 14 ? 3 : b >> 3 === 30 ? 4 : 0;
    if (!size || i + size > bytes.length) throw new RecipeLinkError('invalid');
    let c = size === 1 ? b : b & (0xff >> (size + 1));
    for (let k = 1; k < size; k++) {
      if (bytes[i + k] >> 6 !== 2) throw new RecipeLinkError('invalid');
      c = c << 6 | bytes[i + k] & 63;
    }
    text += String.fromCodePoint(c);
    i += size;
  }
  return text;
}
function toBase64Url(bytes: number[]) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = bytes[i] << 16 | (bytes[i + 1] ?? 0) << 8 | (bytes[i + 2] ?? 0);
    out += ALPHABET[n >> 18 & 63] + ALPHABET[n >> 12 & 63];
    if (i + 1 < bytes.length) out += ALPHABET[n >> 6 & 63];
    if (i + 2 < bytes.length) out += ALPHABET[n & 63];
  }
  return out;
}
function fromBase64Url(text: string) {
  if (text.length % 4 === 1) throw new RecipeLinkError('invalid');
  const bytes: number[] = [];
  let buffer = 0, bits = 0;
  for (const char of text) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new RecipeLinkError('invalid');
    buffer = buffer << 6 | value; bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push(buffer >> bits & 0xff); }
  }
  return bytes;
}

const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max && value.trim().length > 0;
const list = (value: unknown, max: number) =>
  Array.isArray(value) && value.length <= LINK_LIMITS.items && value.every(item => text(item, max));
// The fields a link can carry, checked the same way when building and when reading: a link
// that is built is always read back. Returns the first field outside the format.
function outsideLimits(payload: Payload): LinkLimit | null {
  if (!text(payload.t, LINK_LIMITS.title)) return 'title';
  if (!Number.isInteger(payload.m) || payload.m < 0 || payload.m > LINK_LIMITS.time) return 'time';
  if (!list(payload.i, LINK_LIMITS.ingredient)) return 'ingredients';
  if (!list(payload.s, LINK_LIMITS.step)) return 'steps';
  return null;
}

// Refuses a recipe the format cannot carry (unsupported, with its field) and a link longer
// than MAX_LINK_LENGTH (size). The recipe itself is never changed.
export function buildRecipeLink(recipe: Recipe, origin: string) {
  const code = (Object.keys(CODES) as Code[]).find(key => CODES[key] === recipe.category) ?? null;
  const payload: Payload = { t: recipe.title, c: code, m: recipe.time, i: recipe.ingredients, s: recipe.steps };
  const limit = outsideLimits(payload);
  if (limit) throw new RecipeLinkError('unsupported', limit);
  const url = `${origin.replace(/\/+$/, '')}${RECIPE_LINK_PATH}#${VERSION}.${toBase64Url(utf8(JSON.stringify(payload)))}`;
  if (url.length > MAX_LINK_LENGTH) throw new RecipeLinkError('size');
  return url;
}

// Accepts the link alone or inside a pasted message; the address before the path is not
// checked, the data is. Nothing is written here.
export function parseRecipeLink(input: string): SharedRecipe {
  const match = /\/shared-recipe#(\d+)\.(\S*)/.exec(input);
  if (!match) throw new RecipeLinkError('missing');
  if (Number(match[1]) !== VERSION) throw new RecipeLinkError('version');
  if (match[2].length > MAX_LINK_LENGTH) throw new RecipeLinkError('size');
  let value: unknown;
  try { value = JSON.parse(fromUtf8(fromBase64Url(match[2]))); } catch { throw new RecipeLinkError('invalid'); }
  const payload = value as Payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !(payload.c === null || Object.hasOwn(CODES, payload.c)) || outsideLimits(payload)) throw new RecipeLinkError('invalid');
  return { title: payload.t, category: payload.c === null ? null : CODES[payload.c], time: payload.m, ingredients: [...payload.i], steps: [...payload.s] };
}
