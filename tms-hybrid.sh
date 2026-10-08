#!/usr/bin/env bash
# Compatibility entry point for pre-Librelay source installations.
exec bash "$(cd "$(dirname "$0")" && pwd)/librelay-hybrid.sh" "$@"
