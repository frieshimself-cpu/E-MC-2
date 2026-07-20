#!/usr/bin/env node
// E=MC² compound bot — claims pump.fun creator fees and locks them into
// PumpSwap liquidity, exactly as the site describes:
//
//   every cycle    — claim ALL accrued pump.fun creator fees (curve + AMM)
//   once graduated — also compound them:
//           → send (100 − COMPOUND_PCT)% to PAYOUT_ADDRESS
//           → swap half the rest into $EMC2
//           → deposit both sides as liquidity
//           → burn the LP tokens (liquidity can never be withdrawn)
//           → publish {compounds, solCompounded} to Upstash for the site
//   pre-graduation there is no pool to compound into, so claimed fees are held
//   in the wallet and swept into the first compound at graduation
//
// The wallet must BE the token creator (fees are only claimable by the
// creator). Keep only a small gas float in it: everything above GAS_RESERVE
// is treated as fee proceeds and compounded, which also makes crashed
// cycles self-heal on the next run.
//
// DRY_RUN=1 does every read and builds/simulates instructions but sends
// nothing and writes no stats.

const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createCloseAccountInstruction,
  createBurnInstruction,
} = require("@solana/spl-token");
const BN = require("bn.js");
const bs58 = require("bs58").default || require("bs58");
const {
  OnlinePumpSdk,
  PumpSdk,
  bondingCurvePda,
  feeSharingConfigPda,
} = require("@pump-fun/pump-sdk");
const {
  OnlinePumpAmmSdk,
  PumpAmmSdk,
  canonicalPumpPoolPda,
  PUMP_PROGRAM_ID,
} = require("@pump-fun/pump-swap-sdk");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Committed defaults (bot/config.json) that env vars override — lets launch
// config (mint, go-live, split) ship as commits instead of repo-settings edits.
let config = { mint: "", dryRun: true, compoundPct: 100, payoutAddress: "" };
try {
  config = { ...config, ...require("./config.json") };
} catch {}

const env = process.env;
const RPC_URL = env.RPC_URL;
const MINT = env.MINT || config.mint;
const DRY_RUN = env.DRY_RUN != null && env.DRY_RUN !== ""
  ? env.DRY_RUN === "1" || env.DRY_RUN === "true"
  : config.dryRun !== false;
// Share of each claim that gets compounded into liquidity; the rest is sent
// to PAYOUT_ADDRESS. Without a payout address the remainder has nowhere to
// go and is compounded as well (the wallet is swept to its gas float).
const COMPOUND_PCT = Math.min(100, Math.max(1, Number(env.COMPOUND_PCT || config.compoundPct || 100)));
const PAYOUT_ADDRESS = env.PAYOUT_ADDRESS || config.payoutAddress || "";
const MIN_CLAIM_SOL = Number(env.MIN_CLAIM_SOL || "0.05");
const GAS_RESERVE_SOL = Number(env.GAS_RESERVE_SOL || "0.03");
const SLIPPAGE_PCT = Number(env.SLIPPAGE_PCT || "2"); // percent, e.g. 2 = 2%
const PRIORITY_FEE = Number(env.PRIORITY_FEE_MICROLAMPORTS || "150000");
const STATS_KEY = env.STATS_KEY || "emc2:stats";

function fail(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}

if (!RPC_URL) fail("RPC_URL is required");
if (!MINT) {
  console.log("no mint configured yet (bot/config.json) — waiting for launch");
  process.exit(0);
}

function loadWallet() {
  const raw = env.WALLET_SECRET_KEY;
  if (!raw) {
    if (DRY_RUN && env.WALLET_ADDRESS) return { publicKey: new PublicKey(env.WALLET_ADDRESS), dryOnly: true };
    fail("WALLET_SECRET_KEY is required (or WALLET_ADDRESS with DRY_RUN=1)");
  }
  try {
    const bytes = raw.trim().startsWith("[")
      ? Uint8Array.from(JSON.parse(raw))
      : bs58.decode(raw.trim());
    return Keypair.fromSecretKey(bytes);
  } catch (e) {
    fail("WALLET_SECRET_KEY is neither a JSON byte array nor base58: " + e.message);
  }
}

const sol = (lamports) => (Number(lamports) / LAMPORTS_PER_SOL).toFixed(4);
const bn = (v) => new BN(String(v));

// ---------------------------------------------------------------------------
// Stats (Upstash Redis REST) — same blob api/stats.js serves to the site
// ---------------------------------------------------------------------------

async function upstash(cmd) {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const r = await fetch(`${url}/${cmd}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`upstash ${r.status}`);
  return (await r.json()).result;
}

async function readStats() {
  try {
    const raw = await upstash(`get/${encodeURIComponent(STATS_KEY)}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("stats read failed:", e.message);
    return null;
  }
}

async function writeStats(stats) {
  if (DRY_RUN) {
    console.log("dry-run: would write stats", stats);
    return;
  }
  try {
    const blob = encodeURIComponent(JSON.stringify(stats));
    await upstash(`set/${encodeURIComponent(STATS_KEY)}/${blob}`);
    console.log("stats →", stats);
  } catch (e) {
    console.warn("stats write failed:", e.message);
  }
}

async function heartbeat() {
  const prev = (await readStats()) || { compounds: null, solCompounded: null };
  await writeStats({ ...prev, updatedAt: Date.now() });
}

// ---------------------------------------------------------------------------
// Transaction helper
// ---------------------------------------------------------------------------

async function send(connection, wallet, label, instructions) {
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE }),
    ...instructions,
  );
  if (DRY_RUN) {
    tx.feePayer = wallet.publicKey;
    const sim = await connection.simulateTransaction(tx, undefined);
    const err = sim.value.err ? JSON.stringify(sim.value.err) : "ok";
    console.log(`dry-run: ${label} — ${instructions.length} ix, simulate: ${err}`);
    if (sim.value.err && sim.value.logs) console.log(sim.value.logs.slice(-5).join("\n"));
    return null;
  }
  const sig = await sendAndConfirmTransaction(connection, tx, [wallet], {
    commitment: "confirmed",
    maxRetries: 5,
  });
  console.log(`${label}: ${sig}`);
  return sig;
}

// ---------------------------------------------------------------------------
// The cycle
// ---------------------------------------------------------------------------

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = loadWallet();
  const mint = new PublicKey(MINT);
  const pumpSdk = new PumpSdk();
  const onlinePump = new OnlinePumpSdk(connection);
  const onlineAmm = new OnlinePumpAmmSdk(connection);
  const ammSdk = new PumpAmmSdk();

  console.log(`mint   ${mint.toBase58()}`);
  console.log(`wallet ${wallet.publicKey.toBase58()}${DRY_RUN ? " (DRY RUN)" : ""}`);

  let pool = null;

  // -- state: bonding curve / graduated, legacy vault vs sharing config -----
  const poolKey = canonicalPumpPoolPda(mint);
  const sharingKey = feeSharingConfigPda(mint);
  const [curveInfo, poolInfo, sharingInfo] = await Promise.all([
    connection.getAccountInfo(bondingCurvePda(mint)),
    connection.getAccountInfo(poolKey),
    connection.getAccountInfo(sharingKey),
  ]);
  const curve = curveInfo ? pumpSdk.decodeBondingCurveNullable(curveInfo) : null;
  const graduated = !!poolInfo && (!curve || curve.complete);
  // Modern pump.fun migrates creator fees to a "fee sharing config": fees are
  // claimed with distributeCreatorFees (not collectCreatorFee) and routed to
  // shareholders. Detected by the presence of the sharing-config account.
  const sharing = sharingInfo ? pumpSdk.decodeSharingConfig(sharingInfo) : null;

  if (!curve && !poolInfo) {
    console.log("mint not found on pump.fun yet — nothing to claim");
    await heartbeat();
    return;
  }
  if (graduated) pool = await onlineAmm.fetchPool(poolKey);
  console.log(
    `state  ${graduated ? "graduated ✓" : "bonding curve"} · fees ${sharing ? "SHARING CONFIG" : "legacy creator vault"}`,
  );

  // Ownership / beneficiary check.
  if (sharing) {
    const me = sharing.shareholders.find((h) => h.address.equals(wallet.publicKey));
    const bps = me ? me.shareBps : 0;
    console.log(
      `sharing: ${sharing.shareholders.length} shareholder(s); this wallet's share = ${(bps / 100).toFixed(2)}%`,
    );
    if (!me) {
      const msg = "wallet is not a shareholder in this token's fee-sharing config — it would receive nothing to compound";
      if (DRY_RUN) console.warn("⚠ " + msg);
      else return fail(msg);
    } else if (bps < 10000) {
      console.warn(`⚠ this wallet's share is ${(bps / 100).toFixed(2)}%, not 100% — only that share reaches liquidity`);
    }
  } else {
    const creator = graduated ? pool.coinCreator : curve.creator;
    console.log(`creator ${creator.toBase58()}`);
    if (!wallet.publicKey.equals(creator)) {
      const msg = `wallet is not the coin creator — creator fees can only be claimed by ${creator.toBase58()}`;
      if (DRY_RUN) console.warn("⚠ " + msg);
      else return fail(msg);
    }
  }

  // -- how much is claimable (claim runs EVERY cycle) ----------------------
  // The vault authority that holds AMM-side fees is the sharing-config PDA
  // under a sharing config, else the coin creator.
  const vaultAuthority = sharing ? sharingKey : graduated ? pool.coinCreator : curve.creator;
  const [curveSideFees, ammSideFees, walletBalance] = await Promise.all([
    onlinePump.getCreatorVaultBalance(vaultAuthority),
    graduated ? onlineAmm.getCoinCreatorVaultBalance(vaultAuthority) : Promise.resolve(bn(0)),
    connection.getBalance(wallet.publicKey),
  ]);
  const accrued = curveSideFees.add(ammSideFees);
  const reserve = Math.round(GAS_RESERVE_SOL * LAMPORTS_PER_SOL);
  const surplus = Math.max(0, walletBalance - reserve);
  const minClaim = Math.round(MIN_CLAIM_SOL * LAMPORTS_PER_SOL);

  console.log(
    `fees   ${sol(accrued)} SOL claimable (curve ${sol(curveSideFees)} + amm ${sol(ammSideFees)}); wallet surplus ${sol(surplus)} SOL`,
  );

  if (accrued.ltn(minClaim) && surplus < minClaim) {
    console.log(`below MIN_CLAIM_SOL (${MIN_CLAIM_SOL}) — nothing to do this cycle`);
    await heartbeat();
    return;
  }

  // -- 1. claim / distribute creator fees -----------------------------------
  if (accrued.gtn(0)) {
    let claimIxs, label;
    if (sharing) {
      // distributeCreatorFees consolidates the AMM vault (if graduated) and
      // pays every shareholder their share. The SDK assembles the accounts.
      claimIxs = (await onlinePump.buildDistributeCreatorFeesInstructions(mint)).instructions;
      label = "distribute (sharing config)";
    } else {
      // Legacy collectCreatorFee. Full bundle when graduated (both vaults +
      // WSOL unwrap); pre-graduation only the pump-program collect (filtered
      // by program id, not array position).
      const bundle = await onlinePump.collectCoinCreatorFeeInstructions(vaultAuthority);
      claimIxs = graduated ? bundle : bundle.filter((ix) => ix.programId.equals(PUMP_PROGRAM_ID));
      label = graduated ? "claim curve+amm" : "claim curve";
    }
    await send(connection, wallet, label, claimIxs);
  } else {
    console.log("vaults empty — compounding wallet surplus only");
  }

  // Pre-graduation there is no pool to compound into: the claimed fees sit in
  // the wallet and are swept into the very first post-graduation compound.
  if (!graduated) {
    console.log("bonding curve — fees claimed and held; compounding begins at graduation");
    await heartbeat();
    return;
  }

  // -- 2. operator share ----------------------------------------------------
  let balance = DRY_RUN ? walletBalance + Number(accrued) : await connection.getBalance(wallet.publicKey);
  const keepShare = Math.floor((Number(accrued) * (100 - COMPOUND_PCT)) / 100);
  if (keepShare > 0) {
    if (PAYOUT_ADDRESS) {
      const payout = new PublicKey(PAYOUT_ADDRESS);
      const amount = Math.min(keepShare, Math.max(0, balance - reserve));
      if (amount > 0) {
        const { SystemProgram } = require("@solana/web3.js");
        await send(connection, wallet, `payout ${100 - COMPOUND_PCT}%`, [
          SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: payout, lamports: amount }),
        ]);
        console.log(`paid out ${sol(amount)} SOL to ${payout.toBase58()}`);
        if (!DRY_RUN) balance = await connection.getBalance(wallet.publicKey);
        else balance -= amount;
      }
    } else {
      console.warn(
        `⚠ COMPOUND_PCT=${COMPOUND_PCT} but no PAYOUT_ADDRESS set — the ${100 - COMPOUND_PCT}% remainder will be compounded too`,
      );
    }
  }

  // -- 3. budget ------------------------------------------------------------
  const budget = balance - reserve;
  if (budget < minClaim) {
    console.log(`post-claim budget ${sol(budget)} SOL below minimum — stopping here`);
    await heartbeat();
    return;
  }
  const half = Math.floor(budget / 2);
  console.log(`budget ${sol(budget)} SOL → buy ${sol(half)} + deposit`);

  // -- 4. swap half into the token -----------------------------------------
  const swapState = await onlineAmm.swapSolanaState(poolKey, wallet.publicKey);
  const buyIxs = await ammSdk.buyQuoteInput(swapState, bn(half), SLIPPAGE_PCT);
  await send(connection, wallet, "buy", buyIxs);

  // -- 5. deposit both sides as liquidity -----------------------------------
  const liqState = await onlineAmm.liquiditySolanaState(poolKey, wallet.publicKey);
  const baseAta = liqState.userBaseTokenAccount;
  const baseBal = DRY_RUN
    ? null
    : bn((await connection.getTokenAccountBalance(baseAta)).value.amount);
  const quoteBudget = bn(
    Math.max(0, (DRY_RUN ? budget - half : (await connection.getBalance(wallet.publicKey)) - reserve)),
  );

  let lpToken;
  if (DRY_RUN) {
    const est = ammSdk.depositAutocompleteBaseAndLpTokenFromQuote(liqState, quoteBudget, SLIPPAGE_PCT);
    lpToken = est.lpToken;
    console.log(`dry-run: deposit would target ~${lpToken.toString()} LP`);
  } else {
    // Prefer depositing ALL the tokens we just bought: then any leftover is
    // SOL, which the next cycle sweeps, instead of tokens, which would pile up
    // in the wallet uncompounded. Fork-tested — this flips ~4% token dust into
    // self-healing SOL dust. Fall back to quote-bound if pairing every token
    // would need more SOL than the budget has.
    const fromBase = ammSdk.depositAutocompleteQuoteAndLpTokenFromBase(liqState, baseBal, SLIPPAGE_PCT);
    if (fromBase.quote.lte(quoteBudget)) {
      lpToken = fromBase.lpToken;
    } else {
      lpToken = ammSdk.depositAutocompleteBaseAndLpTokenFromQuote(liqState, quoteBudget, SLIPPAGE_PCT).lpToken;
    }
    const depositIxs = await ammSdk.depositInstructions(liqState, lpToken, SLIPPAGE_PCT);
    await send(connection, wallet, "deposit", depositIxs);
  }

  // -- 6. burn the LP tokens — the ratchet ---------------------------------
  if (!DRY_RUN) {
    const lpAta = liqState.userPoolTokenAccount;
    const lpBal = bn((await connection.getTokenAccountBalance(lpAta)).value.amount);
    if (lpBal.gtn(0)) {
      const burnIx = createBurnInstruction(
        lpAta,
        pool.lpMint,
        wallet.publicKey,
        BigInt(lpBal.toString()),
        [],
        TOKEN_2022_PROGRAM_ID,
      );
      await send(connection, wallet, "burn LP", [burnIx]);
      console.log(`burned ${lpBal.toString()} LP — liquidity locked forever`);
    }
  } else {
    console.log("dry-run: would burn all LP tokens received from the deposit");
  }

  // -- 7. publish stats -----------------------------------------------------
  const compounded = Number(budget) / LAMPORTS_PER_SOL;
  const prev = (await readStats()) || { compounds: 0, solCompounded: 0 };
  await writeStats({
    compounds: (prev.compounds || 0) + 1,
    solCompounded: Math.round(((prev.solCompounded || 0) + compounded) * 1000) / 1000,
    updatedAt: Date.now(),
  });
  console.log(`✓ cycle complete — ${sol(budget)} SOL compounded into liquidity`);
}

main().catch((e) => {
  console.error("✗ cycle failed:", e.message || e);
  process.exit(1);
});
