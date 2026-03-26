#!/usr/bin/env bash
# Legacy compatibility wrapper. Keep old entry point working.

DAEMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$DAEMON_DIR/merrynoted.sh" "$@"
