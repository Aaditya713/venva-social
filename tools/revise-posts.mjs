// Rewrites fields of queued (not yet posted) posts, re-checks them against content/brand.md and the card,
// then saves the queue. Usage: node tools/revise-posts.mjs <batch.mjs> [--dry]
// A batch module default-exports [{ id, ...fields to replace, cap?, tags? }]. `cap` and `tags` rebuild the
// caption with the standard footer; any other field (headline, body, number, label, highlight, sections) replaces it.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { renderPosts } from '../src/render.mjs';
import { CTA } from '../src/links.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const queuePath = path.join(root, 'content', 'queue.json');
const FOOTER = `\n\n${CTA}\n\nSave this 🔖 and follow @venva.health\n\n`;
const PILLARS = ['Training', 'Nutrition', 'Sleep', 'Symptoms', 'Wellbeing', "Women's health", "Men's health", 'Heart health', 'Gut health', 'Mental health'];
// Posts are for a global audience: no country-specific foods, places, sources or currency.
export const LOCAL = /\b(india|indian|indians|desi|roti|rotis|chapati|chapatis|dal|daal|paneer|ghee|idli|dosa|poha|upma|sabzi|sabji|rajma|chole|chana|curd|lassi|chai|biryani|paratha|parathas|khichdi|sambar|thali|rupee|rupees|lakh|crore|icmr|monsoon|diwali|holi|cricket|bollywood|ist|bengaluru|mumbai|delhi|hindi|ragi|jowar|bajra|makhana|atta|besan|masala|namkeen|samosa|pakora|jalebi|mithai|ayurveda|haldi|chawal|chilla|bhurji|urad|moong|sattu|dahi|jaggery|gur|kadhi|aloo|bhindi|palak|methi|amla|tulsi|neem)\b|₹/i;

const words = s => s.trim().split(/\s+/).length;
const lines = s => s.split('\n');

function problems(post) {
  const e = [];
  const need = (...keys) => keys.forEach(k => { if (!post[k]) e.push(`missing ${k}`); });
  if (post.template === 'myth') {
    need('headline', 'body');
    if (post.headline && (lines(post.headline).length > 2 || lines(post.headline).some(l => l.length > 22))) e.push('myth headline: max 2 lines of 22 chars');
    if (post.body && (words(post.body) < 18 || words(post.body) > 30)) e.push(`myth body ${words(post.body)} words (want 20–28)`);
  }
  if (post.template === 'stat') {
    need('number', 'label', 'body');
    if (post.number?.length > 7) e.push('stat number > 7 chars');
    if (post.label && words(post.label) > 4) e.push('stat label > 4 words');
    if (post.body && (lines(post.body).length !== 4 || lines(post.body).some(l => l.length > 38))) e.push('stat body: exactly 4 lines of ≤ 38 chars');
  }
  if (post.template === 'tip') {
    need('label', 'headline', 'highlight');
    if (post.label && !PILLARS.includes(post.label)) e.push(`tip label "${post.label}" not a pillar`);
    if (post.headline && (lines(post.headline).length > 2 || lines(post.headline).some(l => l.length > 16))) e.push('tip headline: max 2 lines of 16 chars');
    if (post.highlight?.length > 28) e.push('tip highlight > 28 chars');
    if (post.sections) { if (post.sections.length !== 3) e.push('tip needs exactly 3 sections'); }
    else if (!post.body) e.push('tip needs body or sections');
    else if (words(post.body) < 16 || words(post.body) > 26) e.push(`tip body ${words(post.body)} words (want 18–24)`);
  }
  const tags = post.caption.match(/\n\n(#[^\n]*)$/)?.[1].split(/\s+/) ?? [];
  if (tags.length !== 5 || tags.some(t => !/^#[a-z0-9]+$/.test(t))) e.push('need exactly 5 lowercase hashtags');
  if (!/\n→ /.test(post.caption)) e.push('caption has no "→ " list');
  if (post.caption.length > 2200) e.push('caption over Instagram 2,200 chars');
  const text = ['label', 'headline', 'number', 'highlight', 'body', 'caption'].map(k => post[k] ?? '').concat((post.sections ?? []).flatMap(s => [s.title, s.text])).join(' ');
  const hit = text.match(LOCAL) ?? text.match(/\bNIN\b/);
  if (hit) e.push(`still country-specific: "${hit[0]}"`);
  return e;
}

const [batchFile, ...flags] = process.argv.slice(2);
const batch = (await import(pathToFileURL(path.resolve(batchFile)).href)).default;
const queue = JSON.parse(await readFile(queuePath, 'utf8'));

const changed = [];
let bad = false;
for (const { id, cap, tags, ...fields } of batch) {
  const post = queue.find(p => p.id === id);
  if (!post) { bad = true; console.error(`✗ ${id}: not in queue`); continue; }
  if (post.status === 'posted') { bad = true; console.error(`✗ ${id}: already posted`); continue; }
  Object.assign(post, fields);
  if (post.sections && fields.body) delete post.sections;
  if (post.body && fields.sections) delete post.body;
  if (cap !== undefined || tags !== undefined) {
    const oldTags = post.caption.match(/\n\n(#[^\n]*)$/)?.[1] ?? '';
    const oldCap = post.caption.replace(/\n\nFull guide 👉[\s\S]*$/, '');
    post.caption = (cap ?? oldCap).trim() + FOOTER + (tags ?? oldTags).trim();
  }
  const e = problems(post);
  if (e.length) { bad = true; console.error(`✗ ${id}: ${e.join('; ')}`); }
  changed.push(post);
}

const rendered = await renderPosts(changed, path.join(os.tmpdir(), 'venva-revise-check'));
rendered.forEach((r, i) => { if (r.overflow) { bad = true; console.error(`✗ ${changed[i].id}: text overflows the card`); } });

if (bad) { console.error('Batch rejected — nothing saved.'); process.exit(1); }
if (flags.includes('--dry')) { console.log(`✓ ${changed.length} posts OK (dry run)`); process.exit(0); }
await writeFile(queuePath, JSON.stringify(queue, null, 2) + '\n');
console.log(`✓ Revised ${changed.length} posts.`);
