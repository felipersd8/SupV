#!/usr/bin/env bash
# Remove a instalação do Sup V (GNOME Shell e/ou Cinnamon).
set -euo pipefail

UUID="supv@felipersd8.github.io"
GNOME_DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"
CINNAMON_DEST="${XDG_DATA_HOME:-$HOME/.local/share}/cinnamon/applets/$UUID"
SCHEMA_DIR="$GNOME_DEST/schemas"
SCHEMA="org.gnome.shell.extensions.supv"

# Desinstalação GNOME
if [ -d "$GNOME_DEST" ]; then
    echo "==> Removendo extensão GNOME Shell"
    if command -v gnome-extensions >/dev/null 2>&1; then
        gnome-extensions disable "$UUID" 2>/dev/null || true
    fi

    if [ -f "$SCHEMA_DIR/gschemas.compiled" ]; then
        saved="$(GSETTINGS_SCHEMA_DIR="$SCHEMA_DIR" gsettings get "$SCHEMA" message-tray-binding-saved 2>/dev/null || echo false)"
        if [ "$saved" = "true" ]; then
            orig="$(GSETTINGS_SCHEMA_DIR="$SCHEMA_DIR" gsettings get "$SCHEMA" saved-message-tray-binding)"
            echo "Restaurando toggle-message-tray para $orig"
            gsettings set org.gnome.shell.keybindings toggle-message-tray "$orig" 2>/dev/null || true
            GSETTINGS_SCHEMA_DIR="$SCHEMA_DIR" gsettings set "$SCHEMA" message-tray-binding-saved false 2>/dev/null || true
        fi
    fi

    rm -rf "$GNOME_DEST"
    rm -f "${XDG_CONFIG_HOME:-$HOME/.config}/autostart/supv-autoenable.desktop" \
          "${XDG_CONFIG_HOME:-$HOME/.config}/supv/auto-enabled"
    rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/supv"
    echo "Removido: $GNOME_DEST"
fi

# Desinstalação Cinnamon
if [ -d "$CINNAMON_DEST" ]; then
    echo "==> Removendo applet Cinnamon"
    if command -v gsettings >/dev/null 2>&1; then
        python3 -c "
import ast, subprocess
try:
    raw = subprocess.check_output(['gsettings', 'get', 'org.cinnamon', 'enabled-applets'], text=True).strip()
    applets = ast.literal_eval(raw)
    uuid = '$UUID'
    new_applets = [a for a in applets if uuid not in a]
    if len(new_applets) != len(applets):
        subprocess.check_call(['gsettings', 'set', 'org.cinnamon', 'enabled-applets', str(new_applets)])
        print('Removido do painel do Cinnamon.')
except Exception as e:
    pass
" || true
    fi
    rm -rf "$CINNAMON_DEST"
    echo "Removido: $CINNAMON_DEST"
fi

if [ "${1:-}" = "--purge" ]; then
    rm -rf "$HOME/.cache/supv"
    dconf reset -f /org/gnome/shell/extensions/supv/ 2>/dev/null || true
    echo "Histórico (~/.cache/supv) e configurações apagados."
else
    echo "Histórico mantido em ~/.cache/supv (use --purge para apagar tudo)."
fi

echo "Desinstalação concluída."
