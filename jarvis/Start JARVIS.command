#!/bin/bash
# JARVIS — double-click to launch on macOS.
cd "$(dirname "$0")"
exec python3 jarvis.py "$@"
