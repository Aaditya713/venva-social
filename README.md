# venva-social — automated daily Instagram posts for @venva.health

Every day at **7:30 PM IST** a GitHub Action:
1. Keeps a week of posts queued in `content/queue.json` (writes 7 more with Claude when it runs low)
2. Renders the next one with the locked Venva template (`template/post.html`): the same 3 layouts, fonts and colours as posts 1–10
3. Publishes it to Instagram via the official Instagram API, then marks it `posted`

Since a week of posts is always queued ahead, you can review or edit any upcoming post
on GitHub before it goes out (edit `content/queue.json`, or delete an entry).

## Files
| Path | What it is |
|---|---|
| `template/post.html` | The design. Three templates: `myth`, `stat`, `tip`. Fonts are bundled so they can't fall back. |
| `content/brand.md` | Voice, caption formula, text limits and weekly rotation. The AI follows this. |
| `content/queue.json` | Upcoming and published posts. |
| `src/render.mjs` | `npm run render`: renders queued posts to `out/` so you can preview them. |
| `src/generate.mjs` | `npm run generate`: asks Claude for 7 new posts (needs `ANTHROPIC_API_KEY`). |
| `src/daily.mjs` | The daily job (`prepare` → `publish`). |

## One-time setup (~20 minutes)

### 1. Instagram API access (Meta)
@venva.health is already a professional account, which is required.
1. Go to <https://developers.facebook.com/apps> → **Create app** → choose the use case
   **"Manage messaging & content on Instagram"**.
2. In the app, open **Instagram → API setup with Instagram login**.
3. Under **Generate access tokens**, click **Add account** and log in as @venva.health.
   Approve the `instagram_business_basic` and `instagram_business_content_publish` permissions.
4. Copy the **access token** (long-lived, 60 days; the weekly workflow refreshes it automatically)
   and the **Instagram account ID** shown next to the account.
   Development mode is fine, because you're posting to your own account and don't need App Review.

### 2. GitHub repo
1. Create a **public** repository named `venva-social`. It must be public so Instagram can fetch the
   images from `raw.githubusercontent.com`.
2. Push this folder to it:
   ```
   git init && git add . && git commit -m "Venva social automation"
   git branch -M main
   git remote add origin https://github.com/<your-username>/venva-social.git
   git push -u origin main
   ```
3. Repo → **Settings → Secrets and variables → Actions → New repository secret**, add:
   | Secret | Value |
   |---|---|
   | `IG_USER_ID` | Instagram account ID from step 1 |
   | `IG_ACCESS_TOKEN` | Access token from step 1 |
   | `ANTHROPIC_API_KEY` | From <https://console.anthropic.com> (≈ $0.10–0.30 per week of posts) |
   | `GH_PAT` | Fine-grained GitHub token for this repo with **Secrets: read & write** (used to save the refreshed IG token) |
4. Repo → **Actions** tab → enable workflows → **Daily Instagram post → Run workflow** to test it once.

## Safety nets
- A post whose text doesn't fit the card (more than 4 lines of body text) is marked `needs-edit` and skipped, never published cramped. Shorten it in `content/queue.json` and set it back to `queued`.
- If Claude can't write new posts (API key or outage), the day's post still goes out from the queue; the run shows a warning.
- Before publishing, the job checks your last 5 Instagram posts so a retried run never double-posts.
- Each post gets alt text describing the card, for screen readers and search.

## Everyday use
- **Preview upcoming posts:** `npm run render`, then open `out/`.
- **Change the posting time:** edit `POST_AT_UTC` in `.github/workflows/daily-post.yml` (UTC; IST = UTC + 5:30). Keep the three cron triggers 1–3 hours before it, since GitHub often starts scheduled runs late.
- **Write posts now / test your Anthropic key:** Actions tab → **Write more posts** → Run workflow. New posts land in `content/queue.json` for review.
- **Pause:** Actions tab → Daily Instagram post → ⋯ → Disable workflow.
- **Write a post yourself:** add an entry to `content/queue.json` with `"status": "queued"`. It will go out in order.
