#!/usr/bin/env bash
# Sessão aninhada/headless do GNOME Shell para iterar sem logout (monitor virtual 1280x800,
# WAYLAND_DISPLAY=supv-nested para rodar apps dentro dela):
#   - bus de sessão isolado (dbus-run-session)
#   - GSettings isolado (backend keyfile em $STATE/config) → só a supv@felipersd8.github.io fica habilitada
#   - --unsafe-mode → permite org.gnome.Shell.Eval para testes automatizados (tools/eval.sh)
# Uso: tools/devkit.sh [args extras do gnome-shell]
set -euo pipefail

STATE="${XDG_RUNTIME_DIR:-/tmp}/supv-devkit"
mkdir -p "$STATE/config" "$STATE/cache" "$STATE/data"
export STATE
export GSETTINGS_BACKEND=keyfile
export XDG_CONFIG_HOME="$STATE/config"
export XDG_CACHE_HOME="$STATE/cache"
export XDG_DATA_HOME="$STATE/data"        # extensão instalada em $STATE/data/gnome-shell/extensions (isolada da real)

gsettings set org.gnome.shell enabled-extensions "['supv@felipersd8.github.io']"
gsettings set org.gnome.shell disable-user-extensions false

exec dbus-run-session -- bash -c '
  echo "$DBUS_SESSION_BUS_ADDRESS" > "$STATE/bus"
  echo $$ > "$STATE/shell.pid"
  exec gnome-shell --headless --no-x11 --virtual-monitor 1280x800 --wayland-display supv-nested --unsafe-mode "$@"
' _ "$@"
