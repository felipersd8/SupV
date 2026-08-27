# Desenvolvimento e testes

## Instalar a partir do código

```bash
make check      # glib-compile-schemas --strict + node --check
make install    # ./install.sh → ~/.local/share/gnome-shell/extensions/supv@felipersd8.github.io
```

No Wayland o GNOME Shell só carrega (ou recarrega) uma extensão no login. Para iterar sem
logout use a sessão headless abaixo.

## Sessão headless (iteração sem logout)

`tools/devkit.sh` sobe um segundo GNOME Shell **headless** com monitor virtual 1280×800,
bus de sessão isolado (`dbus-run-session`), GSettings isolado (backend `keyfile`, em
`$XDG_RUNTIME_DIR/supv-devkit/config`) e só o Sup V habilitado, em `--unsafe-mode` para
permitir `org.gnome.Shell.Eval`.

```bash
tools/devkit-restart.sh          # reinstala a extensão e (re)inicia a sessão headless
tools/eval.sh 'Main.notify("oi")'                  # executa JS dentro dela (devolve JSON)
tools/eval.sh - < arquivo.js                       # idem, lendo da entrada padrão
tools/shot.sh /tmp/tela.png                        # screenshot da sessão headless
tools/nested-run.sh gnome-text-editor --ignore-session   # abre um app lá dentro
tools/nested-kill.sh                               # encerra só os apps abertos acima
tools/smoke-test.sh                                # bateria automatizada
```

Módulos ES não recarregam: **toda mudança de código exige `tools/devkit-restart.sh`**.

Atalhos úteis dentro do `eval.sh`:

```js
const ext = Main.extensionManager.lookup('supv@felipersd8.github.io').stateObj;
ext._history.items                       // itens
ext._panel.open(); ext._panel.close();   // painel
imports.gi.St.Clipboard.get_default().set_text(imports.gi.St.ClipboardType.CLIPBOARD, 'x');
```

`tools/kb.js` cria `globalThis.__supvKb` — um teclado virtual dentro da sessão headless
(`__supvKb.tap([__supvKb.K.KEY_Super_L, __supvKb.K.KEY_v])`, `__supvKb.type('abc')`). Os
eventos são assíncronos: leia o estado numa chamada seguinte, não na mesma.

### Regras da sessão headless

- **Nunca mate processos pelo nome** (`pkill -x/-f`, `killall`). Os scripts gravam PIDs em
  `$XDG_RUNTIME_DIR/supv-devkit/` e matam só esses. Apps de instância única (Ptyxis,
  gnome-text-editor) são os mesmos do usuário — matar pelo nome derruba a sessão real.
- `nested-run.sh` recusa `ptyxis` pelo mesmo motivo. Para testar colar em terminal use
  outro emulador (ex.: `foot`) ou teste na sessão real.
- Use `--ignore-session`/equivalente em apps que restauram sessão, ou eles abrem seus
  documentos reais dentro da sessão de teste.

## Smoke test

`tools/smoke-test.sh` roda ~40 verificações contra a sessão headless: dedupe, abertura
por `Super+V`, seleção inicial, navegação, filtro, fixar/excluir/limpar, `Esc`/foco, cópia
sem colar, imagem + miniatura + dimensões, 10 ciclos enable/disable sem vazar atores,
remoção e restauração do binding das notificações, e ausência de `JS ERROR`/`CRITICAL`
no log. `make test` = restart + smoke test.

O que o smoke test **não** cobre e precisa de teste manual na sessão real: colar em apps
reais (GTK, Electron, Firefox, terminais), tema do shell do usuário, comportamento com
vários monitores/escalas, bloqueio de tela.

## Logs

```bash
journalctl --user -f -o cat -u 'org.gnome.Shell@*.service' | grep -iE "supv|JS ERROR"
```

Looking Glass (`Alt+F2` → `lg`) mostra erros por extensão na aba *Extensions*.

## Empacotamento

```bash
make zip        # dist/supv@felipersd8.github.io.shell-extension.zip (gnome-extensions pack; fallback: zip)
make deb        # dist/supv_<versão>_all.deb (dpkg-deb --root-owner-group)
make tarball    # dist/supv-<versão>.tar.gz (git archive; exige árvore limpa)
make all        # os três
```

- O `.deb` instala em `/usr/share/gnome-shell/extensions/<uuid>/` **sem** `schemas/`; o
  schema vai para `/usr/share/glib-2.0/schemas/` e é compilado no `postinst`. Isso é
  necessário porque `getSettings()` prefere um `schemas/gschemas.compiled` local se o
  diretório existir.
- Para testar o layout do `.deb` sem root: extraia com `dpkg-deb -x`, compile o schema
  extraído e rode a sessão headless com
  `XDG_DATA_DIRS=<extraído>/usr/share:$XDG_DATA_DIRS GSETTINGS_SCHEMA_DIR=<extraído>/usr/share/glib-2.0/schemas tools/devkit.sh`
  (mova a cópia de `~/.local/share/gnome-shell/extensions` para fora antes — ela tem
  precedência).
- `lintian dist/*.deb` se estiver instalado.

## Estrutura do repositório

```
src/            código da extensão
packaging/      build-zip.sh, build-deb.sh, build-tarball.sh, common.sh
debian/         control, postinst, postrm, copyright, changelog (usados pelo build-deb.sh)
tools/          sessão headless, eval, screenshot, teclado virtual, smoke test
docs/           esta documentação
Public/         logo e screenshots usados no README
install.sh      instalação no usuário (sem root)
uninstall.sh    remoção + restauração do atalho das notificações
Makefile
```
