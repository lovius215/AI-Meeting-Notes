#!/usr/bin/env bash
set -euo pipefail

PACKAGE_NAME="@loviusc/ai-meeting-notes"
CLI_NAME="meetnotes"

# 1. Mandatory check for node & npm
if ! command -v node >/dev/null 2>&1; then
  echo "[Error] Node.js is not installed. Please install Node.js (>= 18) from https://nodejs.org/ first." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[Error] npm is not installed. Please install Node.js and npm first." >&2
  exit 1
fi

# 2. Support global install or --local (npm link)
if [[ "${1:-}" == "--local" ]]; then
  echo "Linking ${PACKAGE_NAME} (${CLI_NAME}) locally via npm link..."
  npm link
  echo "Done! You can now run '${CLI_NAME} --help'."
else
  echo "Installing ${PACKAGE_NAME} globally via npm..."
  npm install -g "${PACKAGE_NAME}"
  echo "Done! You can now run '${CLI_NAME} --help'."
fi
