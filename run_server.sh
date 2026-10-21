#!/bin/sh
# Python API on :8765 over NeuroPy; the web dev server proxies /api here.
cd "$(dirname "$0")"
PYTHONPATH="${NEUROPY_ROOT:-/Users/selinl/Documents/ms_synchrony/NeuroPy}:." exec /Users/selinl/miniforge3/envs/NeuroPy2/bin/python -m uvicorn server.app:app --host 127.0.0.1 --port "${NEUROMAP_API_PORT:-8765}"
