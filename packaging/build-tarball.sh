#!/usr/bin/env bash
# Gera dist/winv-<versão>.tar.gz com o código-fonte completo (sem dist/, build/, .git).
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"
mkdir -p "$DIST"
OUT="$DIST/$PKG-$VERSION.tar.gz"
if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1 && [ -z "$(git -C "$ROOT" status --porcelain)" ]; then
    git -C "$ROOT" archive --format=tar.gz --prefix="$PKG-$VERSION/" -o "$OUT" HEAD
else
    echo "aviso: sem git ou com alterações não commitadas — empacotando a árvore de trabalho" >&2
    base="$(basename "$ROOT")"
    tar -C "$ROOT/.." \
        --exclude="$base/dist" --exclude="$base/build" --exclude="$base/.git" \
        --exclude="node_modules" --exclude="*.compiled" \
        --transform "s,^$base,$PKG-$VERSION," -czf "$OUT" "$base"
fi
echo "gerado: $OUT"
tar -tzf "$OUT" | head -40
