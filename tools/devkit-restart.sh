#!/usr/bin/env bash
# Reinstala a extensão no usuário e reinicia o shell aninhado (devkit).
# Espera o Eval responder e imprime estado + mensagens da supv.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="${XDG_RUNTIME_DIR:-/tmp}/supv-devkit"
LOG="${DEVKIT_LOG:-$STATE/devkit.log}"
mkdir -p "$STATE"

"$HERE/install.sh" >/dev/null

# mata só o dbus-run-session do devkit (pelo PID gravado), nunca por nome
[ -f "$STATE/devkit.pid" ] && kill "$(cat "$STATE/devkit.pid")" 2>/dev/null
for _ in 1 2 3 4 5; do [ -f "$STATE/shell.pid" ] && kill -0 "$(cat "$STATE/shell.pid")" 2>/dev/null || break; sleep 1; done
[ -f "$STATE/shell.pid" ] && kill "$(cat "$STATE/shell.pid")" 2>/dev/null
sleep 1
nohup "$HERE/tools/devkit.sh" > "$LOG" 2>&1 &
echo $! > "$STATE/devkit.pid"
for i in $(seq 1 40); do
    sleep 1
    if "$HERE/tools/eval.sh" 'true' >/dev/null 2>&1; then
        break
    fi
done
sleep 2
echo "== estado das extensões"
"$HERE/tools/eval.sh" 'JSON.stringify([...Main.extensionManager._extensions].filter(([k])=>k.startsWith("supv")).map(([k,v])=>[k,v.state,String(v.error||"")]))'
echo "== log (supv / erros)"
grep -iE "supv|JS ERROR|CRITICAL|WARNING" "$LOG" | grep -v "NM.Object\|AuthenticationAgent" | tail -30
