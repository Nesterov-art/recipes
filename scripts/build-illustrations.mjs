// Turns the original illustrations in assets/illustrations into string modules
// for react-native-svg's SvgXml. The SVG files themselves are byte copies of the
// Monorec originals and are never edited; run this after adding one. The module
// drops only the XML declaration, which SvgXml would otherwise read as text.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const source = 'assets/illustrations';
const target = 'src/illustrations';

for (const file of readdirSync(source).filter(name => name.endsWith('.svg'))) {
  const xml = readFileSync(join(source, file), 'utf8').replace(/^<\?xml[^>]*\?>\s*/, '');
  const name = file.replace(/\.svg$/, '').replace(/_/g, '-');
  writeFileSync(join(target, `${name}.ts`), [
    `// Generated from ${source}/${file} by scripts/build-illustrations.mjs. Do not edit.`,
    `export default ${JSON.stringify(xml)};`,
    '',
  ].join('\n'));
  console.log(`${file} -> ${target}/${name}.ts`);
}
