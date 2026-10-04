// Renders queue posts to 1440x1440 JPEGs using the locked template.
// Usage: node src/render.mjs [--all | <post-id> ...] [--file content/samples.json]
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templateUrl = pathToFileURL(path.join(root, 'template', 'post.html')).href;

export async function renderPosts(posts, outDir = path.join(root, 'out')) {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 4 / 3 });
  await page.goto(templateUrl);
  const files = [];
  for (const post of posts) {
    const { overflow } = await page.evaluate(p => window.renderPost(p), post);
    if (overflow) console.warn(`⚠ ${post.id}: text overflows the card — shorten it`);
    const file = path.join(outDir, `${post.id}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
    files.push({ file, overflow });
    console.log(`rendered ${file}`);
  }
  await browser.close();
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  const queueFile = fileIdx >= 0 ? args.splice(fileIdx, 2)[1] : 'content/queue.json';
  const queue = JSON.parse(await readFile(path.join(root, queueFile), 'utf8'));
  const ids = args.filter(a => !a.startsWith('--'));
  const posts = args.includes('--all') || !ids.length
    ? queue.filter(p => args.includes('--all') || p.status !== 'posted')
    : queue.filter(p => ids.includes(p.id));
  const results = await renderPosts(posts);
  if (results.some(r => r.overflow)) process.exitCode = 1;
}
