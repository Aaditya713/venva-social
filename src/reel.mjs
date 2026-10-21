// Turns a queue post into a 9:16 Reel (MP4) using the locked card template.
// Instagram shows Reels to people who don't follow the account; single images mostly reach
// existing followers, so a new account gets almost no views from them.
// The Reel opens on the card with the answer hidden (myth headline, stat number, tip headline),
// then reveals it — a short "guess first" beat that keeps people watching.
// Usage: node src/reel.mjs <post-id> [--file content/samples.json]   → out/<id>.mp4 + out/<id>-cover.jpg
import { chromium } from 'playwright';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cardUrl = pathToFileURL(path.join(root, 'template', 'post.html')).href;
const frameUrl = pathToFileURL(path.join(root, 'template', 'reel.html')).href;

const TEASE = 2.5;   // seconds with the answer hidden
const REVEAL = 6.5;  // seconds with the full card
const FADE = 0.4;

// Card parts hidden in the opening beat. Layout is unchanged (visibility, not display).
const HIDE = { myth: '.rule, .kicker, .body', stat: '.body', tip: '.bar, .body, .sections' };

// What the text above the card says before and after the reveal.
export function hooks(p) {
  if (p.template === 'myth') {
    const q = { 'Myth buster': 'Myth or fact?', 'Reality check': 'True or false?', 'Did you know': 'Did you know?' }[p.label] ?? 'Myth or fact?';
    return [q, p.label === 'Did you know' ? 'Here’s the science' : 'Here’s the truth'];
  }
  if (p.template === 'stat') return ['Do you know this number?', 'Here’s what it means'];
  return [`${p.label} tip`, 'Save this for later'];
}

export async function renderReel(post, outDir = path.join(root, 'out')) {
  await mkdir(outDir, { recursive: true });
  const tmp = path.join(outDir, `.reel-${post.id}`);
  await mkdir(tmp, { recursive: true });
  const browser = await chromium.launch();
  try {
    // 1. The card, full and with the answer hidden, as PNG data URLs.
    const card = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
    await card.goto(cardUrl);
    const { overflow } = await card.evaluate(p => window.renderPost(p), post);
    if (overflow) throw new Error(`${post.id}: text overflows the card`);
    const full = await card.screenshot({ type: 'png' });
    await card.evaluate(sel => document.querySelectorAll(sel).forEach(el => { el.style.visibility = 'hidden'; }), HIDE[post.template]);
    const tease = await card.screenshot({ type: 'png' });

    // 2. Each card state inside the 9:16 frame.
    const frame = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    await frame.goto(frameUrl);
    const theme = post.template === 'tip' ? 'light' : 'dark';
    const [before, after] = hooks(post);
    const cta = 'Follow @venva.health for a health fact every day';
    const shots = [];
    for (const [name, img, hook] of [['a', tease, before], ['b', full, after]]) {
      await frame.evaluate(f => window.renderFrame(f), { theme, hook, cta, card: `data:image/png;base64,${img.toString('base64')}` });
      const file = path.join(tmp, `${name}.png`);
      await frame.screenshot({ path: file, type: 'png' });
      shots.push(file);
    }
    const cover = path.join(outDir, `${post.id}-cover.jpg`);
    await frame.screenshot({ path: cover, type: 'jpeg', quality: 90 }); // the revealed frame

    // 3. Cross-fade the two frames over a quiet synthesized pad (no licensed music needed).
    const total = TEASE + REVEAL;
    const file = path.join(outDir, `${post.id}.mp4`);
    const pad = '0.035*(sin(2*PI*220*t)+sin(2*PI*277.18*t)+sin(2*PI*329.63*t)+0.5*sin(2*PI*110*t))*(0.75+0.25*sin(2*PI*0.25*t))';
    await run(ffmpegPath, [
      '-y', '-loglevel', 'error',
      '-loop', '1', '-framerate', '30', '-t', String(TEASE + FADE), '-i', shots[0],
      '-loop', '1', '-framerate', '30', '-t', String(REVEAL), '-i', shots[1],
      '-f', 'lavfi', '-t', String(total), '-i', `aevalsrc=${pad}:s=48000:c=stereo`,
      '-filter_complex',
      `[0:v][1:v]xfade=transition=fade:duration=${FADE}:offset=${TEASE},format=yuv420p,fade=t=in:d=0.3[v];` +
      `[2:a]afade=t=in:d=0.8,afade=t=out:st=${total - 1}:d=1[a]`,
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-tune', 'stillimage', '-crf', '23', '-r', '30', '-g', '150',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
      '-movflags', '+faststart', '-use_editlist', '0',
      file,
    ]);
    return { file, cover };
  } finally {
    await browser.close();
    await rm(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  const queueFile = fileIdx >= 0 ? args.splice(fileIdx, 2)[1] : 'content/queue.json';
  const queue = JSON.parse(await readFile(path.join(root, queueFile), 'utf8'));
  for (const id of args) {
    const post = queue.find(p => p.id === id);
    if (!post) throw new Error(`No post ${id} in ${queueFile}`);
    const { file } = await renderReel(post);
    console.log(`rendered ${file}`);
  }
}
