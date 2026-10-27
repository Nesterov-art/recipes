import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import choiceOrbit from '../illustrations/choice-orbit.ts';
import choiceOrbitLight from '../illustrations/choice-orbit-light.ts';
import chooseWhatToCook from '../illustrations/choose-what-to-cook.ts';
import chooseWhatToCookLight from '../illustrations/choose-what-to-cook-light.ts';
import stepByStepCooking from '../illustrations/step-by-step-cooking.ts';
import stepByStepCookingLight from '../illustrations/step-by-step-cooking-light.ts';

// SHA-256 of the originals: CHOICE-01 and COOK-01 from design/monorec-2.2/asset_manifest.json,
// their light variants and the Choice orbit as delivered separately per theme.
const ORIGINALS = {
  'choice_orbit.svg': { hash: 'd8d70099955715648e6f9b14218aaa624bef05f0bcf85d31afefc15d07b7e618', xml: choiceOrbit },
  'choice_orbit_light.svg': { hash: '9c961ec343fdc3f9e137283c89cfb9c72653279157c7db8cbe7da82f70080a79', xml: choiceOrbitLight },
  'choose_what_to_cook.svg': { hash: 'f902ce9e336ce930d755620f6f8869956f8ac87d70cb8ad944d007300d99b448', xml: chooseWhatToCook },
  'choose_what_to_cook_light.svg': { hash: 'dcdcee2c743478125edbcdba163d0dc44c6a4b75cb78d1c265259f2f73c9feda', xml: chooseWhatToCookLight },
  'step_by_step_cooking.svg': { hash: '7b4475c10222a934578bce755427d432b895e0857fcbd8b224e893457d4d8818', xml: stepByStepCooking },
  'step_by_step_cooking_light.svg': { hash: '7ac1452eb3fb4b78fcb52446accd2f678e58c47e18d99842ef78910b43af9143', xml: stepByStepCookingLight },
};

for (const [file, original] of Object.entries(ORIGINALS)) {
  test(`${file} is the unedited original and its module matches it`, () => {
    const bytes = readFileSync(new URL(`../../assets/illustrations/${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), original.hash);
    // The module only drops the XML declaration.
    assert.equal(original.xml, bytes.toString('utf8').replace(/^<\?xml[^>]*\?>\s*/, ''));
  });
}

test('the light variants redraw their dark originals with the same shapes', () => {
  const shapes = xml => [...xml.matchAll(/ d="([^"]+)"/g)].map(match => match[1]);
  // The light orbit draws its plate half a unit lower; everything else matches.
  assert.equal(shapes(choiceOrbitLight).length, shapes(choiceOrbit).length);
  assert.deepEqual(shapes(chooseWhatToCookLight), shapes(chooseWhatToCook));
  // The light COOK-01 was re-exported with slightly different rounding.
  assert.equal(shapes(stepByStepCookingLight).length, shapes(stepByStepCooking).length);
});
