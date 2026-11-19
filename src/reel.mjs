// Turns a queue post into a 9:16 Reel (MP4, ~12–16 s) of full-screen kinetic text, in fast scenes:
//   1. Hook — the caption's opening line, readable from the very first frame
//   2. Answer — the truth (myth), the number (stat) or the tip
//   3. The caption's first "→" list (if 4 points or fewer), one point per screen
//   4. Website CTA — the takeaway, then "Read the full guide · venva.co.in · Link in bio"
// Instagram shows Reels to people who don't follow the account, and ranks them on whether viewers
// keep watching — so nothing is hidden behind a fade at the start, and scenes change on the beat.
// All text comes from the post's checked caption and card; nothing new is written here.
// Usage: node src/reel.mjs <post-id> ... [--file content/samples.json]   → out/<id>.mp4 + out/<id>-cover.jpg
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reelUrl = pathToFileURL(path.join(root, 'template', 'reel.html')).href;

const FPS = 30;
const BEAT = 0.5;        // 120 bpm; every scene starts on a beat
const MAX_POINTS = 4;    // a longer list stays in the caption only
const END = 3;           // CTA scene length

// Escapes text for HTML and keeps hyphenated words (push-up, 2–3) on one line.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  .replace(/\S+[-–]\S+/g, w => `<span class="nw">${w}</span>`);
const flat = s => (s ?? '').replace(/\p{Extended_Pictographic}️?/gu, '').replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
const words = s => flat(s).split(' ').length;
// Reading time: ~0.26 s a word (about 4 words a second) plus half a second to land, on the beat grid, 1.5–3.5 s.
const readTime = s => Math.min(3.5, Math.max(1.5, Math.ceil((0.5 + words(s) * 0.26) / BEAT) * BEAT));

// The caption's first line is the written hook (brand.md caption formula, step 1): its first sentence
// goes big, the rest underneath. A very long first sentence falls back to the card headline.
export function hookText(p) {
  const first = flat(p.caption.split('\n')[0]);
  const lead = first.match(/^.*?[?.!](?=\s|$)/)?.[0] ?? first;
  if (lead.length > 90) return [flat(p.headline ?? `${p.number} ${p.label}`), ''];
  const rest = first.slice(lead.length).trim();
  return [lead, rest.length <= 90 ? rest : ''];
}

export function scenesFor(p) {
  const lines = p.caption.split('\n').map(l => l.trim());
  const pill = p.template === 'stat' ? 'Know your numbers' : p.label;
  const [lead, rest] = hookText(p);
  const sub = rest ? `<div class="text soft" style="font-size:56px">${esc(rest)}</div>` : '';
  const scenes = [{ html: `<div class="pill">${esc(pill)}</div><div class="big">${esc(lead)}</div>${sub}`, dur: Math.max(2, readTime(`${lead} ${rest}`)) }];

  if (p.template === 'myth') {
    scenes.push({ html: `<div class="kicker">${esc(p.kicker || 'The truth')}</div><div class="text">${esc(flat(p.body))}</div>`, dur: readTime(p.body) + BEAT });
  } else if (p.template === 'stat') {
    scenes.push({ html: `<div class="number">${esc(p.number)}</div><div class="kicker">${esc(p.label)}</div><div class="text soft">${esc(flat(p.body))}</div>`, dur: readTime(p.body) + BEAT });
  } else {
    const body = p.body ? `<div class="text soft">${esc(flat(p.body))}</div>` : '';
    scenes.push({ html: `<div class="big" style="font-size:112px">${esc(flat(p.headline))}</div><div class="bar">${esc(p.highlight)}</div>${body}`, dur: p.body ? readTime(p.body) + BEAT : 2 });
  }

  // The caption's first "→" list, whole or not at all: a cut-short health list can mislead
  // (e.g. HbA1c ranges without the diabetes line).
  const from = lines.findIndex(l => l.startsWith('→ '));
  const points = [];
  for (let i = from; from >= 0 && lines[i]?.startsWith('→ '); i++) points.push(flat(lines[i].slice(2)));
  if (points.length && points.length <= MAX_POINTS) {
    points.forEach((pt, i) => scenes.push({ html: `<div class="count">${i + 1}/${points.length}</div><div class="text" style="font-size:72px">${esc(pt)}</div>`, dur: readTime(pt) }));
  }

  // The takeaway is the last line before "Full guide" (brand.md caption formula, step 5).
  const guideAt = lines.findIndex(l => l.startsWith('Full guide'));
  const takeaway = flat(lines.slice(0, guideAt > 0 ? guideAt : 0).filter(Boolean).at(-1));
  const close = takeaway && takeaway.length <= 110 && !takeaway.startsWith('→') ? `<div class="text soft" style="font-size:50px">${esc(takeaway)}</div>` : '';
  scenes.push({ html: `${close}<div class="kicker">Read the full guide</div><div class="site">venva.co.in</div><div class="text soft" style="font-size:46px">Link in bio</div>`, dur: END });
  return scenes;
}

// Synthesized music, so there's no licence to worry about — but not the same loop every day.
// Each post gets a key, a chord progression (one chord per 4-beat bar) and a groove, picked from
// its number so consecutive days always differ in key and groove (5 × 4 × 4 = 80 combinations).
// Everything stays on the 120 bpm grid, so scene changes still land on the beat.
const KEYS = [0, 2, -3, 5, -2];                                   // semitones from A3 (220 Hz)
const PROGRESSIONS = [
  ['I–V–vi–IV', [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]]],
  ['vi–IV–I–V', [[-3, 0, 4], [5, 9, 12], [0, 4, 7], [7, 11, 14]]],
  ['i–VI–III–VII', [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]]],
  ['I–IV–ii–V', [[0, 4, 7], [5, 9, 12], [2, 5, 9], [7, 11, 14]]],
];
const GROOVES = ['four-on-the-floor', 'half-time', 'driving', 'chill arpeggio'];
export const trackFor = id => {
  const n = parseInt(id, 10) || [...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return { key: KEYS[n % KEYS.length], prog: PROGRESSIONS[Math.floor(n / 4) % PROGRESSIONS.length], groove: n % GROOVES.length };
};

const BAR = BEAT * 4;
const hz = semi => (220 * 2 ** (semi / 12)).toFixed(3);
const kick = every => `0.32*sin(2*PI*(48+70*exp(-30*mod(t,${every})))*mod(t,${every}))*exp(-10*mod(t,${every}))`;
// Sum over the progression of "this chord's term while its bar is playing".
const perChord = (chords, term) => chords.map((c, k) => `if(eq(floor(mod(t,${BAR * 4})/${BAR}),${k}),${term(c)},0)`).join('+');
// Note on/off ramps (in seconds) so chord and note changes don't click.
const ramp = (len, a = 0.12) => `min(1,mod(t,${len})/${a})*min(1,(${len}-mod(t,${len}))/${a})`;

export function music(id) {
  const { key, prog: [, chords], groove } = trackFor(id);
  const pad = `0.018*(${perChord(chords, c => c.map(s => `sin(2*PI*${hz(s + key)}*t)`).join('+'))})*${ramp(BAR)}*(0.85+0.15*sin(2*PI*0.25*t))`;
  const bass = step => `0.11*(${perChord(chords, c => `sin(2*PI*${hz(c[0] + key - 12)}*t)`)})*exp(-5*mod(t,${step}))*${ramp(step, 0.01)}`;
  const hat = (step, off, amp) => `${amp}*(2*random(0)-1)*exp(-50*mod(t+${off},${step}))`;
  const parts = [pad];
  if (groove === 0) parts.push(kick(BEAT), hat(BEAT, BEAT / 2, 0.035), bass(BEAT * 2));
  if (groove === 1) parts.push(kick(BEAT * 2), `0.08*(2*random(1)-1)*exp(-18*mod(t+${BEAT},${BEAT * 2}))`, hat(BEAT / 2, 0, 0.02), bass(BEAT * 2));
  if (groove === 2) parts.push(kick(BEAT), hat(BEAT / 4, 0, 0.018), bass(BEAT / 2));
  if (groove === 3) {
    // Arpeggio: the chord's three notes in turn, one per eighth note, an octave up; soft kick each bar.
    const step = BEAT / 2;
    const note = c => `if(eq(mod(floor(t/${step}),3),0),${hz(c[0] + key + 12)},if(eq(mod(floor(t/${step}),3),1),${hz(c[1] + key + 12)},${hz(c[2] + key + 12)}))`;
    parts.push(`0.1*sin(2*PI*(${perChord(chords, note)})*t)*exp(-7*mod(t,${step}))*${ramp(step, 0.008)}`, `0.8*${kick(BAR)}`, bass(BEAT * 2));
  }
  return parts.join('+');
}

// ffmpeg reading JPEG frames from stdin; returns write(frame) and end().
function encoder(file, total, id) {
  const ff = spawn(ffmpegPath, [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    // Commas inside the expression must be escaped so the filter parser doesn't split on them.
    '-f', 'lavfi', '-t', String(total), '-i', `aevalsrc=${music(id).replace(/,/g, '\\,')}:s=48000:c=stereo`,
    '-filter_complex', `[0:v]format=yuv420p[v];[1:a]alimiter=limit=0.9,afade=t=out:st=${total - 1}:d=1[a]`,
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
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    await page.goto(reelUrl);
    const total = await page.evaluate(r => window.renderReel(r), { theme: post.template === 'tip' ? 'light' : 'dark', scenes: scenesFor(post) });
    const file = path.join(outDir, `${post.id}.mp4`);
    const enc = encoder(file, total, post.id);
    for (let i = 0; i < Math.round(total * FPS); i++) {
      await page.evaluate(s => window.seek(s), i / FPS);
      await enc.write(await page.screenshot({ type: 'jpeg', quality: 92 }));
    }
    await enc.end();
    // Cover (profile grid): the hook.
    const cover = path.join(outDir, `${post.id}-cover.jpg`);
    await page.evaluate(s => window.seek(s), 1);
    await page.screenshot({ path: cover, type: 'jpeg', quality: 90 });
    return { file, cover, total };
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
    const { file, total } = await renderReel(post);
    console.log(`rendered ${file} (${total} s)`);
  }
}
