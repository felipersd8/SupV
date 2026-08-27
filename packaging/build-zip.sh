#!/usr/bin/env bash
# Gera dist/supv@felipersd8.github.io.shell-extension.zip com `gnome-extensions pack`
# (formato aceito por `gnome-extensions install` e pelo site extensions.gnome.org).
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"
mkdir -p "$DIST"
rm -f "$ROOT/src/schemas/gschemas.compiled"
OUT="$DIST/$UUID.shell-extension.zip"
if command -v gnome-extensions >/dev/null 2>&1; then
    gnome-extensions pack "$ROOT/src" --force --out-dir "$DIST" \
        --extra-source=clipboardMonitor.js \
        --extra-source=history.js \
        --extra-source=panel.js \
        --extra-source=paster.js \
        --extra-source=icons \
        --schema="$ROOT/src/schemas/org.gnome.shell.extensions.supv.gschema.xml"
else
    # Sem gnome-shell instalado (ex.: CI): o formato é um zip simples com os arquivos na raiz.
    echo "aviso: gnome-extensions não encontrado — gerando o zip com 'zip'" >&2
    rm -f "$OUT"
    (cd "$ROOT/src" && zip -q -r "$OUT" metadata.json extension.js prefs.js stylesheet.css \
        clipboardMonitor.js history.js panel.js paster.js icons \
        schemas/org.gnome.shell.extensions.supv.gschema.xml)
fi
echo "gerado: $DIST/$UUID.shell-extension.zip"
unzip -l "$DIST/$UUID.shell-extension.zip" | awk 'NR>3 && $4 {print "  " $4}'
