#!/usr/bin/env bash
# Instala a extensão WinV para o usuário atual (sem root) em
# ~/.local/share/gnome-shell/extensions/winv@local
set -euo pipefail

UUID="winv@local"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/src"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

if [ ! -f "$SRC/metadata.json" ]; then
    echo "erro: $SRC/metadata.json não encontrado" >&2
    exit 1
fi

if ! command -v glib-compile-schemas >/dev/null; then
    echo "erro: glib-compile-schemas não encontrado (sudo apt install libglib2.0-bin)" >&2
    exit 1
fi

echo "Instalando em $DEST"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -r "$SRC"/. "$DEST"/
glib-compile-schemas "$DEST/schemas/"

if command -v gnome-extensions >/dev/null; then
    gnome-extensions enable "$UUID" 2>/dev/null || true
fi

cat <<MSG

Instalado.

Wayland:  faça logout/login para o GNOME Shell carregar a extensão.
X11:      Alt+F2, digite  r  e Enter.
Depois:   gnome-extensions enable $UUID   (se ainda não estiver ativa)
Prefs:    gnome-extensions prefs $UUID

Nota: na primeira ativação a extensão remove <Super>v de
org.gnome.shell.keybindings toggle-message-tray (as notificações continuam em Super+M)
e restaura o valor original ao ser desativada.
MSG
