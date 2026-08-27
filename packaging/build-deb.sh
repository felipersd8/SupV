#!/usr/bin/env bash
# Gera dist/supv_<versão>_all.deb com dpkg-deb (sem debhelper: simples e reproduzível).
#   /usr/share/gnome-shell/extensions/supv@felipersd8.github.io/   código da extensão
#   /usr/share/glib-2.0/schemas/                    schema (compilado no postinst)
#   /usr/share/doc/supv/                            README, copyright, changelog
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"
ARCH=all
B="$ROOT/build/deb/${PKG}_${VERSION}_${ARCH}"
EXT="$B/usr/share/gnome-shell/extensions/$UUID"
rm -rf "$B"
mkdir -p "$B/DEBIAN" "$EXT" "$B/usr/share/glib-2.0/schemas" "$B/usr/share/doc/$PKG"

# Extensão — sem o diretório schemas/: no sistema o schema vive em /usr/share/glib-2.0/schemas
for f in metadata.json extension.js prefs.js clipboardMonitor.js history.js panel.js paster.js stylesheet.css; do
    install -m 0644 "$ROOT/src/$f" "$EXT/"
done
install -m 0644 "$ROOT/src/schemas/org.gnome.shell.extensions.supv.gschema.xml" "$B/usr/share/glib-2.0/schemas/"
install -d -m 0755 "$EXT/icons"
install -m 0644 "$ROOT/src/icons/supv.png" "$EXT/icons/"

# Documentação
install -m 0644 "$ROOT/README.md" "$B/usr/share/doc/$PKG/README.md"
install -m 0644 "$ROOT/debian/copyright" "$B/usr/share/doc/$PKG/copyright"
gzip -9n -c "$ROOT/debian/changelog" > "$B/usr/share/doc/$PKG/changelog.Debian.gz"
chmod 0644 "$B/usr/share/doc/$PKG/changelog.Debian.gz"

# Metadados
INSTALLED_SIZE="$(du -sk "$B/usr" | cut -f1)"
sed -e "s/@VERSION@/$VERSION/" -e "s/@INSTALLED_SIZE@/$INSTALLED_SIZE/" "$ROOT/debian/control" > "$B/DEBIAN/control"
install -m 0755 "$ROOT/debian/postinst" "$B/DEBIAN/postinst"
install -m 0755 "$ROOT/debian/postrm" "$B/DEBIAN/postrm"
(cd "$B" && find usr -type f -print0 | LC_ALL=C sort -z | xargs -0 md5sum > DEBIAN/md5sums)
chmod 0644 "$B/DEBIAN/md5sums" "$B/DEBIAN/control"
find "$B" -type d -exec chmod 0755 {} +

mkdir -p "$DIST"
OUT="$DIST/${PKG}_${VERSION}_${ARCH}.deb"
dpkg-deb --build --root-owner-group "$B" "$OUT" >/dev/null
echo "gerado: $OUT"
dpkg-deb --info "$OUT" | sed -n '1,12p'
dpkg-deb --contents "$OUT" | awk '{print "  " $6}'
if command -v lintian >/dev/null 2>&1; then
    echo "--- lintian"; lintian "$OUT" || true
else
    echo "(lintian não instalado — pulei a validação)"
fi
