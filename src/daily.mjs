// Daily job, in two steps so the image can be hosted before Instagram fetches it:
//   node src/daily.mjs prepare   → tops up the queue, renders the next post into posts/<id>.jpg
//   node src/daily.mjs publish   → posts it to Instagram and marks it as posted
// IMAGE_BASE_URL is where posts/ is publicly served (e.g. raw.githubusercontent.com/<user>/<repo>/main/posts).
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderPosts } from './render.mjs';
import { generate } from './generate.mjs';
import { publishImage, refreshToken } from './publish.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const queuePath = path.join(root, 'content', 'queue.json');
const loadQueue = async () => JSON.parse(await readFile(queuePath, 'utf8'));
const saveQueue = q => writeFile(queuePath, JSON.stringify(q, null, 2) + '\n');
const MIN_AHEAD = 7; // keep a week of posts queued, so there's always time to review/edit upcoming ones

async function prepare() {
  let queue = await loadQueue();
  const ahead = queue.filter(p => p.status === 'queued').length;
  if (ahead <= MIN_AHEAD && process.env.ANTHROPIC_API_KEY) {
    await generate(7);
    queue = await loadQueue();
  }
  const next = queue.find(p => p.status === 'queued');
  if (!next) throw new Error('Queue is empty — add posts to content/queue.json or set ANTHROPIC_API_KEY');

  const [file] = await renderPosts([next]);
  await mkdir(path.join(root, 'posts'), { recursive: true });
  await copyFile(file, path.join(root, 'posts', `${next.id}.jpg`));
  console.log(`Prepared ${next.id}`);
}

async function publish() {
  const queue = await loadQueue();
  const next = queue.find(p => p.status === 'queued');
  if (!next) throw new Error('Nothing queued');
  const base = process.env.IMAGE_BASE_URL?.replace(/\/$/, '');
  if (!base) throw new Error('IMAGE_BASE_URL must be set');

  const mediaId = await publishImage(`${base}/${next.id}.jpg`, next.caption);
  Object.assign(next, { status: 'posted', postedAt: new Date().toISOString(), mediaId });
  await saveQueue(queue);
  console.log(`Published ${next.id} → media ${mediaId}`);
}

const step = process.argv[2];
if (step === 'prepare') await prepare();
else if (step === 'publish') await publish();
else if (step === 'refresh-token') process.stdout.write((await refreshToken()).access_token);
else { console.error('Usage: node src/daily.mjs prepare|publish|refresh-token'); process.exit(1); }
