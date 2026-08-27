#!/usr/bin/env bash
# Remove a instalação do usuário (~/.local/share/gnome-shell/extensions/winv@local)
# e restaura o atalho Super+V das notificações, se a extensão o tinha alterado.
set -euo pipefail

UUID="winv@local"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"
SCHEMA_DIR="$DEST/schemas"
SCHEMA="org.gnome.shell.extensions.winv"

# Desativa primeiro — o disable() da extensão restaura o binding sozinho.
if command -v gnome-extensions >/dev/null; then
    gnome-extensions disable "$UUID" 2>/dev/null || true
fi

# Rede de segurança: se o shell não estava rodando / a extensão não restaurou,
# lemos o valor salvo direto do gsettings e restauramos.
if [ -f "$SCHEMA_DIR/gschemas.compiled" ]; then
    saved="$(GSETTINGS_SCHEMA_DIR="$SCHEMA_DIR" gsettings get "$SCHEMA" message-tray-binding-saved 2>/dev/null || echo false)"
    if [ "$saved" = "true" ]; then
        orig="$(GSETTINGS_SCHEMA_DIR="$SCHEMA_DIR" gsettings get "$SCHEMA" saved-message-tray-binding)"
        echo "Restaurando toggle-message-tray para $orig"
        gsettings set org.gnome.shell.keybindings toggle-message-tray "$orig"
        GSETTINGS_SCHEMA_DIR="$SCHEMA_DIR" gsettings set "$SCHEMA" message-tray-binding-saved false || true
    fi
fi

rm -rf "$DEST"
echo "Removido: $DEST"

if [ "${1:-}" = "--purge" ]; then
    rm -rf "$HOME/.cache/winv"
    dconf reset -f /org/gnome/shell/extensions/winv/ 2>/dev/null || true
    echo "Histórico (~/.cache/winv) e configurações apagados."
else
    echo "Histórico mantido em ~/.cache/winv (use --purge para apagar tudo)."
fi
echo "Faça logout/login (Wayland) ou Alt+F2 → r (X11) para o shell descarregar a extensão."
