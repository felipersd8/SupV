#!/usr/bin/env bash
# Encerra SOMENTE os processos lançados por tools/nested-run.sh (PIDs em $STATE/pids).
set -uo pipefail
STATE="${XDG_RUNTIME_DIR:-/tmp}/supv-devkit"
[ -f "$STATE/pids" ] || { echo "nada a encerrar"; exit 0; }
while read -r pid; do
    [ -n "$pid" ] || continue
    if kill -0 "$pid" 2>/dev/null; then
        echo "kill $pid ($(tr '\0' ' ' < /proc/$pid/cmdline 2>/dev/null | cut -c1-60))"
        kill "$pid" 2>/dev/null
    fi
done < "$STATE/pids"
sleep 1
while read -r pid; do
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
done < "$STATE/pids"
: > "$STATE/pids"
