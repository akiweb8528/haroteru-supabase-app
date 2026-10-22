#!/bin/sh
set -eu

if [ -f /app/.env.local ]; then
  set -a
  . /app/.env.local
  set +a
fi

exec "$@"
