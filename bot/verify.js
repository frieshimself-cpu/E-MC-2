#!/usr/bin/env node
// Read-only verification of the on-chain assumptions the compound cycle
// depends on. No key, no sends — just resolves the unknowns against live
// mainnet so we stop guessing about them.

const { Connection, PublicKey } = require("@solana/web3.js");
const {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} = require("@solana/spl-token");
const { OnlinePumpSdk, PumpSdk, bondingCurvePda } = require("@pump-fun/pump-sdk");
const { OnlinePumpAmmSdk, PumpAmmSdk, canonicalPumpPoolPda } = require("@pump-fun/pump-swap-sdk");

const RPC = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const MINT = process.env.MINT || "GX1HiPYh54o4cdPUqoeAYGC8dnhNqc3h7CtJQ8ySpump";

const progName = (owner) =>
  owner.equals(TOKEN_2022_PROGRAM_ID) ? "Token-2022"
  : owner.equals(TOKEN_PROGRAM_ID) ? "classic SPL"
  : owner.toBase58();

async function main() {
  const c = new Connection(RPC, "confirmed");
  const mint = new PublicKey(MINT);
  const onlinePump = new OnlinePumpSdk(c);
  const onlineAmm = new OnlinePumpAmmSdk(c);
  const ammSdk = new PumpAmmSdk();

  console.log("mint  ", mint.toBase58());
  const poolKey = canonicalPumpPoolPda(mint);
  const poolInfo = await c.getAccountInfo(poolKey);
  if (!poolInfo) { console.log("no canonical pool — token not graduated"); return; }
  const pool = await onlineAmm.fetchPool(poolKey);
  console.log("pool  ", poolKey.toBase58());
  console.log("creator", pool.coinCreator.toBase58());

  // ---- UNKNOWN 1: what token program owns the LP mint? (burn step) --------
  const lpInfo = await c.getAccountInfo(pool.lpMint);
  console.log("\n[1] LP mint", pool.lpMint.toBase58());
  console.log("    owner  :", progName(lpInfo.owner), "  ← burn must use this program");
  console.log("    bot uses: Token-2022", lpInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? "✓ MATCH" : "✗ MISMATCH — burn would fail");

  // ---- base token program (buy/deposit ATAs) -----------------------------
  const baseInfo = await c.getAccountInfo(pool.baseMint);
  console.log("\n[2] base mint program:", progName(baseInfo.owner));

  // ---- UNKNOWN 2: claim instruction array shape --------------------------
  const claimIxs = await onlinePump.collectCoinCreatorFeeInstructions(pool.coinCreator);
  console.log("\n[3] collectCoinCreatorFeeInstructions →", claimIxs.length, "instruction(s):");
  claimIxs.forEach((ix, i) =>
    console.log(`    [${i}] program ${ix.programId.toBase58()}  (${ix.keys.length} keys)`));

  // ---- UNKNOWN 3: vault balances, post-graduation ------------------------
  const curveBal = await onlinePump.getCreatorVaultBalance(pool.coinCreator);
  const ammBal = await onlineAmm.getCoinCreatorVaultBalance(pool.coinCreator);
  console.log("\n[4] creator fee vaults:");
  console.log("    curve-side:", (curveBal.toNumber() / 1e9).toFixed(6), "SOL");
  console.log("    amm-side  :", (ammBal.toNumber() / 1e9).toFixed(6), "SOL");

  // ---- UNKNOWN 4: deposit autocomplete math against real reserves --------
  const liq = await onlineAmm.liquiditySolanaState(poolKey, pool.coinCreator);
  const BN = require("bn.js");
  const testQuote = new BN(50_000_000); // pretend we have 0.05 SOL to add
  const est = ammSdk.depositAutocompleteBaseAndLpTokenFromQuote(liq, testQuote, 2);
  console.log("\n[5] deposit 0.05 SOL quote-side → autocomplete:");
  console.log("    base needed:", est.base.toString(), "token base units");
  console.log("    lp minted  :", est.lpToken.toString());
  console.log("    (both > 0 and finite:", est.base.gtn(0) && est.lpToken.gtn(0) ? "✓" : "✗", ")");

  console.log("\ndone — assumptions resolved against live state above");
}

main().catch((e) => { console.error("verify failed:", e.message || e); process.exit(1); });
