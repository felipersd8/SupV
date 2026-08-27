# WinV — histórico da área de transferência estilo Win+V para o GNOME Shell

Extensão do GNOME Shell que replica a experiência do **Win+V** do Windows 10/11 no
Ubuntu/GNOME: `Super+V` abre um painel perto do mouse com os últimos itens copiados
(texto e imagens); `Enter` ou clique **cola direto** no aplicativo que estava com foco.
Roda dentro do próprio shell — não é um app separado (CopyQ, Diodon, GPaste…).

Testado em **Ubuntu 26.04 / GNOME Shell 50.1 (Wayland)**. Declarado compatível com
GNOME 46–50 (`shell-version` no `metadata.json`).

## Instalação

Baixe os arquivos prontos na página de releases:
**https://github.com/felipersd8/winv/releases** — `winv_1.0.0_all.deb`,
`winv@local.shell-extension.zip` e `winv-1.0.0.tar.gz`. Ou gere você mesmo com `make all`
(saída em `dist/`).

> **apt-get / snap:** não há (ainda) repositório APT/PPA — `apt-get install winv` não
> funciona; instale o `.deb` baixado com `apt install ./arquivo.deb` (o próprio `apt`
> resolve as dependências). Snap não é possível para extensões do GNOME Shell (veja abaixo).

### Pacote .deb (recomendado no Ubuntu/Debian)

```bash
sudo apt install ./winv_1.0.0_all.deb
# depois: logout/login (Wayland) ou Alt+F2 → r → Enter (X11)
gnome-extensions enable winv@local
```

Instala em `/usr/share/gnome-shell/extensions/winv@local/` e o schema em
`/usr/share/glib-2.0/schemas/`. Remoção: `sudo apt remove winv` (veja
[Desinstalação](#desinstalação) sobre o atalho das notificações).

> Se você já tinha instalado com `install.sh`/zip, rode `./uninstall.sh` antes: a cópia em
> `~/.local/share/gnome-shell/extensions/` tem precedência sobre a do sistema.

### Zip (instalação manual, qualquer distro)

```bash
gnome-extensions install --force dist/winv@local.shell-extension.zip
# logout/login (Wayland) ou Alt+F2 → r (X11)
gnome-extensions enable winv@local
```

### A partir do código-fonte (sem root)

```bash
./install.sh          # copia para ~/.local/share/gnome-shell/extensions/winv@local e compila o schema
# logout/login (Wayland) ou Alt+F2 → r (X11)
gnome-extensions enable winv@local
```

> **Wayland exige logout/login** para o GNOME Shell carregar uma extensão nova ou
> atualizada. No X11 basta reiniciar o shell com `Alt+F2`, `r`, `Enter`.

### Snap

Não existe versão snap e não haverá: extensões do GNOME Shell rodam **dentro do processo
do shell** e não podem ser confinadas — o formato snap não se aplica.

## Uso

| Ação | Atalho |
|---|---|
| Abrir / fechar o painel | `Super+V` (configurável) — `Esc` ou clique fora também fecham |
| Colar o item selecionado | `Enter` ou clique |
| Só copiar (sem colar) | `Shift+Enter` ou clique com o botão do meio |
| Navegar | `↑` `↓` `Home` `End` `PageUp` `PageDown` (`Tab`/`Shift+Tab` também) |
| Fixar / desafixar | `Ctrl+P` ou o ícone de alfinete (aparece ao passar o mouse) |
| Excluir item | `Delete` ou o `×` do card |
| Limpar tudo (mantém fixados) | `Ctrl+Shift+Delete` ou o botão **Limpar tudo** |
| Filtrar | digite qualquer texto; `Backspace` apaga, `Ctrl+Backspace` limpa o filtro |

Comportamento igual ao Windows:

- Ordem cronológica inversa; **itens fixados ficam no topo**, sobrevivem ao "Limpar tudo",
  à rotação do histórico e a logout/login.
- Copiar algo que já está no histórico move o item para o topo (sem duplicar).
- Ao colar, o foco continua no mesmo campo de texto em que você estava.
- Em terminais (GNOME Terminal, Ptyxis, Kitty, Alacritty, WezTerm, Konsole, Tilix, foot…)
  a extensão usa `Ctrl+Shift+V` em vez de `Ctrl+V` (configurável).
- Limites padrão: 50 itens não fixados; 1 MB por texto; 10 MB por imagem.
- Só a seleção **CLIPBOARD** é observada (Ctrl+C); seleção com o mouse (PRIMARY) é ignorada.
- Conteúdo de gerenciadores de senha (mimetype `x-kde-passwordManagerHint` /
  `application/x-password-manager`) e clipboard vazio são ignorados.

O painel abre perto do ponteiro do mouse (o GNOME não expõe a posição do cursor de
texto), sempre dentro da área de trabalho do monitor, com o primeiro item já selecionado.

### Preferências

`gnome-extensions prefs winv@local` (ou pelo app **Extensões**):

- Tamanho máximo do histórico
- Atalho (padrão `Super+V`)
- Persistir em disco (desligado = histórico some ao sair)
- Colar automaticamente ao selecionar
- Usar `Ctrl+Shift+V` em terminais
- Mostrar ícone na barra superior (desligado por padrão — o Windows não tem)
- Limpar histórico agora
- Avançado: atraso antes de colar (ms), limites de tamanho de texto/imagem

### Onde fica o histórico

- `~/.cache/winv/history.json` — textos e metadados
- `~/.cache/winv/img/<sha256>.png` — imagens

A gravação é *debounced* (não grava a cada `Ctrl+C`) e atômica (arquivo temporário +
rename). Com "Persistir em disco" desligado, nada fica em disco entre sessões.

## O atalho Super+V e as notificações do GNOME

O GNOME usa `Super+V` **e** `Super+M` para abrir a lista de notificações
(`org.gnome.shell.keybindings toggle-message-tray`). Nem o `install.sh` nem o pacote
mexem nas suas configurações. Quem faz isso é a própria extensão, **na primeira ativação**:

1. lê o valor atual de `toggle-message-tray` (normalmente `['<Super>v', '<Super>m']`);
2. guarda-o na própria configuração (`saved-message-tray-binding`);
3. remove só a combinação conflitante → fica `['<Super>m']`.

**As notificações continuam em `Super+M`.** Ao desativar a extensão (`gnome-extensions
disable winv@local`, ou ao bloquear a tela, quando o GNOME desativa extensões) o valor
original é restaurado. Se você trocar o atalho da extensão nas preferências, a mesma
lógica é reaplicada.

## Desinstalação

```bash
# 1) desative primeiro — o disable() restaura o Super+V das notificações
gnome-extensions disable winv@local

# 2a) instalação pelo .deb
sudo apt remove winv          # ou: sudo apt purge winv

# 2b) instalação por install.sh ou zip
./uninstall.sh                # --purge apaga também ~/.cache/winv e as configurações
# ou: gnome-extensions uninstall winv@local
```

Se removeu sem desativar antes e o `Super+V` das notificações não voltou:

```bash
gsettings reset org.gnome.shell.keybindings toggle-message-tray
```

## Solução de problemas

- **"A extensão winv@local não existe"** logo após instalar: o shell ainda não recarregou.
  Faça logout/login (Wayland) ou `Alt+F2` → `r` (X11).
- **Logs**: `journalctl --user -f -o cat -u 'org.gnome.Shell@*.service'` (Ubuntu) ou
  `journalctl -f -o cat /usr/bin/gnome-shell`. Mensagens da extensão começam com `[winv]`.
- **Enter não cola**: aumente "Atraso antes de colar" nas preferências (padrão 100 ms).
  Alguns apps demoram para recuperar o foco. Verifique também se o app é um terminal
  (usa `Ctrl+Shift+V`).
- **Colou no lugar errado**: o painel devolve o foco para a janela que o tinha antes de
  abrir. Se você clicou em outra janela com o painel aberto, ele fecha sem colar.
- **Super+V abre notificações em vez do painel**: a extensão não está ativa
  (`gnome-extensions info winv@local`).
- **Looking Glass** (`Alt+F2` → `lg`) mostra erros de extensões na aba *Extensions*.

## Desenvolvimento

```bash
make check           # schema + sintaxe
make install         # instala no usuário
make zip deb tarball # artefatos em dist/
make test            # sessão headless + smoke test (veja abaixo)
```

Iteração sem logout: `tools/devkit.sh` sobe um GNOME Shell **headless** com monitor
virtual (1280×800), GSettings isolado (backend keyfile) e só a `winv@local` habilitada,
em `--unsafe-mode` para permitir `org.gnome.Shell.Eval`:

```bash
tools/devkit-restart.sh                # reinstala + reinicia a sessão headless
tools/eval.sh 'Main.notify("oi")'      # roda JS dentro dela
tools/shot.sh /tmp/tela.png            # screenshot da sessão headless
tools/nested-run.sh gnome-text-editor --ignore-session   # abre um app lá dentro
tools/nested-kill.sh                   # encerra só os apps abertos por nested-run.sh
tools/smoke-test.sh                    # bateria automatizada (teclado virtual)
```

Estrutura:

```
src/           extension.js, panel.js, history.js, clipboardMonitor.js, paster.js, prefs.js,
               stylesheet.css, metadata.json, schemas/
packaging/     build-zip.sh, build-deb.sh, build-tarball.sh
debian/        control, postinst, postrm, copyright, changelog (usados pelo build-deb.sh)
tools/         sessão headless de teste
install.sh / uninstall.sh
```

### Notas técnicas

- Detecção de cópia sem polling: `global.display.get_selection()` → sinal `owner-changed`
  (`Meta.SelectionType.SELECTION_CLIPBOARD`), leitura com `St.Clipboard`.
- Colar: `Clutter.VirtualInputDevice` do próprio Mutter (funciona em Wayland e X11, sem
  xdotool/ydotool).
- Painel: `Main.layoutManager.addTopChrome` + `Main.pushModal`; CSS reaproveita as classes
  do tema do shell (`popup-menu-content`, `popup-menu-item`) para seguir tema claro/escuro.
- `disable()` desfaz tudo: sinais, keybinding, atores, timeouts, dispositivo virtual e o
  binding das notificações.
- GNOME 50 removeu `gnome-shell --nested` (substituído por `--headless --virtual-monitor`),
  `Clutter.GrabState` e `Clutter.get_default_backend()`; o código trata as duas gerações.

## Licença

GPL-3.0-or-later. Veja `LICENSE`.
