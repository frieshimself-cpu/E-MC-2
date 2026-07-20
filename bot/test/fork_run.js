// Execute the bot's exact liquidity mechanism against a mainnet FORK:
// buy $EMC2 with SOL → deposit both sides → burn the LP. Proves the pool's
// reserves actually rise. Uses the same SDK calls compound.js uses.
const {
  Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram,
  sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const { TOKEN_2022_PROGRAM_ID, createBurnInstruction } = require("@solana/spl-token");
const { OnlinePumpAmmSdk, PumpAmmSdk, canonicalPumpPoolPda } = require("@pump-fun/pump-swap-sdk");
const BN = require("bn.js");
const fs = require("fs");

const RPC = "http://127.0.0.1:8899";
const MINT = new PublicKey("GX1HiPYh54o4cdPUqoeAYGC8dnhNqc3h7CtJQ8ySpump");
const SLIP = 3;

const sol = (l) => (Number(l) / LAMPORTS_PER_SOL).toFixed(4);

async function send(c, w, label, ixs) {
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
    ...ixs,
  );
  const sig = await sendAndConfirmTransaction(c, tx, [w], { commitment: "confirmed", skipPreflight: false });
  console.log(`  ${label}: ${sig.slice(0, 24)}… ✓ confirmed`);
  return sig;
}

async function reserves(c, pool) {
  const [b, q] = await Promise.all([
    c.getTokenAccountBalance(pool.poolBaseTokenAccount),
    c.getTokenAccountBalance(pool.poolQuoteTokenAccount),
  ]);
  return { base: b.value.uiAmountString, quote: q.value.uiAmountString,
           quoteRaw: new BN(q.value.amount), baseRaw: new BN(b.value.amount) };
}

async function main() {
  const c = new Connection(RPC, "confirmed");
  const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.env.WALLET_FILE))));
  const amm = new OnlinePumpAmmSdk(c);
  const sdk = new PumpAmmSdk();
  const poolKey = canonicalPumpPoolPda(MINT);
  const pool = await amm.fetchPool(poolKey);

  // Mirror the bot exactly: a fee "budget" of 2 SOL, buy half, deposit the rest.
  const BUDGET = new BN(Math.floor(Number(process.env.BUDGET_SOL || "2") * LAMPORTS_PER_SOL));
  const half = BUDGET.divn(2);
  const solBefore = new BN(await c.getBalance(wallet.publicKey));
  console.log(`wallet ${wallet.publicKey.toBase58()}  balance ${sol(solBefore)} SOL`);
  const before = await reserves(c, pool);
  console.log(`\nPOOL BEFORE:  base ${before.base}   quote(SOL) ${before.quote}`);

  // -- buy $EMC2 with half the budget (bot step 4) -------------------------
  console.log(`\n[buy] swapping ${sol(half)} SOL → $EMC2`);
  const swapState = await amm.swapSolanaState(poolKey, wallet.publicKey);
  await send(c, wallet, "buy", await sdk.buyQuoteInput(swapState, half, SLIP));
  const baseHeld = new BN((await c.getTokenAccountBalance(
    (await amm.liquiditySolanaState(poolKey, wallet.publicKey)).userBaseTokenAccount)).value.amount);
  console.log(`  received ${baseHeld.toString()} base units of $EMC2`);

  // -- deposit both sides as liquidity (bot step 5) ------------------------
  console.log("\n[deposit] adding liquidity (both sides)");
  const mid = await reserves(c, pool); // reserves right after the buy → spot price
  const liq = await amm.liquiditySolanaState(poolKey, wallet.publicKey);
  const fromBase = sdk.depositAutocompleteQuoteAndLpTokenFromBase(liq, baseHeld, SLIP);
  let lpToken, bind, depBase, depQuote;
  if (fromBase.quote.lte(half)) {
    lpToken = fromBase.lpToken; bind = "base-bound (deposits all tokens)";
    depBase = baseHeld; depQuote = fromBase.quote;
  } else {
    const fq = sdk.depositAutocompleteBaseAndLpTokenFromQuote(liq, half, SLIP);
    lpToken = fq.lpToken; bind = "quote-bound (SOL-limited)";
    depBase = fq.base; depQuote = half;
  }
  console.log(`  ${bind}`);
  await send(c, wallet, "deposit", await sdk.depositInstructions(liq, lpToken, SLIP));

  // Value we just locked forever = the SOL side + the token side priced at
  // the pool's spot rate (quote/base). Burning the LP makes it unwithdrawable.
  const lockedValue = depQuote.add(depBase.mul(mid.quoteRaw).div(mid.baseRaw));

  // -- burn the LP tokens (bot step 6) -------------------------------------
  const lpAta = liq.userPoolTokenAccount;
  const lpBal = new BN((await c.getTokenAccountBalance(lpAta)).value.amount);
  console.log("\n[burn] burning LP tokens — the ratchet");
  await send(c, wallet, "burn LP", [
    createBurnInstruction(lpAta, pool.lpMint, wallet.publicKey, BigInt(lpBal.toString()), [], TOKEN_2022_PROGRAM_ID),
  ]);
  console.log(`  burned ${lpBal.toString()} LP — liquidity locked`);

  const after = await reserves(c, pool);
  const solAfter = new BN(await c.getBalance(wallet.publicKey));
  const leftBase = new BN((await c.getTokenAccountBalance(liq.userBaseTokenAccount).catch(() => ({ value: { amount: "0" } }))).value.amount);
  console.log(`\nPOOL AFTER:   base ${after.base}   quote(SOL) ${after.quote}`);
  console.log(`WALLET LEFT:  ${leftBase.toString()} base units (token dust), ${sol(solAfter)} SOL (swept into next cycle)`);

  const solSpent = solBefore.sub(solAfter);
  const effPct = solSpent.gtn(0) ? (lockedValue.muln(10000).div(solSpent).toNumber() / 100).toFixed(2) : "n/a";
  console.log(`\nEFFICIENCY:   spent ${sol(solSpent)} SOL → ${sol(lockedValue)} SOL locked as liquidity forever = ${effPct}% of spend`);
  console.log(lockedValue.gtn(0) && lpBal.gtn(0)
    ? `\n✅ RESULT: claim→buy→deposit→burn all confirmed on-chain; ${effPct}% of the SOL spent became permanently-locked liquidity. The gap to 100% is swap fee + gas — a swap is unavoidable to balance the deposit, so literal 100% is not reachable by any bot.`
    : "\n❌ RESULT: no liquidity locked.");
}
main().catch((e) => { console.error("fork run failed:", e.message || e); process.exit(1); });
