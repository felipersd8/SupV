#!/bin/sh
# Ativa o Sup V automaticamente no primeiro login após a instalação.
# Executado pelo autostart (/etc/xdg/autostart ou ~/.config/autostart).
#
# - Roda uma vez por usuário: grava um marcador em ~/.config/supv/auto-enabled.
# - Se o usuário desativar a extensão depois, não reativa (o marcador impede).
# - Espera o GNOME Shell terminar de carregar as extensões (até ~60 s).
UUID="supv@felipersd8.github.io"
MARKER="${XDG_CONFIG_HOME:-$HOME/.config}/supv/auto-enabled"

[ -e "$MARKER" ] && exit 0
command -v gnome-extensions >/dev/null 2>&1 || exit 0

i=0
while [ $i -lt 60 ]; do
    if gnome-extensions info "$UUID" >/dev/null 2>&1; then
        if gnome-extensions enable "$UUID" >/dev/null 2>&1; then
            mkdir -p "$(dirname "$MARKER")"
            date -Is > "$MARKER"
            echo "supv: extensão ativada automaticamente" >&2
        fi
        exit 0
    fi
    i=$((i + 1))
    sleep 1
done
exit 0
