// Loads a cooking site's page for parseRecipePage: one checked https address, a bounded GET,
// and the bytes decoded by the platform's TextDecoder. Nothing is stored and the page is not
// run or shown. No attempt is made to get past a site's protection (403, challenges, sign-in).
//
// fetch: on Android and iOS the global fetch is expo/fetch (Expo SDK 58 installs it), on the web
// the browser's. Both stream the body. Differences that matter here:
// - Redirects. expo/fetch honours redirect: "manual" and hands back the 3xx with its Location, so
//   every hop is checked before it is requested. A browser hides that ("opaqueredirect"), so on
//   the web the browser follows redirects itself and only the final address is checked, after
//   the fact: a hop through a refused address cannot be prevented there.
// - Host names are checked as written. Whether a public name resolves to a private address
//   (DNS rebinding) cannot be seen from JavaScript on any platform.
// - In a browser, CORS refusals look like any other network failure and are reported as one.

export const FETCH_LIMITS = { timeoutMs: 15_000, maxBytes: 3 * 1024 * 1024, redirects: 5 };
type Limits = typeof FETCH_LIMITS;

export type BlockedReason = 'scheme' | 'credentials' | 'port' | 'localHost' | 'ipAddress';
export type PageFetchResult =
  // url: the address the page came from, after redirects.
  | { status: 'success'; html: string; url: string; encoding: string }
  | { status: 'invalidUrl' }
  // redirect: true when a redirect led there.
  | { status: 'blockedUrl'; reason: BlockedReason; redirect: boolean }
  | { status: 'tooManyRedirects'; limit: number }
  // denied: 401/403 (also bot challenges), notFound: 404/410, rateLimited: 429, server: 5xx.
  | { status: 'httpError'; httpStatus: number; kind: 'denied' | 'notFound' | 'rateLimited' | 'server' | 'other'; retryAfterSeconds?: number }
  | { status: 'unsupportedContentType'; contentType: string | null }
  | { status: 'empty' }
  | { status: 'tooLarge'; limit: number }
  | { status: 'timeout'; limitMs: number }
  | { status: 'cancelled' }
  // stage: request (no response: offline, DNS, TLS, CORS...), read (the body broke off), redirect
  // (a redirect the platform does not let us see), noStream (no body stream and no size known).
  | { status: 'networkError'; stage: 'request' | 'read' | 'redirect' | 'noStream' }
  | { status: 'unsupportedEncoding'; encoding: string }
  | { status: 'invalidEncoding'; encoding: string };

type Decoder = { decode(input: Uint8Array): string; readonly encoding: string };
export type FetchPageOptions = {
  signal?: AbortSignal;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  TextDecoder?: new (label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean }) => Decoder;
  // Default: "manual" where there is no DOM (Android, iOS, tests), "follow" in a browser.
  redirect?: 'manual' | 'follow';
  limits?: Partial<Limits>;
};

// --- The address -----------------------------------------------------------------------------

const LOCAL_SUFFIXES = ['localhost', 'local', 'lan', 'internal', 'intranet', 'home', 'corp', 'home.arpa', 'localdomain'];
export function checkRecipeUrl(text: string): { ok: true; url: string } | { ok: false; status: 'invalidUrl' } | { ok: false; status: 'blockedUrl'; reason: BlockedReason } {
  let url: URL;
  try { url = new URL(text.trim()); } catch { return { ok: false, status: 'invalidUrl' }; }
  if (url.protocol !== 'https:') return { ok: false, status: 'blockedUrl', reason: 'scheme' };
  if (!url.hostname) return { ok: false, status: 'invalidUrl' };
  if (url.username || url.password) return { ok: false, status: 'blockedUrl', reason: 'credentials' };
  if (url.port) return { ok: false, status: 'blockedUrl', reason: 'port' };
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const labels = host.split('.');
  // Any IP literal: IPv6 in brackets, or a last label that a URL parser reads as IPv4 (127.1,
  // 2130706433, 0x7f000001). Recipe sites are reached by name.
  if (host.startsWith('[') || /^(0x[0-9a-f]*|\d+)$/.test(labels[labels.length - 1])) return { ok: false, status: 'blockedUrl', reason: 'ipAddress' };
  if (labels.length < 2 || LOCAL_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`))) return { ok: false, status: 'blockedUrl', reason: 'localHost' };
  url.hash = '';
  return { ok: true, url: url.href };
}

// --- Encoding --------------------------------------------------------------------------------

const charsetIn = (text: string | null) => text?.match(/charset\s*=\s*["']?\s*([^"'\s;>]+)/i)?.[1] ?? null;
// The first 1024 bytes, as the HTML prescan does: <meta charset> or http-equiv Content-Type.
function metaCharset(bytes: Uint8Array) {
  let head = '';
  for (let i = 0; i < Math.min(bytes.length, 1024); i++) head += String.fromCharCode(bytes[i]);
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const direct = tag.match(/\scharset\s*=\s*["']?\s*([^"'\s;/>]+)/i)?.[1];
    if (direct) return direct;
    if (/http-equiv\s*=\s*["']?content-type/i.test(tag)) {
      const content = tag.match(/\scontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      const found = charsetIn(content?.[1] ?? content?.[2] ?? null);
      if (found) return found;
    }
  }
  return null;
}
// BOM, then the HTTP header, then the meta tag, then UTF-8. A meta tag cannot declare UTF-16
// (the bytes it is read from are ASCII), so that means UTF-8, as in browsers.
function encodingOf(bytes: Uint8Array, contentType: string | null): { label: string; skip: number } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { label: 'utf-8', skip: 3 };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { label: 'utf-16le', skip: 2 };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { label: 'utf-16be', skip: 2 };
  const header = charsetIn(contentType);
  if (header) return { label: header, skip: 0 };
  const meta = metaCharset(bytes);
  if (meta) return { label: /^utf-?16/i.test(meta) ? 'utf-8' : meta, skip: 0 };
  return { label: 'utf-8', skip: 0 };
}
// Literal U+FFFD in UTF-8 bytes: a replacement character the page really contains.
function realReplacements(bytes: Uint8Array, utf8: boolean) {
  if (!utf8) return 0;
  let count = 0;
  for (let i = 0; i + 2 < bytes.length; i++) if (bytes[i] === 0xef && bytes[i + 1] === 0xbf && bytes[i + 2] === 0xbd) count++;
  return count;
}
function decode(bytes: Uint8Array, contentType: string | null, Decoder: NonNullable<FetchPageOptions['TextDecoder']>):
  { ok: true; text: string; encoding: string } | { ok: false; status: 'unsupportedEncoding' | 'invalidEncoding'; encoding: string } {
  const { label, skip } = encodingOf(bytes, contentType);
  let decoder: Decoder;
  try { decoder = new Decoder(label, { fatal: true, ignoreBOM: true }); } catch { return { ok: false, status: 'unsupportedEncoding', encoding: label }; }
  const encoding = decoder.encoding || label;
  const body = bytes.subarray(skip);
  let text: string;
  try { text = decoder.decode(body); } catch { return { ok: false, status: 'invalidEncoding', encoding }; }
  // A runtime that ignores fatal substitutes U+FFFD silently: more of them than the page wrote means damage.
  const replaced = text.split('�').length - 1;
  if (replaced > realReplacements(body, encoding === 'utf-8')) return { ok: false, status: 'invalidEncoding', encoding };
  return { ok: true, text, encoding };
}

// --- The request -----------------------------------------------------------------------------

const HTML_TYPES = ['text/html', 'application/xhtml+xml'];
function httpError(response: Response): PageFetchResult {
  const code = response.status;
  const kind = code === 401 || code === 403 ? 'denied' : code === 404 || code === 410 ? 'notFound' : code === 429 ? 'rateLimited' : code >= 500 ? 'server' : 'other';
  const retry = response.headers.get('retry-after');
  return { status: 'httpError', httpStatus: code, kind, ...(kind === 'rateLimited' && retry && /^\d+$/.test(retry.trim()) ? { retryAfterSeconds: Number(retry) } : {}) };
}
const release = (response: Response) => { response.body?.cancel().catch(() => {}); };
const isRedirect = (code: number) => code === 301 || code === 302 || code === 303 || code === 307 || code === 308;

// Reads at most limit bytes; the stream is cancelled as soon as more arrive, and when the load
// is aborted (so reading stops even where the platform does not end the stream itself).
async function readBody(response: Response, limit: number, signal: AbortSignal):
  Promise<{ ok: true; bytes: Uint8Array } | { ok: false; result: PageFetchResult } | { ok: false; abort: true }> {
  if (!response.body) {
    // No content (204, 205): no body by definition.
    if (response.status === 204 || response.status === 205) return { ok: true, bytes: new Uint8Array(0) };
    // No stream (a legacy fetch): only a body of known, allowed size is read whole.
    if (response.headers.get('content-length') === null) return { ok: false, result: { status: 'networkError', stage: 'noStream' } };
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length > limit ? { ok: false, result: { status: 'tooLarge', limit } } : { ok: true, bytes };
  }
  const reader = response.body.getReader();
  const stop = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', stop);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (signal.aborted) return { ok: false, abort: true };
      if (done) break;
      size += value.byteLength;
      if (size > limit) { stop(); return { ok: false, result: { status: 'tooLarge', limit } }; }
      chunks.push(value);
    }
  } catch {
    stop();
    return signal.aborted ? { ok: false, abort: true } : { ok: false, result: { status: 'networkError', stage: 'read' } };
  } finally {
    signal.removeEventListener('abort', stop);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { ok: true, bytes };
}

export async function fetchRecipePage(address: string, options: FetchPageOptions = {}): Promise<PageFetchResult> {
  const limits = { ...FETCH_LIMITS, ...options.limits };
  const fetchPage = options.fetch ?? ((url: string, init: RequestInit) => globalThis.fetch(url, init));
  const Decoder = options.TextDecoder ?? globalThis.TextDecoder;
  const redirect = options.redirect ?? (typeof document === 'undefined' ? 'manual' : 'follow');
  const first = checkRecipeUrl(address);
  if (!first.ok) return first.status === 'invalidUrl' ? { status: 'invalidUrl' } : { status: 'blockedUrl', reason: first.reason, redirect: false };
  if (options.signal?.aborted) return { status: 'cancelled' };

  // One controller for the whole load: the caller's cancel and the time limit both abort it.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, limits.timeoutMs);
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel);
  // Settles as soon as the load is aborted, even if the platform's fetch or read does not.
  const abortedWait = new Promise<'aborted'>(resolve => controller.signal.addEventListener('abort', () => resolve('aborted')));
  const stopped = (): PageFetchResult => (timedOut ? { status: 'timeout', limitMs: limits.timeoutMs } : { status: 'cancelled' });

  try {
    let url = first.url;
    for (let hop = 0; ; hop++) {
      let response: Response;
      try {
        const answer = await Promise.race([fetchPage(url, {
          method: 'GET', credentials: 'omit', redirect, referrerPolicy: 'no-referrer', signal: controller.signal,
          headers: { accept: 'text/html,application/xhtml+xml' },
        }), abortedWait]);
        if (answer === 'aborted') return stopped();
        response = answer;
      } catch {
        // An abort settles the race above first, so this is a failure of the request itself.
        return { status: 'networkError', stage: 'request' };
      }
      if (response.type === 'opaqueredirect') return { status: 'networkError', stage: 'redirect' };
      if (redirect === 'manual' && isRedirect(response.status)) {
        const location = response.headers.get('location');
        release(response);
        if (!location) return httpError(response);
        if (hop === limits.redirects) return { status: 'tooManyRedirects', limit: limits.redirects };
        let target: string;
        try { target = new URL(location, url).href; } catch { return { status: 'invalidUrl' }; }
        const next = checkRecipeUrl(target);
        if (!next.ok) return next.status === 'invalidUrl' ? { status: 'invalidUrl' } : { status: 'blockedUrl', reason: next.reason, redirect: true };
        url = next.url;
        continue;
      }
      // Followed by the browser: the final address must pass the same check.
      if (response.url && response.url !== url) {
        const final = checkRecipeUrl(response.url);
        if (!final.ok) { release(response); return final.status === 'invalidUrl' ? { status: 'invalidUrl' } : { status: 'blockedUrl', reason: final.reason, redirect: true }; }
        url = final.url;
      }
      if (response.status < 200 || response.status > 299) { release(response); return httpError(response); }
      const contentType = response.headers.get('content-type');
      const mime = contentType?.split(';')[0].trim().toLowerCase() ?? null;
      if (!mime || !HTML_TYPES.includes(mime)) { release(response); return { status: 'unsupportedContentType', contentType }; }
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > limits.maxBytes) { release(response); return { status: 'tooLarge', limit: limits.maxBytes }; }

      const read = await Promise.race([readBody(response, limits.maxBytes, controller.signal), abortedWait]);
      if (read === 'aborted' || 'abort' in read) return stopped();
      if (!read.ok) return read.result;
      if (controller.signal.aborted) return stopped();
      if (read.bytes.length === 0) return { status: 'empty' };
      const decoded = decode(read.bytes, contentType, Decoder);
      if (!decoded.ok) return { status: decoded.status, encoding: decoded.encoding };
      return { status: 'success', html: decoded.text, url, encoding: decoded.encoding };
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
