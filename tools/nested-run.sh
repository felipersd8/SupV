#!/usr/bin/env bash
# Executa um app dentro da sessão aninhada (WAYLAND_DISPLAY=supv-nested + bus isolado).
# Uso: tools/nested-run.sh gnome-text-editor --ignore-session
#
# REGRAS:
#  - O PID é gravado em $STATE/pids. Para encerrar use tools/nested-kill.sh (mata SÓ esses PIDs).
#  - NUNCA mate por nome (pkill/killall): apps de instância única como o Ptyxis são o
#    terminal real do usuário — matar pelo nome derruba a sessão do Claude.
#  - Ptyxis é recusado aqui pelo mesmo motivo.
set -euo pipefail
STATE="${XDG_RUNTIME_DIR:-/tmp}/supv-devkit"
case "${1:-}" in
    ""|-h|--help) echo "uso: $0 <comando> [args]" >&2; exit 2 ;;
    ptyxis|*/ptyxis) echo "recusado: ptyxis é o terminal do usuário (instância única). Use outro app." >&2; exit 3 ;;
esac
export DBUS_SESSION_BUS_ADDRESS="$(cat "$STATE/bus")"
export WAYLAND_DISPLAY=supv-nested
export GDK_BACKEND=wayland
export XDG_CONFIG_HOME="$STATE/config"
export XDG_CACHE_HOME="$STATE/cache"
export XDG_DATA_HOME="$STATE/data"
export XDG_STATE_HOME="$STATE/state"
export GSETTINGS_BACKEND=keyfile
mkdir -p "$XDG_DATA_HOME" "$XDG_STATE_HOME"
unset DISPLAY
"$@" &
pid=$!
echo "$pid" >> "$STATE/pids"
echo "nested pid $pid: $*"
wait "$pid"
