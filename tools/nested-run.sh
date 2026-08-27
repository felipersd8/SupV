#!/usr/bin/env bash
# Executa um app dentro da sessão aninhada (WAYLAND_DISPLAY=winv-nested + bus isolado).
# Uso: tools/nested-run.sh gnome-text-editor
set -euo pipefail
STATE="${XDG_RUNTIME_DIR:-/tmp}/winv-devkit"
export DBUS_SESSION_BUS_ADDRESS="$(cat "$STATE/bus")"
export WAYLAND_DISPLAY=winv-nested
export GDK_BACKEND=wayland
export XDG_CONFIG_HOME="$STATE/config"
export XDG_CACHE_HOME="$STATE/cache"
export XDG_DATA_HOME="$STATE/data"
export XDG_STATE_HOME="$STATE/state"
mkdir -p "$XDG_DATA_HOME" "$XDG_STATE_HOME"
export GSETTINGS_BACKEND=keyfile
unset DISPLAY
exec "$@"
