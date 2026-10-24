#!/usr/bin/env bash
# Fails if any secret appears in a tracked file or in the client bundle (.next/static).
# Checks key-shaped strings, and the actual secret values from .env.local without printing them.
set -u
fail=0
echo "Tracked files:"
if git grep -nE 'sk-ant-[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}' -- . ':!pnpm-lock.yaml' >/dev/null; then echo "  FAIL: key-shaped string in a tracked file"; fail=1; else echo "  ok: no key-shaped strings"; fi
if git ls-files | grep -E '(^|/)\.env($|\.local)' >/dev/null; then echo "  FAIL: an .env file is tracked"; fail=1; else echo "  ok: no .env file tracked"; fi
if [ -d .next/static ]; then
  echo "Client bundle (.next/static):"
  if grep -rqE 'sk-ant-|ANTHROPIC_API_KEY|SPACETIMEDB_AGENT_TOKEN|SPACETIMEDB_OPERATOR_TOKEN|INCREASE_API_KEY|NESSIE_API_KEY' .next/static; then echo "  FAIL: a secret name or key prefix is in the bundle"; fail=1; else echo "  ok: no secret names or key prefixes"; fi
  if [ -f .env.local ]; then
    while IFS='=' read -r k v; do
      case "$k" in NEXT_PUBLIC_*|SPACETIMEDB_HOST|SPACETIMEDB_DB_NAME|BANK_ADAPTER|""|\#*) continue;; esac
      [ ${#v} -lt 12 ] && continue
      if grep -rqF -- "$v" .next/static; then echo "  FAIL: the value of $k is in the bundle"; fail=1; else echo "  ok: $k value not in the bundle"; fi
    done < .env.local
  fi
else
  echo "No .next/static yet: run pnpm build first to check the bundle."
fi
exit $fail
