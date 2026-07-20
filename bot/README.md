# E=MC² compound bot

Implements exactly what the site promises: every 10 minutes, claim 100% of the
token's pump.fun creator fees and lock them into liquidity.

```
idle    until the token graduates (canonical PumpSwap pool exists)
cycle   claim creator fees (bonding-curve vault + PumpSwap vault)
        → swap half into the token
        → deposit both sides into the PumpSwap pool
        → burn the LP tokens  ← "liquidity is never withdrawn" is enforced, not promised
        → publish {compounds, solCompounded} to Upstash (the site reads it)
```

## Before you deploy the token — the one irreversible decision

Creator fees can **only be claimed by the wallet that creates the token**.
So the bot wallet and the token-deployer wallet must be the same wallet:

```sh
solana-keygen new --no-bip39-passphrase -o bot-wallet.json   # fresh keypair
solana address -k bot-wallet.json                            # its address
```

Fund it with ~0.1 SOL, import it into your wallet app if you want, and
**deploy the token from it**. Never deploy from your personal wallet.

## Fast path: one script

```sh
bash bot/setup.sh
```

Creates the bot wallet locally (`bot/bot-wallet.json`, gitignored), uploads
`WALLET_SECRET_KEY` / `RPC_URL` / Upstash secrets to GitHub Actions via the
`gh` CLI, and prints the address to fund. Back the wallet file up — GitHub
secrets are write-only and the key IS the creator-fee rights.

Launch config ships as commits, not settings: `bot/config.json` holds
`{ mint, dryRun }` (env vars override it). Deploy the token from the bot
wallet, hand the CA to whoever drives the repo (or commit it yourself), flip
`dryRun` to `false` when rehearsals look right.

## Manual setup (GitHub Actions, free)

The workflow `.github/workflows/compound.yml` runs every 10 minutes on the
repo's **default branch**. Configure in *Settings → Secrets and variables →
Actions*:

**Secrets**

| name | value |
|---|---|
| `RPC_URL` | your RPC endpoint (free Helius/QuickNode key; public RPC will rate-limit) |
| `WALLET_SECRET_KEY` | the bot wallet key — contents of `bot-wallet.json`, or a base58 export |
| `UPSTASH_REDIS_REST_URL` | same Upstash DB the site's `/api/stats` reads |
| `UPSTASH_REDIS_REST_TOKEN` | ” |

**Variables**

| name | default | meaning |
|---|---|---|
| `MINT` | `bot/config.json` value | your token's mint address |
| `DRY_RUN` | `bot/config.json` value | `1` = rehearse: reads + simulations only, no sends (also a manual-run input) |
| `COMPOUND_PCT` | `bot/config.json` value (75) | share of each claim compounded into liquidity |
| `PAYOUT_ADDRESS` | `bot/config.json` value | wallet that receives the remaining share. **Required for a real split** — without it the remainder is compounded too. Public address, not a key. |
| `MIN_CLAIM_SOL` | `0.05` | skip the cycle below this much accrued/surplus SOL |
| `GAS_RESERVE_SOL` | `0.03` | float that always stays in the wallet for tx fees |
| `SLIPPAGE_PCT` | `2` | max slippage per swap/deposit, percent |
| `PRIORITY_FEE_MICROLAMPORTS` | `150000` | priority fee per compute unit |
| `STATS_KEY` | `emc2:stats` | Upstash key the site reads |

Rollout order: set `DRY_RUN=1` → run the workflow manually (*Actions →
compound → Run workflow*) → read the logs → remove `DRY_RUN` when it looks
right. Pre-graduation every run just logs
`waiting for graduation (curve ~N% sold)` and heartbeats the stats — safe to
enable on day one.

Local run: `cd bot && npm ci && RPC_URL=... MINT=... DRY_RUN=1 node compound.js`
(add `WALLET_ADDRESS=<pubkey>` to dry-run without the secret key).

## Safety properties

- The wallet is dedicated: everything above `GAS_RESERVE_SOL` is by definition
  fee proceeds and gets compounded. A crashed cycle leaves funds in the wallet
  and the next run sweeps them — no state to corrupt.
- The bot refuses to run against a pool whose `coinCreator` isn't its own
  wallet (nothing to claim) — a wrong `MINT` fails loudly instead of trading.
- LP tokens are burned (Token-2022) the moment they're received; there is no
  instruction path in this codebase that withdraws liquidity.
- GitHub Actions `concurrency` prevents overlapping cycles; timing can slip a
  few minutes at GitHub's busy hours, which only delays a claim, never loses it.
- Keep the wallet's float small. The key sits in GitHub secrets — anyone with
  repo admin can read it, so treat repo admin = custody.
