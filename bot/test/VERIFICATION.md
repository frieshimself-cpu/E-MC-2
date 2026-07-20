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

## Three real bugs this testing caught (all fixed)

1. **Claim bundle** — `collectCoinCreatorFeeInstructions()` already returns the
   complete 4-instruction bundle (curve collect, ATA create, AMM collect, WSOL
   unwrap). The bot had been cherry-picking one instruction and rebuilding the
   rest, which mishandled the normal post-graduation case (curve vault empty,
   fees all AMM-side). Now uses the SDK bundle.
2. **Deposit dust** — deposits now prefer putting in *all* the bought tokens, so
   leftover is self-healing SOL (swept next cycle) rather than tokens that pile
   up uncompounded. In a deep pool token dust → ~0.
3. **Sharing-config regime (critical)** — simulating the claim against a real
   graduated token with 47 SOL of fees waiting returned on-chain error **6050:
   `creator_vault has been migrated to sharing config, use
   pump:distribute_creator_fees instead`.** Modern pump.fun routes graduated
   creator fees through a *fee-sharing config*, claimed with
   `distributeCreatorFees`, not `collectCreatorFee`. The bot would have failed
   to claim anything on such tokens. Fixed: the bot now detects the regime
   (`feeSharingConfigPda` account present) and uses
   `buildDistributeCreatorFeesInstructions` for sharing-config tokens — which
   **simulated `ok`** against that same 47-SOL token.

## Claim paths validated by simulation against real mainnet tokens

The claim itself can only be *executed* by the fee owner (whose key we don't
hold), but each path was **simulated against live state**, which runs the real
program logic:

| regime | token state | instruction | result |
|---|---|---|---|
| bonding curve | pre-graduation | `collectCreatorFee` (curve only) | simulate **ok** |
| legacy vault | graduated (older token) | `collectCoinCreatorFee` bundle | builds; sim blocked only by an empty test wallet |
| sharing config | graduated (modern token) | `distributeCreatorFees` | simulate **ok**, 47 SOL |

**Fee routing caveat (sharing config):** fees are split among the config's
shareholders by `shareBps`. The bot decodes the config and refuses to run
unless its wallet is a shareholder, and warns if the wallet's share is < 100%.
Whether the launch wallet receives 100% depends on how the token's fee-sharing
is set up at creation — verify on the first live cycle.

## Constant claiming

The bot claims **every cycle** from launch: curve-side fees during the bonding
phase (held in the wallet), then curve+AMM (or distribute) once graduated.
Pre-graduation there is no pool to compound into, so held fees are swept into
the first post-graduation compound.

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
