import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import chooseWhatToCook from '../illustrations/choose-what-to-cook.ts';
import chooseWhatToCookLight from '../illustrations/choose-what-to-cook-light.ts';

// SHA-256 of the originals: CHOICE-01 from design/monorec-2.2/asset_manifest.json,
// its light variant as delivered separately for the light theme.
const ORIGINALS = {
  'choose_what_to_cook.svg': { hash: 'f902ce9e336ce930d755620f6f8869956f8ac87d70cb8ad944d007300d99b448', xml: chooseWhatToCook },
  'choose_what_to_cook_light.svg': { hash: 'dcdcee2c743478125edbcdba163d0dc44c6a4b75cb78d1c265259f2f73c9feda', xml: chooseWhatToCookLight },
};

for (const [file, original] of Object.entries(ORIGINALS)) {
  test(`${file} is the unedited original and its module matches it`, () => {
    const bytes = readFileSync(new URL(`../../assets/illustrations/${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), original.hash);
    // The module only drops the XML declaration.
    assert.equal(original.xml, bytes.toString('utf8').replace(/^<\?xml[^>]*\?>\s*/, ''));
  });
}

test('the light variant redraws CHOICE-01 with the same shapes', () => {
  const shapes = xml => [...xml.matchAll(/ d="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(shapes(chooseWhatToCookLight), shapes(chooseWhatToCook));
});
