#!/bin/bash
# JARVIS — ./jarvis.sh to launch on Linux.
cd "$(dirname "$0")"
exec python3 jarvis.py "$@"
