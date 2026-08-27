# Variáveis comuns dos scripts de empacotamento (source este arquivo).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="supv@felipersd8.github.io"
PKG="supv"
VERSION="$(sed -n 's/.*"version-name": *"\([^"]*\)".*/\1/p' "$ROOT/src/metadata.json")"
DIST="$ROOT/dist"
[ -n "$VERSION" ] || { echo "erro: version-name não encontrado em src/metadata.json" >&2; exit 1; }
