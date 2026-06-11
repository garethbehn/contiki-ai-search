# Contiki AI Search — Proof of Concept

Semantic search demo for Contiki, powered by Claude. Free-text trip search with AI-generated match reasoning.

Password: `Go-Wander-2026`

## Deploy to Vercel

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Contiki AI search PoC"
gh repo create garethbehn/contiki-ai-search --public --source=. --push
```

### 2. Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import the `contiki-ai-search` GitHub repo
3. Leave all build settings as defaults — Vercel auto-detects the config
4. Click **Deploy**

### 3. Add your API key
1. In Vercel dashboard → your project → **Settings → Environment Variables**
2. Add: `ANTHROPIC_API_KEY` = your key
3. **Redeploy** (Deployments tab → ⋯ → Redeploy)

That's it. Your demo will be live at `https://contiki-ai-search.vercel.app`

## How it works

```
User types query
      ↓
Browser → POST /api/search (query + trip list)
      ↓
Vercel Edge Function (key stays server-side)
      ↓
Anthropic API (claude-sonnet-4-20250514)
      ↓
Ranked trips + AI reasons → back to browser
```

## Architecture

| File | Purpose |
|------|---------|
| `public/index.html` | Full Contiki-styled demo UI |
| `api/search.js` | Vercel Edge Function — Anthropic proxy |
| `vercel.json` | Routing config |

## Notes
- Trip data is a curated mock dataset. In production this would be replaced with live `api.ttc.com` calls.
- The AI key is never exposed in the browser — all Claude calls go through the `/api/search` proxy.
