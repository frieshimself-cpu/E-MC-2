// One-off: burn the entire token balance held by the wallet (dev supply).
const {
  Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram, sendAndConfirmTransaction,
} = require("@solana/web3.js");
const { getAssociatedTokenAddressSync, createBurnInstruction, TOKEN_2022_PROGRAM_ID } = require("@solana/spl-token");
const bs58 = require("bs58").default || require("bs58");

(async () => {
  const c = new Connection(process.env.RPC_URL, "confirmed");
  const raw = process.env.WALLET_SECRET_KEY.trim();
  const bytes = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw);
  const wallet = Keypair.fromSecretKey(bytes);
  const mint = new PublicKey(process.env.MINT);
  const ata = getAssociatedTokenAddressSync(mint, wallet.publicKey, true, TOKEN_2022_PROGRAM_ID);

  const bal = await c.getTokenAccountBalance(ata);
  const amount = BigInt(bal.value.amount);
  console.log("wallet ", wallet.publicKey.toBase58());
  console.log("burning", bal.value.uiAmountString, "tokens (" + amount + " base units)");
  if (amount === 0n) { console.log("nothing to burn"); return; }

  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 150000 }),
    createBurnInstruction(ata, mint, wallet.publicKey, amount, [], TOKEN_2022_PROGRAM_ID),
  );
  const sig = await sendAndConfirmTransaction(c, tx, [wallet], { commitment: "confirmed", maxRetries: 5 });
  console.log("BURN CONFIRMED:", sig);
  const after = await c.getTokenAccountBalance(ata).catch(() => ({ value: { uiAmountString: "0" } }));
  console.log("remaining:", after.value.uiAmountString);
})().catch((e) => { console.error("burn failed:", e.message || e); process.exit(1); });
