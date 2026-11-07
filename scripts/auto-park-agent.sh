#!/usr/bin/env bash
set -euo pipefail

# Ensure standard user tool paths are present in cron environments
export PATH="/home/beno/.nvm/versions/node/v24.13.0/bin:/home/beno/.npm-global/bin:/home/beno/.local/bin:/home/beno/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_DIR}"

exec node scripts/auto-park-agent.mjs "$@"
