// Checks a batch of hand-written posts against content/brand.md and the card, then appends them to the queue.
// Usage: node tools/add-posts.mjs <batch.mjs> [--dry]
// A batch module default-exports compact posts: { n, slug, ...template fields, cap, tags }.
// Template and myth label come from the weekly rotation by post number; the caption footer is added here.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { renderPosts } from '../src/render.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const queuePath = path.join(root, 'content', 'queue.json');
// Same rotation as src/generate.mjs: post 011 = Sunday stat.
const ROTATION = [['tip'], ['myth', 'Myth buster'], ['stat'], ['myth', 'Reality check'], ['tip'], ['myth', 'Did you know'], ['stat']];
const PILLARS = ['Training', 'Nutrition', 'Sleep', 'Symptoms', 'Wellbeing', "Women's health", "Men's health", 'Heart health', 'Gut health', 'Mental health'];
const FOOTER = '\n\nFull guide → venva.co.in\n\nSave this 🔖 and follow @venva.health\n\n';

const words = s => s.trim().split(/\s+/).length;
const lines = s => s.split('\n');

function build(p) {
  const [template, mythLabel] = ROTATION[(p.n + 2) % 7];
  const post = { id: `${String(p.n).padStart(3, '0')}-${p.slug}`, status: 'queued', template };
  if (template === 'myth') Object.assign(post, { label: mythLabel, headline: p.headline, body: p.body });
  if (template === 'stat') Object.assign(post, { number: p.number, label: p.label, body: p.body });
  if (template === 'tip') Object.assign(post, { label: p.label, headline: p.headline, highlight: p.highlight },
    p.sections ? { sections: p.sections } : { body: p.body });
  post.caption = p.cap.trim() + FOOTER + p.tags.trim();
  return post;
}

function problems(p, post) {
  const e = [];
  const need = (...keys) => keys.forEach(k => { if (!p[k]) e.push(`missing ${k}`); });
  if (!/^[a-z0-9-]+$/.test(p.slug)) e.push('bad slug');
  need('cap', 'tags');
  if (post.template === 'myth') {
    need('headline', 'body');
    if (p.headline && (lines(p.headline).length > 2 || lines(p.headline).some(l => l.length > 22))) e.push('myth headline: max 2 lines of 22 chars');
    if (p.body && (words(p.body) < 18 || words(p.body) > 30)) e.push(`myth body ${words(p.body)} words (want 20–28)`);
  }
  if (post.template === 'stat') {
    need('number', 'label', 'body');
    if (p.number?.length > 7) e.push('stat number > 7 chars');
    if (p.label && words(p.label) > 4) e.push('stat label > 4 words');
    if (p.body && (lines(p.body).length !== 4 || lines(p.body).some(l => l.length > 38))) e.push('stat body: exactly 4 lines of ≤ 38 chars');
  }
  if (post.template === 'tip') {
    need('label', 'headline', 'highlight');
    if (p.label && !PILLARS.includes(p.label)) e.push(`tip label "${p.label}" not a pillar`);
    if (p.headline && (lines(p.headline).length > 2 || lines(p.headline).some(l => l.length > 16))) e.push('tip headline: max 2 lines of 16 chars');
    if (p.highlight?.length > 28) e.push('tip highlight > 28 chars');
    if (p.sections) {
      if (p.sections.length !== 3) e.push('tip needs exactly 3 sections');
    } else if (!p.body) e.push('tip needs body or sections');
    else if (words(p.body) < 16 || words(p.body) > 26) e.push(`tip body ${words(p.body)} words (want 18–24)`);
  }
  const tags = p.tags?.trim().split(/\s+/) ?? [];
  if (tags.length !== 5 || tags.some(t => !/^#[a-z0-9]+$/.test(t))) e.push('need exactly 5 lowercase hashtags');
  if (/venva\.co\.in|@venva\.health/.test(p.cap ?? '')) e.push('caption already has the footer');
  if (!/\n→ /.test(p.cap ?? '')) e.push('caption has no "→ " list');
  if (post.caption.length > 2200) e.push('caption over Instagram 2,200 chars');
  return e;
}

const [batchFile, ...flags] = process.argv.slice(2);
const batch = (await import(pathToFileURL(path.resolve(batchFile)).href)).default;
const queue = JSON.parse(await readFile(queuePath, 'utf8'));
const lastNum = Math.max(...queue.map(p => parseInt(p.id, 10)));
const seenSlugs = new Set(queue.map(p => p.id.slice(4)));
const seenHeads = new Set(queue.map(p => (p.headline ?? p.label).toLowerCase().replace(/\s+/g, ' ')));

const posts = [];
let bad = false;
batch.forEach((p, i) => {
  const post = build(p);
  const e = problems(p, post);
  if (p.n !== lastNum + 1 + i) e.push(`expected post number ${lastNum + 1 + i}`);
  if (seenSlugs.has(p.slug)) e.push('duplicate topic slug');
  const head = (post.headline ?? post.label).toLowerCase().replace(/\s+/g, ' ');
  if (post.template !== 'stat' && seenHeads.has(head)) e.push('duplicate headline');
  seenSlugs.add(p.slug); seenHeads.add(head);
  if (e.length) { bad = true; console.error(`✗ ${post.id}: ${e.join('; ')}`); }
  posts.push(post);
});

const rendered = await renderPosts(posts, path.join(os.tmpdir(), 'venva-batch-check'));
rendered.forEach((r, i) => { if (r.overflow) { bad = true; console.error(`✗ ${posts[i].id}: text overflows the card`); } });

if (bad) { console.error('Batch rejected — nothing added.'); process.exit(1); }
if (flags.includes('--dry')) { console.log(`✓ ${posts.length} posts OK (dry run)`); process.exit(0); }
queue.push(...posts);
await writeFile(queuePath, JSON.stringify(queue, null, 2) + '\n');
console.log(`✓ Added ${posts.length} posts: ${posts[0].id} … ${posts.at(-1).id}. Queue now ends at ${posts.at(-1).id}.`);
