// Enumerate every mainnet account/program the buy → deposit → burn path
// references, so the local fork can clone them all.
const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const { OnlinePumpAmmSdk, PumpAmmSdk, canonicalPumpPoolPda } = require("@pump-fun/pump-swap-sdk");
const BN = require("bn.js");

const RPC = "https://api.mainnet-beta.solana.com";
const MINT = new PublicKey("GX1HiPYh54o4cdPUqoeAYGC8dnhNqc3h7CtJQ8ySpump");

async function main() {
  const c = new Connection(RPC, "confirmed");
  const amm = new OnlinePumpAmmSdk(c);
  const sdk = new PumpAmmSdk();
  const poolKey = canonicalPumpPoolPda(MINT);
  const user = Keypair.generate().publicKey;

  const keys = new Set();
  const add = (ix) => ix.forEach((i) => { keys.add(i.programId.toBase58()); i.keys.forEach((k) => keys.add(k.pubkey.toBase58())); });

  const swapState = await amm.swapSolanaState(poolKey, user);
  add(await sdk.buyQuoteInput(swapState, new BN(50_000_000), 2));

  const liq = await amm.liquiditySolanaState(poolKey, user);
  const est = sdk.depositAutocompleteBaseAndLpTokenFromQuote(liq, new BN(50_000_000), 2);
  add(await sdk.depositInstructions(liq, est.lpToken, 2));

  // pool internals + mints explicitly, in case any are only in state
  [poolKey, MINT, swapState.pool.baseMint, swapState.pool.quoteMint, swapState.pool.lpMint,
   swapState.pool.poolBaseTokenAccount, swapState.pool.poolQuoteTokenAccount].forEach((k) => keys.add(k.toBase58()));

  const all = [...keys];
  const infos = await c.getMultipleAccountsInfo(all.map((k) => new PublicKey(k)));
  const programs = [], accounts = [], missing = [];
  all.forEach((k, i) => {
    const info = infos[i];
    if (!info) missing.push(k);
    else if (info.executable) programs.push(k);
    else accounts.push(k);
  });
  console.log(JSON.stringify({ programs, accounts, missing }, null, 0));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
