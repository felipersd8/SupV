#!/usr/bin/env bash
# Instala o Sup V para o usuário atual (sem root).
# Suporta GNOME Shell (extensão) e Cinnamon Desktop (applet).
set -euo pipefail

UUID="supv@felipersd8.github.io"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-auto}"

detect_target() {
    local current="${XDG_CURRENT_DESKTOP:-${DESKTOP_SESSION:-}}"
    current="$(echo "$current" | tr '[:upper:]' '[:lower:]')"
    if [[ "$current" == *"cinnamon"* ]]; then
        echo "cinnamon"
    elif [[ "$current" == *"gnome"* ]]; then
        echo "gnome"
    elif command -v cinnamon >/dev/null 2>&1; then
        echo "cinnamon"
    elif command -v gnome-shell >/dev/null 2>&1; then
        echo "gnome"
    else
        echo "gnome"
    fi
}

install_gnome() {
    local src="$HERE/src"
    local dest="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

    if [ ! -f "$src/metadata.json" ]; then
        echo "erro: $src/metadata.json não encontrado" >&2
        return 1
    fi

    if ! command -v glib-compile-schemas >/dev/null; then
        echo "erro: glib-compile-schemas não encontrado (sudo apt install libglib2.0-bin)" >&2
        return 1
    fi

    echo "==> Instalando extensão GNOME Shell em $dest"
    rm -rf "$dest"
    mkdir -p "$dest"
    cp -r "$src"/. "$dest"/
    glib-compile-schemas "$dest/schemas/"

    # Ativação automática no primeiro login
    local auto_dir="${XDG_DATA_HOME:-$HOME/.local/share}/supv"
    local autostart="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
    mkdir -p "$auto_dir" "$autostart"
    install -m 0755 "$HERE/packaging/supv-autoenable.sh" "$auto_dir/autoenable"
    sed "s|@AUTOENABLE@|$auto_dir/autoenable|" "$HERE/packaging/supv-autoenable.desktop" > "$autostart/supv-autoenable.desktop"
    rm -f "${XDG_CONFIG_HOME:-$HOME/.config}/supv/auto-enabled"

    if command -v gnome-extensions >/dev/null; then
        gnome-extensions enable "$UUID" 2>/dev/null || true
    fi

    cat <<MSG

GNOME Shell: instalado com sucesso.
- Wayland: faça logout/login para o GNOME Shell carregar.
- X11: Alt+F2 -> digite 'r' e Enter.
- Atalho: Super+V
MSG
}

install_cinnamon() {
    local src="$HERE/cinnamon"
    local dest="${XDG_DATA_HOME:-$HOME/.local/share}/cinnamon/applets/$UUID"

    if [ ! -f "$src/metadata.json" ]; then
        echo "erro: $src/metadata.json não encontrado" >&2
        return 1
    fi

    echo "==> Instalando applet Cinnamon em $dest"
    rm -rf "$dest"
    mkdir -p "$dest"
    cp -r "$src"/. "$dest"/

    # Ativação automática no Cinnamon (se gsettings disponível)
    if command -v gsettings >/dev/null 2>&1; then
        python3 -c "
import ast, subprocess
try:
    raw = subprocess.check_output(['gsettings', 'get', 'org.cinnamon', 'enabled-applets'], text=True).strip()
    applets = ast.literal_eval(raw)
    uuid = '$UUID'
    if not any(uuid in a for a in applets):
        max_id = max([int(a.split(':')[-1]) for a in applets if a.split(':')[-1].isdigit()] or [0])
        applets.append(f'panel1:right:3:{uuid}:{max_id + 1}')
        subprocess.check_call(['gsettings', 'set', 'org.cinnamon', 'enabled-applets', str(applets)])
        print('Sup V adicionado ao painel do Cinnamon.')
    else:
        print('Sup V já está ativado no painel do Cinnamon.')
except Exception as e:
    print('Aviso: não foi possível registrar no painel automaticamente:', e)
" || true
    fi

    cat <<MSG

Cinnamon: instalado com sucesso em $dest.
- Se necessário recarregar o painel: Alt+F2 -> digite 'r' e Enter (ou reinicie o Cinnamon).
- Atalho global: Super+V
MSG
}

case "$TARGET" in
    --gnome|gnome)
        install_gnome
        ;;
    --cinnamon|cinnamon)
        install_cinnamon
        ;;
    --all|all)
        install_gnome
        install_cinnamon
        ;;
    auto)
        detected="$(detect_target)"
        echo "Ambiente detectado: $detected"
        if [ "$detected" = "cinnamon" ]; then
            install_cinnamon
        else
            install_gnome
        fi
        ;;
    *)
        echo "Uso: $0 [auto|--gnome|--cinnamon|--all]" >&2
        exit 1
        ;;
esac
