# E=MC² — exponentialmarketcap.fun

Landing page for **$EMC2** — "liquidity is the mass, attention is the multiplier."
1:1 clone of [exponentialmarketcap.fun](https://exponentialmarketcap.fun/), same stack, same layout, same behavior.

## Stack

- **Vite 5** + **React 18** (JSX, automatic runtime) — single-page app, no router
- **Vanilla CSS** (`src/index.css`) — hand-drawn chalkboard theme, CSS variables, no framework
- **Google Fonts** — Kalam, Patrick Hand, Space Mono, Inter
- **Vercel** — static build + two serverless functions in `api/`

## Layout

```
index.html        SEO/OG meta, fonts, Vite entry
src/
  main.jsx        React root (StrictMode)
  App.jsx         all sections: Tape, Nav, Hero, Equation, Reactor,
                  HowItWorks, Why, BuyCta, Footer + hooks and config
  index.css       full stylesheet
api/
  market.js       POST — token price/mcap/liquidity/24h via DexScreener proxy
  stats.js        GET  — compound-bot totals (Upstash Redis, optional)
public/
  logo.png        chalkboard logo (also OG image)
  favicon.png
```

## Live data

The page polls two endpoints and degrades gracefully when they have nothing yet
("soon" / launch-clock fallbacks):

- `POST /api/market` `{ mints: [mint] }` → `{ updatedAt, tokens: { [mint]: { mcap, price, vol, chg, liq } } }`, every 20s
- `GET /api/stats` → `{ compounds, solCompounded, updatedAt }`, every 30s

`api/stats.js` reads the compound bot's totals from Upstash Redis when
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (and optionally
`STATS_KEY`, default `emc2:stats`) are set; otherwise it serves nulls.

## Develop

```sh
npm install
npm run dev        # UI only — /api/* 404s locally, the page falls back cleanly
vercel dev         # UI + serverless functions
```

## Deploy on Vercel

1. Push this repo to GitHub (done) → [vercel.com/new](https://vercel.com/new) →
   **Import** the repo. Vercel auto-detects the Vite preset and the `api/`
   functions — no config needed. Deploy.
2. (Optional) add your domain under **Settings → Domains**.

Without any env vars the site is an exact clone of production, pointing at the
original $EMC2 mint.

## Launch-day checklist (your own pump.fun token)

Before launch, optionally set `VITE_MINT=""` (empty) and redeploy → the site
runs in teaser mode: "drops at launch", buy button and contract copy disabled.

The moment your token is live on pump.fun:

1. In Vercel **Settings → Environment Variables**, set:
   - `VITE_MINT` — your mint address (the `...pump` address from pump.fun)
   - `VITE_LAUNCH_TS` — `Date.now()` at launch (ms epoch)
   - `VITE_COMPOUND_MINUTES` — your real claim cadence (default `10`)
2. **Redeploy** (frontend vars are baked in at build time).
3. Done — buy links, DexScreener chart, contract copy button, and live
   market polling (price/mcap/liquidity/24h via `/api/market`) all switch to
   your token automatically. DexScreener data appears once the token has an
   indexed pool.

### Live "Compounds / SOL added" numbers

The stats card reads `/api/stats`, which serves whatever your compound bot
last wrote to Upstash Redis:

1. Create a free [Upstash](https://upstash.com) Redis DB; set
   `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (and optionally
   `STATS_KEY`) in Vercel. These are read per-request — no redeploy needed.
2. After each successful claim+compound, have your bot run:

   ```sh
   node scripts/update-stats.mjs --compounds <total so far> --sol <total SOL added>
   ```

   (or `POST {url}/set/{key}` to Upstash directly with
   `{"compounds":n,"solCompounded":x,"updatedAt":ms}`).

Until the bot writes real numbers the card shows a launch-clock estimate and
"since launch" — nothing breaks. The fee-claiming / liquidity-adding bot
itself is separate on-chain infrastructure and is not part of this repo.

## Build

```sh
npm run build      # outputs dist/
```
