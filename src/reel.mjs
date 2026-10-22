// Turns a queue post into a 10-second 9:16 Reel (MP4) using the locked card template.
// Instagram shows Reels to people who don't follow the account; single images mostly reach
// existing followers, so a new account gets almost no views from them.
// The Reel opens on the card with the answer hidden (myth headline, stat number, tip headline)
// under a question, then wipes the answer in with a soft chime — a "guess first" beat that keeps
// people watching. Motion and timing live in template/reel.html; this steps through it frame by frame.
// Usage: node src/reel.mjs <post-id> [--file content/samples.json]   → out/<id>.mp4 + out/<id>-cover.jpg
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cardUrl = pathToFileURL(path.join(root, 'template', 'post.html')).href;
const reelUrl = pathToFileURL(path.join(root, 'template', 'reel.html')).href;

const FPS = 30;
const T = { reveal: 2.8, wipe: 1.6, total: 10 }; // seconds: answer appears at 2.8 s, fully shown by 4.4 s

// Card parts hidden until the reveal. Layout is unchanged (visibility, not display).
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

// A quiet synthesized pad, plus a soft two-note chime when the answer appears. No licensed music.
const audio = at =>
  `0.03*(sin(2*PI*220*t)+sin(2*PI*277.18*t)+sin(2*PI*329.63*t)+0.5*sin(2*PI*110*t))*(0.75+0.25*sin(2*PI*0.25*t))` +
  `+if(gte(t,${at}),0.10*sin(2*PI*880*(t-${at}))*exp(-5*(t-${at})),0)` +
  `+if(gte(t,${at + 0.12}),0.08*sin(2*PI*1318.5*(t-${at + 0.12}))*exp(-5*(t-${at + 0.12})),0)`;

// ffmpeg reading JPEG frames from stdin; returns write(frame) and end().
function encoder(file) {
  const ff = spawn(ffmpegPath, [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    // Commas inside the expression must be escaped so the filter parser doesn't split on them.
    '-f', 'lavfi', '-t', String(T.total), '-i', `aevalsrc=${audio(T.reveal).replace(/,/g, '\\,')}:s=48000:c=stereo`,
    '-filter_complex', `[0:v]format=yuv420p[v];[1:a]afade=t=in:d=0.6,afade=t=out:st=${T.total - 1}:d=1[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '25', '-r', String(FPS), '-g', String(FPS * 2),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
    '-movflags', '+faststart', '-use_editlist', '0', '-shortest',
    file,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  ff.stderr.on('data', d => { err += d; });
  const done = new Promise((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.trim()}`))));
  });
  const write = buf => new Promise((resolve, reject) => ff.stdin.write(buf, e => (e ? reject(e) : resolve())));
  return { write, end: () => { ff.stdin.end(); return done; } };
}

export async function renderReel(post, outDir = path.join(root, 'out')) {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    // 1. The card, full and with the answer hidden; and where the answer sits on it.
    const card = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
    await card.goto(cardUrl);
    const { overflow } = await card.evaluate(p => window.renderPost(p), post);
    if (overflow) throw new Error(`${post.id}: text overflows the card`);
    const full = await card.screenshot({ type: 'png' });
    const rect = await card.evaluate(sel => {
      const els = [...document.querySelectorAll(sel)];
      const boxes = els.map(el => el.getBoundingClientRect()).filter(b => b.height);
      els.forEach(el => { el.style.visibility = 'hidden'; });
      return { top: Math.max(0, Math.min(...boxes.map(b => b.top)) - 12), bottom: Math.min(1080, Math.max(...boxes.map(b => b.bottom)) + 12) };
    }, HIDE[post.template]);
    const tease = await card.screenshot({ type: 'png' });
    await card.close();

    // 2. Step through the Reel's animation and stream each frame to ffmpeg.
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    await page.goto(reelUrl);
    const png = b => `data:image/png;base64,${b.toString('base64')}`;
    await page.evaluate(r => window.renderReel(r), {
      theme: post.template === 'tip' ? 'light' : 'dark',
      hooks: hooks(post),
      cta: 'Follow @venva.health for a health fact every day',
      tease: png(tease), full: png(full), rect, t: T,
    });
    const file = path.join(outDir, `${post.id}.mp4`);
    const enc = encoder(file);
    for (let i = 0; i < Math.round(T.total * FPS); i++) {
      await page.evaluate(s => window.seek(s), i / FPS);
      await enc.write(await page.screenshot({ type: 'jpeg', quality: 92 }));
    }
    await enc.end();
    // Cover: the finished card, answer showing.
    const cover = path.join(outDir, `${post.id}-cover.jpg`);
    await page.evaluate(s => window.seek(s), T.total - 2);
    await page.screenshot({ path: cover, type: 'jpeg', quality: 90 });
    return { file, cover };
  } finally {
    await browser.close();
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
