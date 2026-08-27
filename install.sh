#!/usr/bin/env bash
# Instala a extensão Sup V para o usuário atual (sem root) em
# ~/.local/share/gnome-shell/extensions/supv@felipersd8.github.io
set -euo pipefail

UUID="supv@felipersd8.github.io"
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

# Ativação automática no primeiro login (o shell só enxerga extensões novas após relogin)
AUTO_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/supv"
AUTOSTART="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
mkdir -p "$AUTO_DIR" "$AUTOSTART"
install -m 0755 "$HERE/packaging/supv-autoenable.sh" "$AUTO_DIR/autoenable"
sed "s|@AUTOENABLE@|$AUTO_DIR/autoenable|" "$HERE/packaging/supv-autoenable.desktop" > "$AUTOSTART/supv-autoenable.desktop"
rm -f "${XDG_CONFIG_HOME:-$HOME/.config}/supv/auto-enabled"

# Se o shell já conhece a extensão (reinstalação), ativa agora mesmo.
if command -v gnome-extensions >/dev/null; then
    gnome-extensions enable "$UUID" 2>/dev/null || true
fi

cat <<MSG

Instalado.

Wayland:  faça logout/login para o GNOME Shell carregar a extensão.
X11:      Alt+F2, digite  r  e Enter.
No próximo login o Sup V é ativado automaticamente (uma vez; se você desativar
depois, ele respeita). Manual: gnome-extensions enable $UUID
Prefs:    gnome-extensions prefs $UUID

Nota: na primeira ativação a extensão remove <Super>v de
org.gnome.shell.keybindings toggle-message-tray (as notificações continuam em Super+M)
e restaura o valor original ao ser desativada.
MSG
