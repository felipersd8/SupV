#!/usr/bin/env bash
# Sessão aninhada/headless do GNOME Shell para iterar sem logout (monitor virtual 1280x800,
# WAYLAND_DISPLAY=winv-nested para rodar apps dentro dela):
#   - bus de sessão isolado (dbus-run-session)
#   - GSettings isolado (backend keyfile em $STATE/config) → só a winv@local fica habilitada
#   - --unsafe-mode → permite org.gnome.Shell.Eval para testes automatizados (tools/eval.sh)
# Uso: tools/devkit.sh [args extras do gnome-shell]
set -euo pipefail

STATE="${XDG_RUNTIME_DIR:-/tmp}/winv-devkit"
mkdir -p "$STATE/config" "$STATE/cache"
export STATE
export GSETTINGS_BACKEND=keyfile
export XDG_CONFIG_HOME="$STATE/config"
export XDG_CACHE_HOME="$STATE/cache"      # histórico do devkit fica separado do real (~/.cache/winv)

gsettings set org.gnome.shell enabled-extensions "['winv@local']"
gsettings set org.gnome.shell disable-user-extensions false

exec dbus-run-session -- bash -c '
  echo "$DBUS_SESSION_BUS_ADDRESS" > "$STATE/bus"
  echo $$ > "$STATE/shell.pid"
  exec gnome-shell --headless --no-x11 --virtual-monitor 1280x800 --wayland-display winv-nested --unsafe-mode "$@"
' _ "$@"
