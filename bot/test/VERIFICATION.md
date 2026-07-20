# Bot verification — how we know the mechanism works

The compound bot's liquidity path was tested by **executing it against a
mainnet fork**, not just by building instructions. A local `solana-test-validator`
cloned a live, already-graduated PumpSwap pool (the reference token
`GX1Hi…pump`) plus the pump programs; a throwaway wallet funded on the fork
then ran the exact SDK calls the bot uses.

## What was proven (executed on-chain, confirmed)

- **buy → deposit → burn all confirmed** against real pool state.
- **LP mint is Token-2022** — so the burn program the bot uses is correct
  (checked with `verify.js` against live mainnet).
- **Liquidity is locked**: the LP tokens minted by the deposit are burned every
  cycle, so the added liquidity can never be withdrawn.
- **Efficiency ≈ 98.4%** on a 0.5 SOL cycle: `spent 0.5080 SOL → 0.5000 SOL
  locked as liquidity forever`. Measured as (SOL side + token side priced at
  pool spot) ÷ SOL spent.

## Two real bugs this testing caught (both fixed)

1. **Claim** — `collectCoinCreatorFeeInstructions()` already returns the
   complete 4-instruction bundle (curve collect, ATA create, AMM collect, WSOL
   unwrap). The bot had been cherry-picking one instruction and rebuilding the
   rest, which mishandled the normal post-graduation case (curve vault empty,
   fees all AMM-side). Now uses the SDK bundle.
2. **Deposit dust** — deposits now prefer putting in *all* the bought tokens, so
   leftover is self-healing SOL (swept next cycle) rather than tokens that pile
   up uncompounded. In a deep pool token dust → ~0.

## The honest gap to "100%"

Compounding a SOL-denominated fee into two-sided liquidity **requires a swap**,
and swaps cost a fee + gas + a little slippage. So ~1–2% is lost on the way in;
literal 100% is not reachable by any bot. Net liquidity still rises every cycle.

## Not yet executed live

The **fee claim itself** can only be signed by the creator wallet, which does
not exist in a fork. It is read-verified (correct bundle, correct programs) but
must be confirmed on the first real cycle — run with `DRY_RUN` off and a low
`MIN_CLAIM_SOL`, watch the claim land on Solscan, then let it run unattended.

## Reproduce

```sh
cd bot && npm ci
bash test/launch.sh            # boots the fork, runs one cycle, prints efficiency
BUDGET_SOL=2 bash test/launch.sh
```

Requires the Solana CLI (`solana-test-validator`) and outbound access to a
mainnet RPC for cloning. The harness targets the reference graduated pool
because a brand-new token has no pool to test against until it bonds.
