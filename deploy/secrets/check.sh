#!/bin/sh
# Lists the keys the example file names that the cluster's secret lacks. It compares key names only and never reads values.
# Usage: deploy/secrets/check.sh [namespace] [kubectl context]
set -eu

namespace="${1:-modelvend}"
context="${2:-}"
secret=modelvend-secrets
example="$(dirname "$0")/$secret.example.env"

keys="$(kubectl ${context:+--context "$context"} -n "$namespace" get secret "$secret" \
  -o go-template='{{range $k, $v := .data}}{{$k}}{{"\n"}}{{end}}')"

missing=0
for key in $(sed -n 's/^\([A-Z_][A-Z0-9_]*\)=.*/\1/p' "$example"); do
  if ! printf '%s\n' "$keys" | grep -qx "$key"; then
    echo "missing: $key"
    missing=1
  fi
done

[ "$missing" -eq 0 ] && echo "$secret in $namespace has every key."
exit "$missing"
