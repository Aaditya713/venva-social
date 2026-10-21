// Daily job, in two steps so the image can be hosted before Instagram fetches it:
//   node src/daily.mjs prepare   → tops up the queue, renders the next post into posts/<id>.jpg,
//                                  plus its Reel (posts/<id>.mp4 + posts/<id>-cover.jpg)
//   node src/daily.mjs publish   → posts the Reel (or the image if the Reel fails) to Instagram,
//                                  marks it as posted and updates posts/feed.json
//   node src/daily.mjs feed      → rebuilds posts/feed.json only
// IMAGE_BASE_URL is where posts/ is publicly served (e.g. raw.githubusercontent.com/<user>/<repo>/main/posts).
import { readFile, writeFile, mkdir, copyFile, readdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderPosts } from './render.mjs';
import { renderReel } from './reel.mjs';
import { generate } from './generate.mjs';
import { publishImage, publishReel, refreshToken, findRecentPost } from './publish.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const queuePath = path.join(root, 'content', 'queue.json');
const exists = p => stat(p).then(() => true, () => false);
const loadQueue = async () => JSON.parse(await readFile(queuePath, 'utf8'));
const saveQueue = q => writeFile(queuePath, JSON.stringify(q, null, 2) + '\n');
const FEED_SIZE = 24; // posts listed on venva.co.in/ig, the link-in-bio page
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
    const posts = path.join(root, 'posts');
    await mkdir(posts, { recursive: true });
    await copyFile(file, path.join(posts, `${next.id}.jpg`));
    // Instagram keeps its own copy once a Reel is published, so earlier videos needn't stay hosted.
    for (const f of await readdir(posts)) if (/(\.mp4|-cover\.jpg)$/.test(f)) await rm(path.join(posts, f));
    // The Reel is the main format; if it can't be made, the image alone still goes out.
    try {
      const reel = await renderReel(next);
      await copyFile(reel.file, path.join(posts, `${next.id}.mp4`));
      await copyFile(reel.cover, path.join(posts, `${next.id}-cover.jpg`));
    } catch (err) {
      console.warn(`::warning::Could not render the Reel for ${next.id} (${err.message}). Posting the image instead.`);
    }
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

// posts/feed.json is the small list venva.co.in/ig reads: the latest posts, each with its guide link.
async function writeFeed(queue) {
  const posts = queue
    .filter(p => p.status === 'posted')
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
    .slice(0, FEED_SIZE)
    .map(p => ({ id: p.id, title: (p.headline ?? `${p.number} ${p.label}`).replace(/\s*\n\s*/g, ' '), link: p.link, postedAt: p.postedAt }));
  await writeFile(path.join(root, 'posts', 'feed.json'), JSON.stringify({ posts }, null, 2) + '\n');
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
  // ?v= busts GitHub's ~5 min raw-file cache, in case a file with this name was hosted before.
  const v = `?v=${Date.now()}`;
  let mediaId = existing, format = existing ? undefined : 'image';
  if (!mediaId && await exists(path.join(root, 'posts', `${next.id}.mp4`))) {
    try {
      mediaId = await publishReel(`${base}/${next.id}.mp4${v}`, `${base}/${next.id}-cover.jpg${v}`, next.caption);
      format = 'reel';
    } catch (err) {
      console.warn(`::warning::Reel failed (${err.message}). Posting the image instead.`);
    }
  }
  mediaId ??= await publishImage(`${base}/${next.id}.jpg${v}`, next.caption, altText(next));
  Object.assign(next, { status: 'posted', postedAt: new Date().toISOString(), mediaId, ...(format && { format }) });
  await saveQueue(queue);
  await writeFeed(queue);
  console.log(`Published ${next.id} as ${format ?? 'an existing post'} → media ${mediaId}`);
}

const step = process.argv[2];
if (step === 'prepare') await prepare();
else if (step === 'publish') await publish();
else if (step === 'feed') await writeFeed(await loadQueue());
else if (step === 'refresh-token') process.stdout.write((await refreshToken()).access_token);
else { console.error('Usage: node src/daily.mjs prepare|publish|feed|refresh-token'); process.exit(1); }
