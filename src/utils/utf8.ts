export function utf8Length(text: string) {
  let size = 0;
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    size += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return size;
}
