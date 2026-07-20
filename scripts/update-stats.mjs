#!/usr/bin/env node
// Writes the compound bot's running totals to Upstash Redis, where
// api/stats.js reads them. Call it after every successful compound:
//
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
//   node scripts/update-stats.mjs --compounds 42 --sol 13.37
//
// The stats card on the site updates within ~30s (client poll + edge cache).

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};

const compounds = Number(get("--compounds"));
const solCompounded = Number(get("--sol"));

if (!Number.isFinite(compounds) || !Number.isFinite(solCompounded)) {
  console.error("usage: node scripts/update-stats.mjs --compounds <int> --sol <number>");
  process.exit(1);
}

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const key = process.env.STATS_KEY || "emc2:stats";

if (!url || !token) {
  console.error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set");
  process.exit(1);
}

const payload = JSON.stringify({ compounds, solCompounded, updatedAt: Date.now() });

const res = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: payload,
});

if (!res.ok) {
  console.error(`upstash write failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log(`ok — ${key} = ${payload}`);
