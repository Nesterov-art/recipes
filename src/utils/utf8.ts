// UTF-8 size of a JS string, as TextEncoder writes it: a lone surrogate becomes U+FFFD
// (3 bytes). An indexed loop: iterating characters with for...of is far slower in Hermes.
export function utf8Length(text: string) {
  let size = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) size += 1;
    else if (c < 0x800) size += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { size += 4; i++; }
    else size += 3;
  }
  return size;
}
// Whether the UTF-8 size is within limit, without counting a text that is clearly larger or
// smaller: each UTF-16 unit takes 1 to 3 bytes (a surrogate pair, two units, takes 4).
export function utf8FitsIn(text: string, limit: number) {
  if (text.length > limit) return false;
  if (text.length * 3 <= limit) return true;
  return utf8Length(text) <= limit;
}
