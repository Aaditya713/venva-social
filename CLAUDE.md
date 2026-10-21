## Project notes

- Automated daily Instagram posting for @venva.health. A GitHub Action renders the next queued post with the locked template (`template/post.html`) and publishes it via the Instagram API at 7:30 PM IST, backed by a cron-job.org trigger at 7:00 PM IST (see README "On-time trigger").
- The queue (`content/queue.json`) is filled through post 365 (23 Sep 2027) — nothing depends on the AI generator (`src/generate.mjs`) until then. Brand voice/rules live in `content/brand.md`; the generator follows it.
- Add a batch by hand with `node tools/add-posts.mjs <batch.mjs>` — it checks brand rules and card fit before queuing.
- Preview upcoming posts with `npm run render` → `out/`, and a Reel with `npm run reel -- <post-id>`. Posts go out as 9:16 Reels (image post as fallback). Don't edit `out/` or `template/post.html` output directly.
- Safety nets already in place: overlong captions are marked `needs-edit` and skipped (never published cramped); publish checks the last 5 IG posts to avoid double-posting; a stalled AI generator doesn't block the day's post.
- Secrets (`IG_USER_ID`, `IG_ACCESS_TOKEN`, `ANTHROPIC_API_KEY`, `GH_PAT`) live only in GitHub Actions repo secrets — never in this repo or committed.
- This repo must stay **public** (Instagram fetches post images from `raw.githubusercontent.com`).
