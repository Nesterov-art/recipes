// Render the supplied SVGs without changing their paths or colours.
// Uses the existing Playwright dev dependency; requires its Chromium browser.
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  async function render(svg, size, path, transparent = false) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style>${svg}`);
    await page.screenshot({ path, omitBackground: transparent });
    console.log(`${path}: ${size} x ${size}`);
  }

  for (const theme of ['dark', 'light']) {
    const svg = await readFile(`assets/cookbook-${theme}.svg`, 'utf8');
    await render(svg, 1024, theme === 'dark' ? 'assets/icon.png' : 'assets/icon-light.png');
    await render(svg, 64, `public/favicon-cookbook-${theme}.png`);
    await render(svg, 180, `public/apple-touch-icon-cookbook-${theme}.png`);
    if (theme === 'dark') {
      await render(svg, 192, 'public/app-icon-192.png');
      await render(svg, 512, 'public/app-icon-512.png');
      await render(svg, 64, 'assets/favicon.png');
      await render(svg, 180, 'public/apple-touch-icon.png');
      const symbol = svg.replace(/<path[^>]*d="M0 0 H256 V256 H0 Z"\s*\/>/, '');
      // Keep the complete book inside Android's adaptive-icon safe circle.
      const adaptive = symbol.replace('<path', '<g transform="translate(51.2 51.2) scale(0.6)"><path').replace('</svg>', '</g></svg>');
      await render(adaptive, 1024, 'assets/android-icon-foreground.png', true);
      await render(adaptive, 1024, 'assets/android-icon-monochrome.png', true);
      await render(symbol, 1024, 'assets/splash-icon.png', true);
    }
  }
} finally {
  await browser.close();
}
