#!/usr/bin/env bash
# Gera dist/winv@local.shell-extension.zip com `gnome-extensions pack`
# (formato aceito por `gnome-extensions install` e pelo site extensions.gnome.org).
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"
mkdir -p "$DIST"
rm -f "$ROOT/src/schemas/gschemas.compiled"
gnome-extensions pack "$ROOT/src" --force --out-dir "$DIST" \
    --extra-source=clipboardMonitor.js \
    --extra-source=history.js \
    --extra-source=panel.js \
    --extra-source=paster.js \
    --schema="$ROOT/src/schemas/org.gnome.shell.extensions.winv.gschema.xml"
echo "gerado: $DIST/$UUID.shell-extension.zip"
unzip -l "$DIST/$UUID.shell-extension.zip" | awk 'NR>3 && $4 {print "  " $4}'
