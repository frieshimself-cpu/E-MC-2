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

## Build & deploy

```sh
npm run build      # outputs dist/
```

Deploy on Vercel: framework preset **Vite**, functions in `api/` are picked up
automatically. Token config (mint address, launch timestamp, compound interval,
links) lives at the top of `src/App.jsx`.
