import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { checkRecipeUrl, FETCH_LIMITS, fetchRecipePage } from './fetch-recipe-page.ts';
import { parseRecipePage } from './recipe-import.ts';

// A server as fetch() sees it: every request is recorded with the options the loader sent.
// Responses are real WHATWG Response objects, so streaming, cancel and headers behave as in a
// browser; the abort behaviour follows the signal as both expo/fetch and browsers do.
function server(handler) {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (init.signal?.aborted) throw Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
    return handler(String(url), init);
  };
  return { fetch, requests };
}
const html = (body, headers = {}) => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
const page = text => `<!doctype html><html><head><title>${text}</title></head><body>${text}</body></html>`;
// A body that sends chunks of a given size and records how far it was read.
function chunked(chunk, count, { headers = {}, failAt } = {}) {
  const state = { pulled: 0, cancelled: false };
  const body = new ReadableStream({
    pull(controller) {
      if (failAt !== undefined && state.pulled === failAt) { controller.error(new Error('connection reset')); return; }
      if (state.pulled === count) { controller.close(); return; }
      state.pulled++;
      controller.enqueue(new Uint8Array(chunk).fill(0x61));
    },
    cancel() { state.cancelled = true; },
  }, { highWaterMark: 0 });
  return { response: new Response(body, { status: 200, headers: { 'content-type': 'text/html', ...headers } }), state };
}
const load = (url, fetch, options = {}) => fetchRecipePage(url, { fetch, ...options });

test('only absolute https addresses to public host names are allowed; the address is normalised', () => {
  assert.deepEqual(checkRecipeUrl('  https://Eda.RU/recepty/zavtraki/sirniki-18506  '), { ok: true, url: 'https://eda.ru/recepty/zavtraki/sirniki-18506' });
  assert.deepEqual(checkRecipeUrl('https://www.bbcgoodfood.com:443/recipes/easy-pancakes?x=1#y'), { ok: true, url: 'https://www.bbcgoodfood.com/recipes/easy-pancakes?x=1' });
  assert.deepEqual(checkRecipeUrl('https://пример.рф/рецепт'), { ok: true, url: 'https://xn--e1afmkfd.xn--p1ai/%D1%80%D0%B5%D1%86%D0%B5%D0%BF%D1%82' });
  for (const text of ['', '   ', 'eda.ru/recepty', '/recepty/1', 'https://', 'https:// eda.ru', 'not a url', 'https://exa mple.com/']) {
    assert.deepEqual(checkRecipeUrl(text), { ok: false, status: 'invalidUrl' }, text);
  }
});

test('other schemes, credentials and other ports are blocked', () => {
  const reason = text => { const r = checkRecipeUrl(text); return r.ok ? 'ok' : r.status === 'blockedUrl' ? r.reason : r.status; };
  for (const text of ['http://eda.ru/recepty', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,<h1>x</h1>', 'ftp://eda.ru/', 'blob:https://eda.ru/1', 'ws://eda.ru/']) {
    assert.equal(reason(text), 'scheme', text);
  }
  assert.equal(reason('https://user:pass@eda.ru/'), 'credentials');
  assert.equal(reason('https://user@eda.ru/'), 'credentials');
  assert.equal(reason('https://eda.ru:8443/'), 'port');
  assert.equal(reason('https://eda.ru:80/'), 'port');
});

test('local names, loopback, private, link-local and any IP literal are blocked', () => {
  const reason = text => { const r = checkRecipeUrl(text); return r.ok ? 'ok' : r.reason; };
  for (const host of ['localhost', 'LOCALHOST', 'app.localhost', 'printer.local', 'nas.lan', 'router.home.arpa', 'db.internal', 'intranet', 'localhost.']) {
    assert.equal(reason(`https://${host}/`), 'localHost', host);
  }
  for (const host of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '8.8.8.8',
    '2130706433', '0x7f000001', '0177.0.0.1', '127.1', '[::1]', '[fe80::1]', '[fd00::1]', '[::ffff:127.0.0.1]', '[2606:4700::1111]']) {
    assert.equal(reason(`https://${host}/`), 'ipAddress', host);
  }
});

test('the same decisions with the URL that Expo installs on Android and iOS (whatwg-url-minimum)', async () => {
  const { URL: NativeURL } = await import('whatwg-url-minimum');
  const cases = ['https://Eda.RU:443/x#y', 'https://пример.рф/рецепт', 'http://eda.ru/', 'https://user@eda.ru/', 'https://eda.ru:8443/', 'https://localhost/', 'https://printer.local/',
    'https://2130706433/', 'https://0x7f000001/', 'https://0177.0.0.1/', 'https://127.1/', 'https://[::1]/', 'https://[::ffff:127.0.0.1]/', 'https://exa mple.com/', 'eda.ru'];
  const expected = cases.map(text => checkRecipeUrl(text));
  const saved = globalThis.URL;
  globalThis.URL = NativeURL;
  try { assert.deepEqual(cases.map(text => checkRecipeUrl(text)), expected); } finally { globalThis.URL = saved; }
});

test('a blocked or invalid address is never requested', async () => {
  const { fetch, requests } = server(() => html(page('x')));
  assert.deepEqual(await load('http://eda.ru/', fetch), { status: 'blockedUrl', reason: 'scheme', redirect: false });
  assert.deepEqual(await load('https://192.168.0.1/', fetch), { status: 'blockedUrl', reason: 'ipAddress', redirect: false });
  assert.deepEqual(await load('eda.ru', fetch), { status: 'invalidUrl' });
  assert.equal(requests.length, 0);
});

test('a successful HTML page: one GET without credentials, cookies or a body, the decoded text returned', async () => {
  const { fetch, requests } = server(() => html(page('Сырники из творога 😊')));
  const result = await load('https://eda.ru/recepty/1', fetch);
  assert.deepEqual(result, { status: 'success', html: page('Сырники из творога 😊'), url: 'https://eda.ru/recepty/1', encoding: 'utf-8' });
  assert.equal(requests.length, 1);
  const { init } = requests[0];
  assert.equal(init.method, 'GET');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.redirect, 'manual');
  assert.equal(init.body, undefined);
  assert.ok(init.signal instanceof AbortSignal);
  assert.match(new Headers(init.headers).get('accept'), /text\/html/);
  assert.equal(new Headers(init.headers).get('cookie'), null);
});

test('an empty response is its own result', async () => {
  assert.deepEqual(await load('https://eda.ru/1', server(() => html('')).fetch), { status: 'empty' });
  assert.deepEqual(await load('https://eda.ru/1', server(() => new Response(null, { status: 204, headers: { 'content-type': 'text/html' } })).fetch), { status: 'empty' });
});

test('a Content-Length above the limit is refused before reading the body', async () => {
  const big = chunked(1024, 10, { headers: { 'content-length': String(FETCH_LIMITS.maxBytes + 1) } });
  assert.deepEqual(await load('https://eda.ru/1', server(() => big.response).fetch), { status: 'tooLarge', limit: FETCH_LIMITS.maxBytes });
  assert.equal(big.state.pulled, 0);
  assert.equal(big.state.cancelled, true);
});

test('a body larger than the limit is stopped once the limit is passed, whatever Content-Length says', async () => {
  const chunk = 256 * 1024;
  for (const headers of [{}, { 'content-length': '1000' }]) {
    const big = chunked(chunk, 100, { headers });
    assert.deepEqual(await load('https://eda.ru/1', server(() => big.response).fetch), { status: 'tooLarge', limit: FETCH_LIMITS.maxBytes });
    // 3 MiB is 12 chunks of 256 KiB: reading stops at the 13th, not at the 100th.
    assert.equal(big.state.pulled, FETCH_LIMITS.maxBytes / chunk + 1);
    assert.equal(big.state.cancelled, true);
  }
  // Exactly at the limit is accepted.
  const exact = chunked(chunk, FETCH_LIMITS.maxBytes / chunk);
  const result = await load('https://eda.ru/1', server(() => exact.response).fetch);
  assert.equal(result.status, 'success');
  assert.equal(result.html.length, FETCH_LIMITS.maxBytes);
});

test('cancelled before the response: no result but "cancelled", whatever error fetch throws', async () => {
  const controller = new AbortController();
  controller.abort();
  const { fetch, requests } = server(() => html(page('x')));
  assert.deepEqual(await load('https://eda.ru/1', fetch, { signal: controller.signal }), { status: 'cancelled' });
  assert.equal(requests.length, 0);
  // expo/fetch rejects an aborted request with a plain FetchError, not an AbortError.
  const late = new AbortController();
  const hanging = async (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('fetch failed: The operation was aborted.'))));
  const pending = load('https://eda.ru/1', hanging, { signal: late.signal });
  late.abort();
  assert.deepEqual(await pending, { status: 'cancelled' });
});

test('cancelled while reading: reading stops and the body is released', async () => {
  const controller = new AbortController();
  const state = { cancelled: false, pulled: 0 };
  const body = new ReadableStream({
    async pull(c) {
      state.pulled++;
      if (state.pulled === 2) controller.abort();
      await new Promise(resolve => setTimeout(resolve, 5));
      c.enqueue(new TextEncoder().encode('<p>часть</p>'));
    },
    cancel() { state.cancelled = true; },
  }, { highWaterMark: 0 });
  const result = await load('https://eda.ru/1', server(() => new Response(body, { headers: { 'content-type': 'text/html' } })).fetch, { signal: controller.signal });
  assert.deepEqual(result, { status: 'cancelled' });
  assert.equal(state.cancelled, true);
  assert.ok(state.pulled <= 3);
});

test('timeout: before the response and while reading, with the request aborted', async () => {
  const limits = { timeoutMs: 40 };
  let aborted = false;
  const silent = async (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('fetch failed')); }));
  assert.deepEqual(await load('https://eda.ru/1', silent, { limits }), { status: 'timeout', limitMs: 40 });
  assert.equal(aborted, true);
  const state = { cancelled: false };
  const slowBody = new ReadableStream({ pull: () => new Promise(() => {}), cancel() { state.cancelled = true; } }, { highWaterMark: 0 });
  assert.deepEqual(await load('https://eda.ru/1', server(() => new Response(slowBody, { headers: { 'content-type': 'text/html' } })).fetch, { limits }), { status: 'timeout', limitMs: 40 });
  assert.equal(state.cancelled, true);
  assert.equal(FETCH_LIMITS.timeoutMs, 15_000);
});

test('HTTP errors are told apart and their bodies are not read', async () => {
  const status = async (code, headers = {}) => {
    const body = chunked(16, 3);
    const response = new Response(body.response.body, { status: code, headers: { 'content-type': 'text/html', ...headers } });
    const result = await load('https://eda.ru/1', server(() => response).fetch);
    assert.equal(body.state.pulled, 0, String(code));
    return result;
  };
  assert.deepEqual(await status(403), { status: 'httpError', httpStatus: 403, kind: 'denied' });
  assert.deepEqual(await status(401), { status: 'httpError', httpStatus: 401, kind: 'denied' });
  assert.deepEqual(await status(404), { status: 'httpError', httpStatus: 404, kind: 'notFound' });
  assert.deepEqual(await status(410), { status: 'httpError', httpStatus: 410, kind: 'notFound' });
  assert.deepEqual(await status(429, { 'retry-after': '120' }), { status: 'httpError', httpStatus: 429, kind: 'rateLimited', retryAfterSeconds: 120 });
  assert.deepEqual(await status(429, { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' }), { status: 'httpError', httpStatus: 429, kind: 'rateLimited' });
  assert.deepEqual(await status(500), { status: 'httpError', httpStatus: 500, kind: 'server' });
  assert.deepEqual(await status(503), { status: 'httpError', httpStatus: 503, kind: 'server' });
  assert.deepEqual(await status(418), { status: 'httpError', httpStatus: 418, kind: 'other' });
  // A Cloudflare challenge is a 403 like any other: nothing is tried to get past it.
  const { fetch, requests } = server(() => new Response('<title>Just a moment...</title>', { status: 403, headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' } }));
  assert.deepEqual(await load('https://www.allrecipes.com/recipe/1/', fetch), { status: 'httpError', httpStatus: 403, kind: 'denied' });
  assert.equal(requests.length, 1);
});

test('only HTML is accepted', async () => {
  const typed = async type => load('https://eda.ru/1', server(() => new Response('{}', { headers: type === null ? {} : { 'content-type': type } })).fetch);
  for (const type of ['application/json', 'image/jpeg', 'text/plain', 'application/pdf', 'video/mp4', 'text/htmlx']) {
    assert.deepEqual(await typed(type), { status: 'unsupportedContentType', contentType: type }, type);
  }
  const missing = await load('https://eda.ru/1', server(() => new Response(new Uint8Array([0x3c]), { headers: {} })).fetch);
  assert.deepEqual(missing, { status: 'unsupportedContentType', contentType: null });
  for (const type of ['text/html', 'TEXT/HTML; charset=UTF-8', 'application/xhtml+xml']) assert.equal((await typed(type)).status, 'success', type);
});

test('UTF-8 with Cyrillic and emoji, also split across chunks inside a character', async () => {
  const text = page('Сырники «как у бабушки» 😊 — ёж');
  const bytes = new TextEncoder().encode(text);
  // Chunks of 3 bytes cut every two-byte letter and the four-byte emoji.
  const body = new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 3) c.enqueue(bytes.slice(i, i + 3)); c.close(); } });
  const result = await load('https://eda.ru/1', server(() => new Response(body, { headers: { 'content-type': 'text/html' } })).fetch);
  assert.equal(result.html, text);
  assert.equal(result.encoding, 'utf-8');
});

test('a BOM decides the encoding, over the header and the meta tag, and is not part of the text', async () => {
  const text = page('Сырники');
  const send = (bytes, type = 'text/html; charset=windows-1251') => load('https://eda.ru/1', server(() => new Response(bytes, { headers: { 'content-type': type } })).fetch);
  const utf8 = await send(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]));
  assert.deepEqual([utf8.encoding, utf8.html], ['utf-8', text]);
  const le = await send(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));
  assert.deepEqual([le.encoding, le.html], ['utf-16le', text]);
  const be = Buffer.from(text, 'utf16le'); be.swap16();
  const beResult = await send(Buffer.concat([Buffer.from([0xfe, 0xff]), be]));
  assert.deepEqual([beResult.encoding, beResult.html], ['utf-16be', text]);
});

// "Сырники" in windows-1251.
const SYRNIKI_1251 = [0xd1, 0xfb, 0xf0, 0xed, 0xe8, 0xea, 0xe8];
const cp1251Page = (head = '') => Buffer.concat([Buffer.from(`<html><head>${head}<title>`, 'ascii'), Buffer.from(SYRNIKI_1251), Buffer.from('</title></head></html>', 'ascii')]);

test('charset from the Content-Type header', async () => {
  const result = await load('https://www.povarenok.ru/1', server(() => new Response(cp1251Page(), { headers: { 'content-type': 'text/html; charset="Windows-1251"' } })).fetch);
  assert.equal(result.encoding, 'windows-1251');
  assert.equal(result.html, '<html><head><title>Сырники</title></head></html>');
  // The header wins over a different meta tag.
  const both = await load('https://x.ru/1', server(() => new Response(cp1251Page('<meta charset="utf-8">'), { headers: { 'content-type': 'text/html;charset=cp1251' } })).fetch);
  assert.equal(both.encoding, 'windows-1251');
});

test('charset from a meta tag at the start of the document', async () => {
  for (const meta of ['<meta charset="windows-1251">', "<META CHARSET='windows-1251' />", '<meta http-equiv="Content-Type" content="text/html; charset=windows-1251">', '<meta content="text/html; charset=windows-1251" http-equiv="content-type">']) {
    const result = await load('https://x.ru/1', server(() => new Response(cp1251Page(meta), { headers: { 'content-type': 'text/html' } })).fetch);
    assert.equal(result.encoding, 'windows-1251', meta);
    assert.match(result.html, /<title>Сырники<\/title>/, meta);
  }
  // Past the first 1024 bytes a meta tag is not looked for: UTF-8, and the windows-1251 bytes are invalid UTF-8.
  const late = Buffer.concat([Buffer.from(`<html><head><!--${'x'.repeat(1100)}--><meta charset="windows-1251"><title>`, 'ascii'), Buffer.from(SYRNIKI_1251), Buffer.from('</title></head></html>')]);
  assert.deepEqual(await load('https://x.ru/1', server(() => new Response(late, { headers: { 'content-type': 'text/html' } })).fetch), { status: 'invalidEncoding', encoding: 'utf-8' });
});

test('no charset anywhere: UTF-8', async () => {
  const result = await load('https://x.ru/1', server(() => new Response(page('Борщ'), { headers: { 'content-type': 'text/html' } })).fetch);
  assert.deepEqual([result.status, result.encoding, result.html], ['success', 'utf-8', page('Борщ')]);
});

test('an encoding the platform cannot decode is reported, not guessed', async () => {
  const unknown = await load('https://x.ru/1', server(() => new Response('<p>x</p>', { headers: { 'content-type': 'text/html; charset=x-made-up' } })).fetch);
  assert.deepEqual(unknown, { status: 'unsupportedEncoding', encoding: 'x-made-up' });
  // A runtime whose TextDecoder knows only UTF-8 (as documented for Expo on native): windows-1251 is refused, not read as UTF-8.
  class Utf8Only {
    constructor(label = 'utf-8', options) {
      if (!['utf-8', 'utf8', 'unicode-1-1-utf-8'].includes(String(label).trim().toLowerCase())) throw new RangeError(`Unsupported encoding: ${label}`);
      this.inner = new TextDecoder('utf-8', options);
      this.encoding = 'utf-8';
    }
    decode(bytes) { return this.inner.decode(bytes); }
  }
  const refused = await load('https://www.povarenok.ru/1', server(() => new Response(cp1251Page(), { headers: { 'content-type': 'text/html; charset=windows-1251' } })).fetch, { TextDecoder: Utf8Only });
  assert.deepEqual(refused, { status: 'unsupportedEncoding', encoding: 'windows-1251' });
  // A runtime that ignores fatal and quietly substitutes U+FFFD is caught too.
  class Lenient { constructor(label) { this.inner = new TextDecoder(label); this.encoding = this.inner.encoding; } decode(bytes) { return this.inner.decode(bytes); } }
  const quiet = await load('https://x.ru/1', server(() => new Response(cp1251Page(), { headers: { 'content-type': 'text/html; charset=utf-8' } })).fetch, { TextDecoder: Lenient });
  assert.deepEqual(quiet, { status: 'invalidEncoding', encoding: 'utf-8' });
});

test('damaged bytes are an error, not replacement characters', async () => {
  const bad = Buffer.concat([Buffer.from('<p>Сыр', 'utf8'), Buffer.from([0xc3, 0x28]), Buffer.from('ники</p>', 'utf8')]);
  assert.deepEqual(await load('https://x.ru/1', server(() => new Response(bad, { headers: { 'content-type': 'text/html' } })).fetch), { status: 'invalidEncoding', encoding: 'utf-8' });
  // A page that really contains U+FFFD (written as such) is not mistaken for damage.
  const real = page('Знак � в тексте');
  assert.equal((await load('https://x.ru/1', server(() => html(real)).fetch)).html, real);
  // Cut in the middle of a character at the very end.
  const cut = Buffer.from('<p>Сыр', 'utf8').subarray(0, -1);
  assert.deepEqual(await load('https://x.ru/1', server(() => new Response(cut, { headers: { 'content-type': 'text/html' } })).fetch), { status: 'invalidEncoding', encoding: 'utf-8' });
});

test('network failures: before the response and while reading; the reason is not invented', async () => {
  // A browser blocked by CORS rejects with a TypeError that looks like any other network failure.
  const cors = async () => { throw new TypeError('Failed to fetch'); };
  assert.deepEqual(await load('https://eda.ru/1', cors), { status: 'networkError', stage: 'request' });
  const offline = async () => { throw new Error('fetch failed: Unable to resolve host'); };
  assert.deepEqual(await load('https://eda.ru/1', offline), { status: 'networkError', stage: 'request' });
  const broken = chunked(1024, 10, { failAt: 2 });
  assert.deepEqual(await load('https://eda.ru/1', server(() => broken.response).fetch), { status: 'networkError', stage: 'read' });
});

test('without a body stream: read whole only when Content-Length is known and within the limit', async () => {
  const bytes = new TextEncoder().encode(page('Сырники'));
  const legacy = (headers, data = bytes) => ({
    status: 200, ok: true, url: 'https://eda.ru/1', redirected: false, type: 'basic', body: null,
    headers: new Headers({ 'content-type': 'text/html', ...headers }),
    arrayBuffer: async () => { legacy.read = true; return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength); },
  });
  const ok = await load('https://eda.ru/1', async () => legacy({ 'content-length': String(bytes.length) }));
  assert.equal(ok.html, page('Сырники'));
  legacy.read = false;
  assert.deepEqual(await load('https://eda.ru/1', async () => legacy({})), { status: 'networkError', stage: 'noStream' });
  assert.equal(legacy.read, false);
  // Content-Length that lies low: the whole body is in memory by then, but it is still refused.
  const lie = new Uint8Array(FETCH_LIMITS.maxBytes + 10).fill(0x61);
  assert.deepEqual(await load('https://eda.ru/1', async () => legacy({ 'content-length': '100' }, lie)), { status: 'tooLarge', limit: FETCH_LIMITS.maxBytes });
});

test('redirects (native): each target is checked before it is requested, at most five', async () => {
  const hops = { 'https://eda.ru/a': 'https://eda.rambler.ru/a', 'https://eda.rambler.ru/a': '/b', 'https://eda.rambler.ru/b': null };
  const { fetch, requests } = server(url => hops[url] ? new Response(null, { status: 301, headers: { location: hops[url] } }) : html(page('Сырники')));
  const result = await load('https://eda.ru/a', fetch);
  assert.deepEqual([result.status, result.url], ['success', 'https://eda.rambler.ru/b']);
  assert.deepEqual(requests.map(r => r.url), ['https://eda.ru/a', 'https://eda.rambler.ru/a', 'https://eda.rambler.ru/b']);
  for (const target of ['http://eda.ru/a', 'https://127.0.0.1/admin', 'https://localhost/', 'https://eda.ru:8080/']) {
    const s = server(url => url === 'https://eda.ru/a' ? new Response(null, { status: 302, headers: { location: target } }) : html('secret'));
    const r = await load('https://eda.ru/a', s.fetch);
    assert.equal(r.status, 'blockedUrl', target);
    assert.equal(r.redirect, true, target);
    assert.equal(s.requests.length, 1, target);
  }
  const loop = server(url => new Response(null, { status: 302, headers: { location: `${url}x` } }));
  assert.deepEqual(await load('https://eda.ru/a', loop.fetch), { status: 'tooManyRedirects', limit: FETCH_LIMITS.redirects });
  assert.equal(loop.requests.length, FETCH_LIMITS.redirects + 1);
  const nowhere = server(() => new Response(null, { status: 302 }));
  assert.deepEqual(await load('https://eda.ru/a', nowhere.fetch), { status: 'httpError', httpStatus: 302, kind: 'other' });
});

test('redirects (browser): the browser follows them; a final address that is not allowed is refused', async () => {
  const followed = (finalUrl, body = page('Сырники')) => async (url, init) => {
    assert.equal(init.redirect, 'follow');
    const response = html(body);
    Object.defineProperty(response, 'url', { value: finalUrl });
    Object.defineProperty(response, 'redirected', { value: finalUrl !== url });
    return response;
  };
  const ok = await load('https://eda.ru/a', followed('https://eda.rambler.ru/a'), { redirect: 'follow' });
  assert.deepEqual([ok.status, ok.url], ['success', 'https://eda.rambler.ru/a']);
  assert.deepEqual(await load('https://eda.ru/a', followed('https://192.168.1.1/'), { redirect: 'follow' }), { status: 'blockedUrl', reason: 'ipAddress', redirect: true });
  // An opaque redirect (redirect: "manual" in a browser) cannot be checked: a network error, not success.
  const opaqueResponse = { type: 'opaqueredirect', status: 0, ok: false, url: '', redirected: false, headers: new Headers(), body: null };
  assert.deepEqual(await load('https://eda.ru/a', async () => opaqueResponse), { status: 'networkError', stage: 'redirect' });
});

test('the loaded page goes to parseRecipePage unchanged', async () => {
  const recipe = { '@context': 'https://schema.org', '@type': 'Recipe', name: 'Сырники «как у бабушки»', recipeCategory: 'Завтрак', totalTime: 'PT30M',
    recipeIngredient: ['Творог — 400 г', 'Яйцо — 1 шт.'], recipeInstructions: [{ '@type': 'HowToStep', text: 'Смешать.' }, { '@type': 'HowToStep', text: 'Обжарить.' }] };
  const body = `<!doctype html><html><head><meta charset="windows-1251"><script type="application/ld+json">${JSON.stringify(recipe)}</script></head><body></body></html>`;
  // Served as windows-1251 bytes, as by povarenok.ru; encoded here with the platform's own table.
  const encode1251 = text => {
    const table = new TextDecoder('windows-1251').decode(Uint8Array.from({ length: 256 }, (_, i) => i));
    return Uint8Array.from([...text].map(ch => { const code = table.indexOf(ch); assert.notEqual(code, -1, ch); return code; }));
  };
  const loaded = await load('https://www.povarenok.ru/recipes/show/1/', server(() => new Response(encode1251(body), { headers: { 'content-type': 'text/html' } })).fetch);
  assert.equal(loaded.status, 'success');
  assert.equal(loaded.encoding, 'windows-1251');
  const parsed = parseRecipePage(loaded.html);
  assert.equal(parsed.status, 'complete');
  assert.deepEqual(parsed.draft, { title: 'Сырники «как у бабушки»', category: 'Завтрак', time: 30, ingredients: ['Творог — 400 г', 'Яйцо — 1 шт.'], steps: ['Смешать.', 'Обжарить.'] });
  // At most 3 MiB of bytes is at most that many characters, within the parser's page limit.
  assert.ok(FETCH_LIMITS.maxBytes <= 6_000_000);
});

test('the loader writes nothing: no storage, and one request per address it follows', async () => {
  const saved = { localStorage: globalThis.localStorage };
  const touched = [];
  globalThis.localStorage = new Proxy({}, { get: (_, key) => { touched.push(String(key)); throw new Error('storage'); } });
  try {
    const { fetch, requests } = server(() => html(page('x')));
    assert.equal((await load('https://eda.ru/1', fetch)).status, 'success');
    assert.equal(requests.length, 1);
  } finally { globalThis.localStorage = saved.localStorage; }
  assert.deepEqual(touched, []);
});
