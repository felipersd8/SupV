#!/usr/bin/env bash
# Executa JS dentro do shell aninhado via org.gnome.Shell.Eval (precisa de --unsafe-mode).
# Uso: tools/eval.sh 'Main.notify("oi")'    (ou via stdin:  tools/eval.sh - < script.js)
set -euo pipefail
STATE="${XDG_RUNTIME_DIR:-/tmp}/supv-devkit"
export DBUS_SESSION_BUS_ADDRESS="$(cat "$STATE/bus")"
if [ "${1:-}" = "-" ]; then code="$(cat)"; else code="$1"; fi
# gdbus interpreta o argumento como literal GVariant → escapamos como string JSON.
quoted="$(printf '%s' "$code" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')"
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
  --method org.gnome.Shell.Eval "$quoted"
