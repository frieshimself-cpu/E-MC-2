// POST /api/market  { mints: string[] }
// -> { updatedAt, tokens: { [mint]: { mcap, price, vol, chg, liq } } }
//
// Proxies DexScreener so the browser never hits it directly (CORS + rate
// limits) and so responses can sit in Vercel's edge cache for 20s.

const DEX_TOKENS_URL = "https://api.dexscreener.com/tokens/v1/solana/";
const MAX_MINTS = 30;

function bestPair(pairs) {
  if (!Array.isArray(pairs) || !pairs.length) return null;
  return pairs.reduce((best, p) =>
    (p?.liquidity?.usd || 0) > (best?.liquidity?.usd || 0) ? p : best,
  );
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }

  let mints = [];
  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    mints = Array.isArray(body.mints) ? body.mints : [];
  } catch {
    mints = [];
  }
  mints = mints
    .filter((m) => typeof m === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m))
    .slice(0, MAX_MINTS);

  const tokens = {};
  for (const mint of mints) {
    tokens[mint] = { mcap: null, price: null, vol: null, chg: null, liq: null };
  }

  if (mints.length) {
    try {
      const r = await fetch(DEX_TOKENS_URL + mints.join(","), {
        headers: { accept: "application/json" },
      });
      if (r.ok) {
        const data = await r.json();
        const pairs = Array.isArray(data) ? data : data?.pairs || [];
        const byMint = {};
        for (const pair of pairs) {
          const mint = pair?.baseToken?.address;
          if (!mint || !(mint in tokens)) continue;
          (byMint[mint] = byMint[mint] || []).push(pair);
        }
        for (const [mint, list] of Object.entries(byMint)) {
          const p = bestPair(list);
          if (!p) continue;
          tokens[mint] = {
            mcap: num(p.marketCap ?? p.fdv),
            price: num(p.priceUsd),
            vol: num(p.volume?.h24),
            chg: num(p.priceChange?.h24),
            liq: num(p.liquidity?.usd),
          };
        }
      }
    } catch {
      // fall through with nulls — the UI shows "soon"
    }
  }

  res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=40");
  return res.status(200).json({ updatedAt: Date.now(), tokens });
}
