// GET /api/stats
// -> { compounds, solCompounded, updatedAt }
//
// The compound bot writes its running totals to Upstash Redis (one JSON
// blob). This function just reads and re-serves it. Without the env vars —
// or before the bot's first write — it returns nulls and the UI falls back
// to the launch-clock estimate.

const STATS_KEY = process.env.STATS_KEY || "emc2:stats";

async function readFromUpstash() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(`${url}/get/${encodeURIComponent(STATS_KEY)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const { result } = await r.json();
    return result ? JSON.parse(result) : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method not allowed" });
  }

  const stats = await readFromUpstash();

  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
  return res.status(200).json({
    compounds: stats?.compounds ?? null,
    solCompounded: stats?.solCompounded ?? null,
    updatedAt: stats?.updatedAt ?? Date.now(),
  });
}
