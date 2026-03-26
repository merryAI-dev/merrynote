#!/usr/bin/env bash
# Legacy compatibility wrapper. Keep old SwiftBar filename working.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/merrynote.5m.sh" "$@"
