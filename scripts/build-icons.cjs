// Regenerates the PNG app icons from public/icon-full.svg. Run: node scripts/build-icons.cjs public
// Uses the Playwright/Chromium preinstalled in the dev container (not a project dependency).
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const pub = process.argv[2];
  const svg = fs.readFileSync(pub + '/icon-full.svg', 'utf8');
  const b = await chromium.launch();
  const out = [['icon-192.png', 192], ['icon-512.png', 512], ['icon-512-maskable.png', 512], ['apple-touch-icon.png', 180]];
  for (const [name, size] of out) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<style>*{margin:0}html,body{background:#0b0b0c}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
    await p.waitForTimeout(100);
    await p.screenshot({ path: `${pub}/${name}` });
    await p.close();
  }
  await b.close();
})();
