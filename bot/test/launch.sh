#!/usr/bin/env bash
set -uo pipefail
export PATH="/root/.local/share/solana/install/active_release/bin:$PATH"
cd "$(dirname "$0")"

M=https://api.mainnet-beta.solana.com
ACCOUNTS=(
  So11111111111111111111111111111111111111112
  GX1HiPYh54o4cdPUqoeAYGC8dnhNqc3h7CtJQ8ySpump
  F7NjrGbLUA3ZyqQ5sUn2F8H1fkrNGqLFtTzDmbTGkhfZ
  ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw
  8tDfFtXi1Epjh72vgvYDRzBH4GZkfcMyJyKPgvCdKdo7
  A8R6kPxRF4bj5DYWMAPVpMuksQaiJydx2wMBGJvATHzY
  G5UZAVbAf46s7cKWoyKu8kYTip9DGTpbLZ2qa9Aq69dP
  BWXT6RUhit9FfJQM3pBmqeFLPYmuxgmyhMGC5sGr8RbA
  GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR
  6R1UjJFmejjP2JNVo7EBnoJbDKz5UEuyeudk2Ly8s6Si
  C2aFPdENg4A2HQsmrd5rTw5TaYBX5Ku887cWjbFKtZpw
  5PHirr8joyTMp9JMm6nW7hNDVyEYdkzDqazxPD7RaTjx
  A7hAgCzFw14fejgCp387JUJRMNyz4j89JKnhtKU8piqW
  qkYdTGRPHbWTWuBMz45bCiU6a23axRqf6sBHm9295WY
  34oQe8HybrDVaGsE9iNotdbLiWfCuqrpYW62kzemdphq
)
CLONE_ARGS=()
for a in "${ACCOUNTS[@]}"; do CLONE_ARGS+=(--clone "$a"); done

rm -rf forkledger
solana-test-validator --reset --quiet --ledger forkledger --url "$M" \
  --clone-upgradeable-program pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA \
  --clone-upgradeable-program pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ \
  "${CLONE_ARGS[@]}" >validator.log 2>&1 &
VPID=$!
trap "kill $VPID 2>/dev/null" EXIT

echo "booting forked validator (pid $VPID)…"
for i in $(seq 1 40); do
  sleep 2
  solana cluster-version --url http://127.0.0.1:8899 >/dev/null 2>&1 && break
done
solana cluster-version --url http://127.0.0.1:8899 >/dev/null 2>&1 || { echo "validator did not boot"; tail -15 validator.log; exit 1; }
echo "up. verifying clones…"
for key in F7NjrGbLUA3ZyqQ5sUn2F8H1fkrNGqLFtTzDmbTGkhfZ pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA; do
  solana account "$key" --url http://127.0.0.1:8899 >/dev/null 2>&1 && echo "  $key ✓" || { echo "  $key MISSING"; exit 1; }
done

solana-keygen new --no-bip39-passphrase --silent -o test-wallet.json --force >/dev/null
solana airdrop 5 "$(solana-keygen pubkey test-wallet.json)" --url http://127.0.0.1:8899 >/dev/null 2>&1
echo "funded test wallet with 5 SOL"
echo "----------------------------------------------------------------"
BUDGET_SOL=${BUDGET_SOL:-0.5} WALLET_FILE=test-wallet.json node fork_run.js
STATUS=$?
echo "----------------------------------------------------------------"
exit $STATUS
