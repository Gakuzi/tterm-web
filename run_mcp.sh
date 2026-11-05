#!/bin/bash
set -e
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
export PYTHONUNBUFFERED=1
exec "$PROJECT_DIR/.venv/bin/python" -u "$PROJECT_DIR/mcp_server.py" "$@"
