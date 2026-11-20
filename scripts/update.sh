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

# 2. Update to @latest
echo "Updating ${PACKAGE_NAME} (${CLI_NAME}) to @latest..."
npm install -g "${PACKAGE_NAME}@latest"
echo "Update complete! Current version:"
"${CLI_NAME}" --version || true
