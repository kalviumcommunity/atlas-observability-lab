#!/usr/bin/env bash
# Simulate a checkout incident by driving traffic while the payments
# dependency is forced down. Run AFTER: FORCE_DEP_DOWN=1 docker compose up -d --build
set -euo pipefail

DURATION="${1:-120}"   # seconds to hammer the endpoint
echo "Driving /checkout traffic for ${DURATION}s ..."

end=$(( $(date +%s) + DURATION ))
while [ "$(date +%s)" -lt "$end" ]; do
  curl -s -o /dev/null http://localhost:8080/checkout || true
  sleep 0.2
done

echo "Done. Check http://localhost:9090/alerts for HighErrorRate."
