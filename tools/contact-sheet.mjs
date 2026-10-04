// Renders every post in out/ into one grid image, out/_contact-sheet.jpg (run `npm run render` first).
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../out/', import.meta.url));
const imgs = readdirSync(dir).filter(f => /^\d{3}-.*\.jpg$/.test(f)).sort();
const html = `<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(4,440px);gap:4px">${
  imgs.map(f => `<img src="data:image/jpeg;base64,${readFileSync(dir + f).toString('base64')}" width=440>`).join('')}</body>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1772, height: 900 } });
await page.setContent(html);
await page.waitForTimeout(800);
await page.screenshot({ path: dir + '_contact-sheet.jpg', fullPage: true, type: 'jpeg', quality: 85 });
await browser.close();
console.log(`wrote ${dir}_contact-sheet.jpg (${imgs.length} posts)`);
