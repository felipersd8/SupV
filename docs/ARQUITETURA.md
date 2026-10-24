# Arquitetura do Sup V

Sup V é uma extensão do GNOME Shell (ESM, GNOME 46–51). Todo o código roda **dentro do
processo do shell** (`gnome-shell`), o que permite observar a área de transferência sem
polling, mostrar o painel como parte do shell e injetar `Ctrl+V` no aplicativo com foco —
em Wayland e X11, sem `xdotool`/`ydotool`.

## Módulos

```
src/
├── extension.js        ciclo de vida (enable/disable), keybinding, integração dos módulos
├── clipboardMonitor.js observa a seleção CLIPBOARD via Meta.Selection e lê com St.Clipboard
├── history.js          modelo do histórico: dedupe, fixar, limites, persistência
├── panel.js            o popup (UI, posicionamento, teclado, filtro, miniaturas)
├── paster.js           injeção de Ctrl+V / Ctrl+Shift+V com Clutter.VirtualInputDevice
├── prefs.js            janela de preferências (libadwaita), roda em processo separado
├── stylesheet.css      layout; cores vêm das classes do tema do shell
├── metadata.json       uuid, versões suportadas, schema
├── schemas/            org.gnome.shell.extensions.supv.gschema.xml
└── icons/supv.png      logo usada nas preferências
```

## Fluxo de dados

```
 Ctrl+C em qualquer app
        │
        ▼
 Meta.Selection 'owner-changed' (SELECTION_CLIPBOARD)      ── clipboardMonitor.js
        │  get_mimetypes() → texto? imagem? senha? vazio?
        │  get_text() / get_content('image/png')
        ▼
 History.addText / addImage                                ── history.js
        │  sha256 → dedupe (sobe pro topo) · ordena (fixados > recentes) · trim
        │  emit('changed') · agenda gravação (debounce 1,5 s, escrita atômica)
        ▼
 ClipboardPanel (se aberto, reconstrói a lista)            ── panel.js
        │
 Super+V ─► panel.open(): addTopChrome + pushModal, posiciona no ponteiro
        │  ↑↓ Home End PgUp PgDn · letras filtram · Ctrl+P · Delete · Ctrl+Shift+Delete
        │  Enter / clique ─► emit('activate', item, paste=true)
        │  Shift+Enter / botão do meio ─► emit('activate', item, paste=false)
        ▼
 extension._onActivate                                     ── extension.js
        │  St.Clipboard.set_text / set_content('image/png')
        │  panel.close() → popModal → foco volta à janela anterior
        │  timeout(paste-delay-ms, padrão 100 ms)
        ▼
 Paster.paste()                                            ── paster.js
        janela com foco é terminal? → Ctrl+Shift+V : Ctrl+V
        VirtualInputDevice.notify_keyval(PRESSED…RELEASED)
```

## Ciclo de vida (`extension.js`)

`enable()` cria, nesta ordem: `Gio.Settings` da extensão e do shell, `History` (carrega
`history.json`), `Paster`, `ClipboardPanel`, `ClipboardMonitor`, remove o `<Super>v`
conflitante de `toggle-message-tray`, registra o keybinding `toggle-supv` com
`Shell.ActionMode.ALL`, conecta às mudanças de configuração e cria o ícone da barra se
habilitado.

`disable()` desfaz tudo em ordem inversa e **é chamado também ao bloquear a tela** (a
extensão não declara `session-modes`, portanto o GNOME a desativa no lockscreen — o
histórico nunca fica acessível com a tela bloqueada). Por isso o binding das notificações é
restaurado a cada bloqueio e retomado no desbloqueio.

## Monitor da área de transferência

- `global.display.get_selection()` devolve o `Meta.Selection`; o sinal `owner-changed`
  dispara sempre que alguém assume a seleção. Só `Meta.SelectionType.SELECTION_CLIPBOARD`
  interessa (PRIMARY — seleção com o mouse — é ignorada, como no Windows).
- Prioridade de leitura: texto (`text/plain;charset=utf-8`, `text/plain`, `UTF8_STRING`,
  `STRING`, `TEXT`) antes de `image/png`. Apps como o LibreOffice oferecem os dois; o texto
  é o que o usuário espera.
- Ignorados: clipboard vazio, `x-kde-passwordManagerHint`, `application/x-password-manager`
  (KeePassXC, Bitwarden, etc.), texto só com espaços, texto > `max-text-bytes`,
  imagem > `max-image-bytes`.
- Quando o próprio Sup V escreve no clipboard (ao colar), o sinal dispara de novo; o dedupe
  do histórico só move o item para o topo — comportamento idêntico ao Windows.

## Modelo e persistência (`history.js`)

Item: `{id, type: 'text'|'image', hash, size, pinned, timestamp, text? | file?, width?, height?}`.

- `hash` = SHA-256 do texto ou dos bytes PNG. Dedupe por hash; item repetido recebe
  `timestamp = agora` e sobe.
- Ordenação: fixados primeiro; dentro de cada grupo, mais recente primeiro.
- `maxItems` (padrão 50) conta só itens **não fixados**.
- Imagens são gravadas em `~/.cache/supv/img/<sha256>.png` assim que chegam (assíncrono);
  enquanto a gravação não termina os bytes ficam em `_pendingImageBytes` para miniatura e
  colagem imediatas.
- `history.json` (`~/.cache/supv/`): `{version: 1, items: [...]}`. Gravação *debounced*
  (1,5 s) com `Gio.File.replace_contents_bytes_async` (temporário + rename = atômico);
  `flush()` síncrono no `disable()`. Com `persist-history = false` nada é lido ou gravado e
  o cache é apagado ao desativar.

## Painel (`panel.js`)

- Ator raiz: `St.BoxLayout` com as classes `popup-menu-content supv-panel`, adicionado via
  `Main.layoutManager.addTopChrome()` (acima de todas as janelas) e escondido até abrir.
- `open()`: `Main.pushModal(actor, {actionMode: Shell.ActionMode.POPUP})` dá o foco de
  teclado ao painel e captura eventos; `close()` chama `Main.popModal()` e o Mutter devolve o
  foco à janela anterior — é isso que garante que o campo de texto continua com foco.
- Cliques fora: `captured-event` no `global.stage`; um `BUTTON_PRESS`/`TOUCH_BEGIN` fora da
  área alocada do painel fecha sem colar.
- Posição: `global.get_pointer()` → monitor via `get_monitor_index_for_rect` → área de
  trabalho (`getWorkAreaForMonitor`) → canto superior esquerdo no ponteiro (+6 px), ajustado
  para nunca sair da área de trabalho. O tamanho vem do CSS (`width: 340px`,
  `max-height: 480px`); `St.ScrollView` rola o excedente.
- Cards: `St.Button` com `popup-menu-item` (o tema fornece `:hover`, `:active`,
  `:selected`); a seleção por teclado usa a pseudo-classe `selected`. Botões de fixar e
  excluir ficam com `opacity 0` e aparecem no hover, na seleção ou se o item está fixado.
- Texto: prévia de até 4 linhas / 240 caracteres com `…`; o container tem `max-height` e
  `clip_to_allocation` como segunda barreira. Itens truncados ou ≥ 1 KB mostram o tamanho.
- Imagem: `GdkPixbuf.PixbufLoader` com `size-prepared` para decodificar já reduzido
  (máx. 300×120 × fator de escala), depois `St.ImageContent.set_bytes`. Miniaturas ficam em
  cache por hash e são pré-geradas em idle quando o histórico muda.
- Teclado (`key-press-event` no ator raiz): ver tabela no README. Letras sem modificador
  alimentam o filtro (case-insensitive, só itens de texto). Todas as teclas são consumidas
  (`EVENT_STOP`) para nada vazar para a janela de baixo.
- O keybinding `toggle-supv` é registrado com `Shell.ActionMode.ALL`, então `Super+V`
  também fecha o painel enquanto ele está aberto.

## Colar (`paster.js`)

- Dispositivo virtual: `global.stage.context.get_backend().get_default_seat()
  .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE)` (GNOME 47+); em 46 usa
  `Clutter.get_default_backend()`. É o mesmo mecanismo do teclado virtual (OSK) do shell.
- Sequência: pressiona `Control_L` (+ `Shift_L` em terminal), `v`; solta na ordem inversa.
  Timestamp = `GLib.get_monotonic_time()`.
- Terminal: `focus_window.get_wm_class()`, `get_wm_class_instance()`,
  `get_gtk_application_id()` e `get_sandboxed_app_id()` são comparados (minúsculas) com uma
  lista de nomes (`terminal`, `ptyxis`, `kitty`, `alacritty`, `wezterm`, `konsole`, `tilix`,
  `foot`, `ghostty`, …). Configurável em `terminal-shift-paste`.
- O atraso `paste-delay-ms` (padrão 100 ms) dá tempo ao `popModal` de devolver o foco.
- `destroy()` chama `run_dispose()` no dispositivo (obrigatório no `disable()`).

## Atalho e o conflito com as notificações

O GNOME liga `toggle-message-tray` a `['<Super>v', '<Super>m']`. Na ativação
(`_takeOverConflictingBinding`):

1. Lê `toggle-supv` (normalmente `['<Super>v']`) e `toggle-message-tray`.
2. Se houver interseção (comparação normalizada em minúsculas), grava o valor original em
   `saved-message-tray-binding` + `message-tray-binding-saved = true` — **uma vez só**.
3. Escreve em `toggle-message-tray` só as combinações que não conflitam (`['<Super>m']`).

`_restoreConflictingBinding` (no `disable()` e quando o usuário troca o atalho) devolve o
valor salvo e limpa as chaves. Nenhum script de instalação toca nessas configurações.

## Chaves de configuração (`org.gnome.shell.extensions.supv`)

| Chave | Tipo | Padrão | Uso |
|---|---|---|---|
| `toggle-supv` | `as` | `['<Super>v']` | atalho do painel |
| `history-size` | `i` | 50 | itens não fixados mantidos |
| `persist-history` | `b` | true | gravar em `~/.cache/supv` |
| `paste-on-select` | `b` | true | Enter/clique cola (false = só copia) |
| `terminal-shift-paste` | `b` | true | `Ctrl+Shift+V` em terminais |
| `show-indicator` | `b` | false | ícone na barra superior |
| `paste-delay-ms` | `i` | 100 | espera antes de simular o atalho |
| `max-text-bytes` | `i` | 1 MiB | limite por texto |
| `max-image-bytes` | `i` | 10 MiB | limite por imagem |
| `clear-request` | `i` | 0 | contador; prefs incrementa para pedir limpeza |
| `saved-message-tray-binding` | `as` | `[]` | valor original de `toggle-message-tray` |
| `message-tray-binding-saved` | `b` | false | se o valor acima é válido |

## Diferenças entre versões do GNOME tratadas no código

| API | GNOME 46 | GNOME 47–50 |
|---|---|---|
| Seat para dispositivo virtual | `Clutter.get_default_backend()` | `global.stage.context.get_backend()` |
| `St.ImageContent.set_bytes` | `(bytes, formato, w, h, rowstride)` | `(coglContext, bytes, formato, w, h, rowstride)` |
| Falha de grab em `pushModal` | `grab.get_seat_state() === Clutter.GrabState.NONE` | `Clutter.GrabState` não existe (Mutter 18); assume sucesso |
| `ensureActorVisibleInScrollView` | `misc/animationUtils.js` | idem |
| `St.BoxLayout` | `vertical: true` | `orientation: Clutter.Orientation.VERTICAL` (detectado via `find_property`) |
| Shell aninhado para testes | `gnome-shell --nested` | `--headless --virtual-monitor` (50 removeu `--nested`) |

## Segurança e privacidade

- Nada sai da máquina; não há rede.
- Gerenciadores de senha que marcam o clipboard (`x-kde-passwordManagerHint`) são ignorados.
- A extensão é desativada com a tela bloqueada; o histórico não é acessível no lockscreen.
- O cache (`~/.cache/supv`) é criado com permissão `0700` e os arquivos com `PRIVATE`.
- "Persistir em disco" desligado apaga o cache ao desativar/sair.
