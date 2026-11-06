#!/bin/sh
# Fails if anything private to a hosted deployment is tracked in this repository.
cd "$(git rev-parse --show-toplevel)" || exit 1
bad=0
if [ -n "$(git ls-files portfolio)" ]; then echo "tracked files under portfolio/"; bad=1; fi
if git grep -nIE 'portfolio\.gate|GATE_(SECRET|ADMIN_TOKEN)' -- . ':!scripts/check-open-source.sh' >/dev/null 2>&1; then
  echo "found references to the portfolio gate:"; git grep -nIE 'portfolio\.gate|GATE_(SECRET|ADMIN_TOKEN)' -- . ':!scripts/check-open-source.sh'; bad=1
fi
if git ls-files | grep -qE '(^|/)\.env$|\.impeccable/'; then echo "tracked .env or .impeccable"; bad=1; fi
exit $bad
