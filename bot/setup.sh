#!/usr/bin/env bash
# One-time setup: creates the bot wallet locally and uploads the bot's
# secrets straight into GitHub Actions — the key never leaves your machine
# except into GitHub's secret store.
#
#   bash bot/setup.sh
#
# Needs: solana CLI (https://docs.solanalabs.com/cli/install) and
#        gh CLI, logged in (https://cli.github.com → `gh auth login`)

set -euo pipefail
cd "$(dirname "$0")"

WALLET=bot-wallet.json

command -v solana-keygen >/dev/null || { echo "✗ install the Solana CLI first: https://docs.solanalabs.com/cli/install"; exit 1; }
command -v gh >/dev/null || { echo "✗ install the GitHub CLI first: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "✗ run: gh auth login"; exit 1; }

# 1. wallet — created locally, reused if it already exists
if [ -f "$WALLET" ]; then
  echo "• reusing existing $WALLET"
else
  solana-keygen new --no-bip39-passphrase --silent -o "$WALLET"
  echo "• created $WALLET"
fi
ADDRESS=$(solana-keygen pubkey "$WALLET")

# 2. secrets → GitHub Actions
gh secret set WALLET_SECRET_KEY < "$WALLET"
echo "• uploaded WALLET_SECRET_KEY"

read -r -p "RPC URL (free key from https://helius.dev): " RPC_URL
[ -n "$RPC_URL" ] && gh secret set RPC_URL --body "$RPC_URL" && echo "• uploaded RPC_URL"

read -r -p "Upstash REST URL (https://upstash.com, enter to skip): " UP_URL
if [ -n "$UP_URL" ]; then
  gh secret set UPSTASH_REDIS_REST_URL --body "$UP_URL"
  read -r -p "Upstash REST token: " UP_TOKEN
  gh secret set UPSTASH_REDIS_REST_TOKEN --body "$UP_TOKEN"
  echo "• uploaded Upstash credentials"
else
  echo "• skipped Upstash — the site's stats card will use its fallback until you add it"
fi

cat <<DONE

✓ setup complete

  bot wallet address:  $ADDRESS

Now:
  1. BACK UP $WALLET somewhere safe — GitHub secrets are write-only,
     and this key IS the creator-fee rights. Lost key = lost fees, forever.
  2. Send ~0.1 SOL to the address above (deploy cost + gas float).
  3. On launch day: import $WALLET into your wallet app (Phantom →
     Add account → Import private key) and DEPLOY THE TOKEN FROM IT.
  4. Send the token's CA to Claude — everything after that is automated.
DONE
