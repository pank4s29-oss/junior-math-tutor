#!/usr/bin/env sh
set -eu

cleanup() {
  kill "$api_pid" "$web_pid" 2>/dev/null || true
}

pnpm dev:api &
api_pid=$!
pnpm dev:client &
web_pid=$!

trap cleanup INT TERM EXIT
wait "$api_pid" "$web_pid"
