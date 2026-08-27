UUID    := supv@felipersd8.github.io
VERSION := $(shell sed -n 's/.*"version-name": *"\([^"]*\)".*/\1/p' src/metadata.json)
DIST    := dist

.PHONY: all zip tarball deb install uninstall check test clean

all: check zip tarball deb   ## gera os 3 artefatos em dist/

zip:            ## dist/supv@felipersd8.github.io.shell-extension.zip (gnome-extensions pack)
	packaging/build-zip.sh

tarball:        ## dist/supv-<versão>.tar.gz (código-fonte)
	packaging/build-tarball.sh

deb:            ## dist/supv_<versão>_all.deb (dpkg-deb)
	packaging/build-deb.sh

install:        ## instala em ~/.local/share/gnome-shell/extensions (sem root)
	./install.sh

uninstall:
	./uninstall.sh

check:          ## valida schema e sintaxe JS
	glib-compile-schemas --strict --dry-run src/schemas/
	@if command -v node >/dev/null 2>&1; then for f in src/*.js; do node --check $$f || exit 1; done; fi
	@echo "check ok (supv $(VERSION))"

test:           ## reinicia a sessão headless e roda o smoke test
	tools/devkit-restart.sh
	tools/smoke-test.sh

clean:
	rm -rf $(DIST) build src/schemas/gschemas.compiled
