# AI Reply Guy

A personal Twitter/X engagement dashboard with AI-assisted reply drafting. Monitor tweets from people you follow, get AI-powered context and reply suggestions, chat with an LLM to refine your replies, and post them seamlessly — all from one interface.

Built live on YouTube with Claude Code.

## Features

- **Curated Feed** — Pulls tweets from your X list, shows only original posts (no retweets/quote tweets)
- **AI Context & Drafts** — Click any tweet to get an AI explanation + auto-generated reply draft
- **Chat to Refine** — Talk to the AI to refine your reply ("make it shorter", "more casual", etc.)
- **Approve → Reply Flow** — Two-step process prevents accidental sends
- **Chrome Extension** — Posts replies via your browser session using real keystrokes (bypasses X API reply restrictions)
- **Vision** — AI sees images in tweets and references them in replies
- **Video Transcription** — Transcribes video tweets for context
- **Memory & Style Guide** — AI learns your writing style from feedback
- **Undo/Redo** — Draft history with undo/redo
- **Resizable Columns** — Drag to resize the feed and reply panels

## Architecture

```
Next.js (Cloudflare Workers) → Claude Server (your server) → Claude CLI
                              → Gemini Vision (image understanding)
                              → WhisperFlow (video transcription)
Chrome Extension              → chrome.debugger API (real keystrokes on x.com)
```

## Stack

- **Frontend**: Next.js 16 (App Router) + Tailwind CSS + shadcn/ui
- **Database**: Cloudflare D1 (SQLite)
- **Hosting**: Cloudflare Workers via OpenNext
- **AI**: Claude (via your own server proxy) + Gemini Flash (vision)
- **Reply Posting**: Chrome Extension with chrome.debugger API
- **X API**: OAuth 1.0a for reading tweets from your list

## ⚠️ Security — read before deploying

This is a **single-user app that holds the keys to your X account**. Read this section before pushing it anywhere on the public internet.

- Every API route is gated by HTTP Basic Auth via `src/middleware.ts`. **You must set `WEBAPP_SECRET`** (min 16 chars, generate with `openssl rand -base64 32`) before deploying or the worker returns 500. Without it, anyone who learns your `*.workers.dev` URL can post tweets from your account, burn your X API quota, and burn your Claude/Anthropic spend.
- The Chrome extension is allowed to be driven by URLs listed in `chrome-extension/manifest.json` → `externally_connectable.matches`. **Replace `REPLACE-ME.workers.dev` with your real Workers subdomain** before installing the extension. Remove the `localhost:3000` entry for production.
- Tweet text is attacker-controlled and gets fed into LLM prompts. The "Approve" step before posting is your only line of defense against prompt-injected drafts. Read every draft before approving.
- Persona / style-guide auto-learning is **disabled by default** in this branch because the LLM extraction step is prompt-injectable. Edit Memory and Style Guide manually in the UI.
- Your Claude proxy server (the one at `CLAUDE_SERVER_URL`) sees image/video URLs forwarded from the X API. Lock its `/api/vision` and `/api/transcribe-video` to only fetch `*.twimg.com` URLs to prevent SSRF if anything bypasses the worker-side filter.
- Rotate `WEBAPP_SECRET`, `CLAUDE_SERVER_API_TOKEN`, and your X access tokens if you ever suspect one was exposed (e.g. shown on stream / in a screen recording).

## Setup

### 1. X Developer App

1. Go to [developer.x.com](https://developer.x.com) and create a project + app
2. Choose Pay-Per-Use tier (~$5-20/month)
3. Set up User Authentication Settings (Web App, Read and Write)
4. Get your Consumer Key, Consumer Secret, Access Token, and Access Token Secret
5. Create an X List with the accounts you want to follow
6. Copy the List ID from the URL (e.g. `https://x.com/i/lists/YOUR_LIST_ID`)

### 2. Claude Server

You need a server that proxies Claude API calls. The app expects these endpoints:
- `POST /api/claude` — text generation (prompt in, text out)
- `POST /api/vision` — image description via Gemini (image_urls in, description out)
- `POST /api/transcribe-video` — video transcription (video_url in, transcript out)

All endpoints authenticate via `X-API-Key` header.

### 3. Environment Variables

```bash
cp .env.example .env.local
# Fill in your values
```

### 4. Cloudflare Setup

```bash
npm install

# Create D1 database
npx wrangler d1 create ai-reply-guy-db
# Update wrangler.json with your database ID

# Run migration
npx wrangler d1 execute ai-reply-guy-db --remote --file=migrations/0001_init.sql

# Set secrets
npx wrangler secret put X_CONSUMER_KEY
npx wrangler secret put X_CONSUMER_SECRET
npx wrangler secret put X_ACCESS_TOKEN
npx wrangler secret put X_ACCESS_TOKEN_SECRET
npx wrangler secret put X_BEARER_TOKEN
npx wrangler secret put CLAUDE_SERVER_API_TOKEN

# REQUIRED: auth gate for the deployed worker. Generate a strong secret first:
#   openssl rand -base64 32
# Then paste it when prompted. The worker returns 500 if this is unset.
npx wrangler secret put WEBAPP_SECRET

# Build and deploy
npx opennextjs-cloudflare build
npx wrangler deploy
```

When you visit your deployed URL, your browser will prompt for credentials. Use any username and your `WEBAPP_SECRET` as the password. Browsers cache it for the session.

### 5. Chrome Extension

1. Go to `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" → select the `chrome-extension/` folder
4. Copy the Extension ID
5. Set `NEXT_PUBLIC_EXTENSION_ID=<your-extension-id>` in `.env.local` (and via `wrangler secret put NEXT_PUBLIC_EXTENSION_ID` for the deployed worker)
6. **Edit `chrome-extension/manifest.json`** and replace `REPLACE-ME.workers.dev` with your real Workers subdomain in `externally_connectable.matches`. Remove the `localhost:3000` entry unless you actively run the dev server.
7. Reload the extension from `chrome://extensions`
8. Rebuild and redeploy the worker

## How It Works

1. The app polls your X List every 2 minutes for new tweets
2. Click a tweet → AI explains it and drafts a reply
3. Chat with the AI to refine the draft
4. Click Approve → Reply button enables
5. Click Reply → Chrome extension opens a background tab on x.com, types the reply with real keystrokes, clicks submit
6. After sending, AI analyzes your feedback and updates your Memory + Style Guide

## Why Chrome Extension Instead of API?

X blocked programmatic API replies in February 2026 (anti-LLM spam policy). The `POST /2/tweets` endpoint now returns 403 for replies unless the original author @mentioned you. This only affects the API — manual replies on x.com still work fine. The Chrome extension uses the `chrome.debugger` API to send real CDP keystrokes, which is indistinguishable from typing.

## Cost

| Component | Monthly Cost |
|-----------|-------------|
| X API (pay-per-use reads) | ~$5-20 |
| Cloudflare (free tier) | $0 |
| Claude (via your server) | depends on setup |
| Gemini Vision (free tier) | $0 |

## License

MIT
