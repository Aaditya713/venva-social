// Daily job, in two steps so the image can be hosted before Instagram fetches it:
//   node src/daily.mjs prepare   → tops up the queue, renders the next post into posts/<id>.jpg
//   node src/daily.mjs publish   → posts it to Instagram and marks it as posted
// IMAGE_BASE_URL is where posts/ is publicly served (e.g. raw.githubusercontent.com/<user>/<repo>/main/posts).
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderPosts } from './render.mjs';
import { generate } from './generate.mjs';
import { publishImage, refreshToken, findRecentPost } from './publish.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const queuePath = path.join(root, 'content', 'queue.json');
const loadQueue = async () => JSON.parse(await readFile(queuePath, 'utf8'));
const saveQueue = q => writeFile(queuePath, JSON.stringify(q, null, 2) + '\n');
const MIN_AHEAD = 7; // keep a week of posts queued, so there's always time to review/edit upcoming ones

async function prepare() {
  let queue = await loadQueue();
  const ahead = queue.filter(p => p.status === 'queued').length;
  if (ahead <= MIN_AHEAD && process.env.ANTHROPIC_API_KEY) {
    // A failure to write new posts must never block today's post while the queue still has some.
    try {
      await generate(7);
      queue = await loadQueue();
    } catch (err) {
      console.warn(`::warning::Could not write new posts (${err.message}). Posting from the existing queue.`);
    }
  }
  // Skip any post whose text doesn't fit the card, rather than publishing a cramped image.
  for (const next of queue.filter(p => p.status === 'queued')) {
    const [{ file, overflow }] = await renderPosts([next]);
    if (overflow) {
      next.status = 'needs-edit';
      console.warn(`::warning::${next.id} is too long for the card — marked needs-edit, skipping`);
      continue;
    }
    await mkdir(path.join(root, 'posts'), { recursive: true });
    await copyFile(file, path.join(root, 'posts', `${next.id}.jpg`));
    await saveQueue(queue);
    console.log(`Prepared ${next.id}`);
    return;
  }
  await saveQueue(queue);
  throw new Error('No publishable post in the queue — add posts to content/queue.json or set ANTHROPIC_API_KEY');
}

// Describes the card's text for screen readers, e.g. "Venva health tip. Myth buster: Fruit juice is healthy? The truth: ..."
function altText(p) {
  const flat = s => (s ?? '').replace(/\s*\n\s*/g, ' ').trim();
  const text = p.template === 'stat'
    ? `${p.number} ${p.label}. ${flat(p.body)}`
    : p.template === 'myth'
      ? `${p.label}: ${flat(p.headline)} The truth: ${flat(p.body)}`
      : `${p.label}: ${flat(p.headline)}. ${p.highlight}. ${p.sections ? p.sections.map(s => `${s.title}: ${flat(s.text)}`).join('. ') : flat(p.body)}`;
  return `Venva health card. ${text}`.slice(0, 1000);
}

async function publish() {
  const queue = await loadQueue();
  const next = queue.find(p => p.status === 'queued');
  if (!next) throw new Error('Nothing queued');
  const base = process.env.IMAGE_BASE_URL?.replace(/\/$/, '');
  if (!base) throw new Error('IMAGE_BASE_URL must be set');
  if (!process.env.IG_USER_ID || !process.env.IG_ACCESS_TOKEN) throw new Error('IG_USER_ID and IG_ACCESS_TOKEN must be set');

  // If an earlier run published but failed to record it, don't post the same thing twice.
  const existing = await findRecentPost(next.caption);
  if (existing) console.warn(`::warning::${next.id} is already on Instagram — recording it without reposting`);
  // ?v= busts GitHub's ~5 min raw-file cache, in case an image with this name was hosted before.
  const mediaId = existing ?? await publishImage(`${base}/${next.id}.jpg?v=${Date.now()}`, next.caption, altText(next));
  Object.assign(next, { status: 'posted', postedAt: new Date().toISOString(), mediaId });
  await saveQueue(queue);
  console.log(`Published ${next.id} → media ${mediaId}`);
}

const step = process.argv[2];
if (step === 'prepare') await prepare();
else if (step === 'publish') await publish();
else if (step === 'refresh-token') process.stdout.write((await refreshToken()).access_token);
else { console.error('Usage: node src/daily.mjs prepare|publish|refresh-token'); process.exit(1); }
