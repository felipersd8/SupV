#!/usr/bin/env bash
# Reinstala a extensão no usuário e reinicia o shell aninhado (devkit).
# Espera o Eval responder e imprime estado + mensagens da winv.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="${XDG_RUNTIME_DIR:-/tmp}/winv-devkit"
LOG="${DEVKIT_LOG:-$STATE/devkit.log}"

"$HERE/install.sh" >/dev/null

pkill -x dbus-run-session 2>/dev/null
for _ in 1 2 3 4 5; do pgrep -f -x 'gnome-shell --headless --no-x11 --virtual-monitor 1280x800 --wayland-display winv-nested --unsafe-mode' >/dev/null || break; sleep 1; done
pkill -f -x 'gnome-shell --headless --no-x11 --virtual-monitor 1280x800 --wayland-display winv-nested --unsafe-mode' 2>/dev/null
sleep 1
nohup "$HERE/tools/devkit.sh" > "$LOG" 2>&1 &
for i in $(seq 1 40); do
    sleep 1
    if "$HERE/tools/eval.sh" 'true' >/dev/null 2>&1; then
        break
    fi
done
sleep 2
echo "== estado das extensões"
"$HERE/tools/eval.sh" 'JSON.stringify([...Main.extensionManager._extensions].filter(([k])=>k.startsWith("winv")).map(([k,v])=>[k,v.state,String(v.error||"")]))'
echo "== log (winv / erros)"
grep -iE "winv|JS ERROR|CRITICAL|WARNING" "$LOG" | grep -v "NM.Object\|AuthenticationAgent" | tail -30
