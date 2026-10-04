// Uses Claude to write the next batch of posts in the Venva style and appends them to the queue.
// Usage: node src/generate.mjs [count=7]
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const queuePath = path.join(root, 'content', 'queue.json');

// Flat schema: fields not used by a template are null.
const Post = z.object({
  slug: z.string().describe('short kebab-case topic slug, e.g. "vitamin-d"'),
  template: z.enum(['myth', 'stat', 'tip']),
  label: z.string(),
  headline: z.string().nullable().describe('myth/tip only; use \\n for the line break'),
  body: z.string().nullable().describe('myth/stat, or tip without sections; stat uses \\n between its 4 lines'),
  number: z.string().nullable().describe('stat only'),
  highlight: z.string().nullable().describe('tip only'),
  sections: z.array(z.object({ title: z.string(), text: z.string() })).nullable().describe('tip only, exactly 3, or null'),
  caption: z.string(),
});
const Batch = z.object({ posts: z.array(Post) });

// Mon tip · Tue myth · Wed stat · Thu myth · Fri tip · Sat myth · Sun stat
const ROTATION = [
  { template: 'tip' }, { template: 'myth', label: 'Myth buster' }, { template: 'stat' },
  { template: 'myth', label: 'Reality check' }, { template: 'tip' }, { template: 'myth', label: 'Did you know' }, { template: 'stat' },
];

export async function generate(count = 7) {
  const queue = JSON.parse(await readFile(queuePath, 'utf8'));
  const brand = await readFile(path.join(root, 'content', 'brand.md'), 'utf8');
  const lastNum = Math.max(10, ...queue.map(p => parseInt(p.id, 10) || 0));

  const plan = Array.from({ length: count }, (_, i) => {
    const r = ROTATION[(lastNum + i + 3) % 7]; // aligned so post 011 = Sunday stat
    return `${i + 1}. template "${r.template}"${r.label ? `, label "${r.label}"` : ''}`;
  }).join('\n');
  const covered = queue.map(p => `- ${p.headline?.replace(/\n/g, ' ') ?? `${p.number} ${p.label}`}`).join('\n');

  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    output_config: { effort: 'high', format: betaZodOutputFormat(Batch) },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: `You write Instagram posts for Venva. Follow this style guide exactly.\n\n${brand}`,
    messages: [{
      role: 'user',
      content: `Write ${count} new posts in this order:\n${plan}\n\n` +
        `Topics already posted or queued (do not repeat or closely overlap):\n` +
        `- Meet Venva intro\n- How much protein (1.6 g/kg)\n- Crunches burn belly fat?\n- 7-9 hours of sleep\n` +
        `- One gym hour = undone (sitting)\n- Stress makes you fat (cortisol)\n- Cardio is best for fat loss?\n` +
        `- Slim = healthy? (thin-fat)\n- 2.2L water per day\n- Protein at breakfast\n${covered}\n\n` +
        `Vary pillars across the batch (training, nutrition, sleep, symptoms, wellbeing, men's & women's health). ` +
        `Only use figures you are confident are accurate and widely accepted.`,
    }],
  });

  if (response.stop_reason === 'refusal') throw new Error(`Generation refused: ${response.stop_details?.explanation}`);
  const posts = response.parsed_output?.posts;
  if (!posts?.length) throw new Error(`No posts parsed (stop_reason: ${response.stop_reason})`);

  const added = posts.map((p, i) => {
    const id = `${String(lastNum + i + 1).padStart(3, '0')}-${p.slug}`;
    const post = { id, status: 'queued' };
    for (const [k, v] of Object.entries(p)) if (v !== null && k !== 'slug') post[k] = v;
    return post;
  });
  queue.push(...added);
  await writeFile(queuePath, JSON.stringify(queue, null, 2) + '\n');
  console.log(`Added ${added.length} posts: ${added.map(p => p.id).join(', ')}`);
  return added;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await generate(Number(process.argv[2]) || 7);
}
