#!/usr/bin/env bash
# Smoke test automatizado contra a sessão headless (tools/devkit.sh precisa estar rodando).
# Usa teclado virtual dentro do shell (tools/kb.js) e org.gnome.Shell.Eval.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="${XDG_RUNTIME_DIR:-/tmp}/winv-devkit"
LOG="${DEVKIT_LOG:-$STATE/devkit.log}"
E='Main.extensionManager.lookup("winv@local").stateObj'
K='__winvKb.K'
pass=0; fail=0

# Eval → valor JSON (o Eval devolve JSON.stringify(resultado) dentro de um literal GVariant)
ev() {
    "$HERE/tools/eval.sh" "$1" 2>&1 | python3 -c '
import sys, ast, json
s = sys.stdin.read().strip()
if not s.startswith("(true, "):
    print("EVAL_ERROR: " + s); sys.exit(0)
inner = s[len("(true, "):-1]
try:
    v = ast.literal_eval(inner)
    print(json.dumps(json.loads(v), ensure_ascii=False, separators=(",", ":")) if isinstance(v, str) else v)
except Exception as e:
    print("PARSE_ERROR: " + inner)
'
}
kb() { "$HERE/tools/eval.sh" "$1; 'sent'" >/dev/null 2>&1; sleep "${2:-0.4}"; }
check() { # check "nome" "esperado" "obtido"
    if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1: esperado [$2] obtido [$3]"; fi
}

echo "== preparação"
"$HERE/tools/eval.sh" - < "$HERE/tools/kb.js" >/dev/null || { echo "sem sessão headless (tools/devkit-restart.sh)"; exit 2; }
check "extensão ENABLED" "1" "$(ev "Main.extensionManager.lookup('winv@local').state")"
ev "$E._history.clearAll(); 'ok'" >/dev/null
ev "(()=>{const St=imports.gi.St,GLib=imports.gi.GLib;const cb=St.Clipboard.get_default();const t=['Primeiro texto copiado','Segundo: linha 1\nlinha 2\nlinha 3\nlinha 4\nlinha 5 escondida','x'.repeat(3000),'https://www.gnome.org/extensions/winv','Primeiro texto copiado','Olá mundo — acentuação çãõ'];let i=0;GLib.timeout_add(GLib.PRIORITY_DEFAULT,120,()=>{if(i>=t.length)return false;cb.set_text(St.ClipboardType.CLIPBOARD,t[i++]);return true;});return 'seed'})()" >/dev/null
sleep 1.5
check "5 itens únicos (dedupe)" "5" "$(ev "$E._history.items.length")"
check "mais recente no topo" '"Olá mundo — acentuação çãõ"' "$(ev "$E._history.items[0].text")"
check "duplicata subiu" '"Primeiro texto copiado"' "$(ev "$E._history.items[1].text")"

echo "== abrir / navegar"
kb "__winvKb.tap([$K.KEY_Super_L, $K.KEY_v])"
check "Super+V abre" "true" "$(ev "$E._panel.isOpen")"
check "primeiro item selecionado" "0" "$(ev "$E._panel._selectedIndex")"
check "5 cards" "5" "$(ev "$E._panel._rows.length")"
check "foco de teclado no painel" "true" "$(ev "global.stage.get_key_focus() === $E._panel._actor")"
kb "__winvKb.tap($K.KEY_Down); __winvKb.tap($K.KEY_Down)"; check "Down x2 → 2" "2" "$(ev "$E._panel._selectedIndex")"
kb "__winvKb.tap($K.KEY_Up)";                          check "Up → 1" "1" "$(ev "$E._panel._selectedIndex")"
kb "__winvKb.tap($K.KEY_End)";                         check "End → 4" "4" "$(ev "$E._panel._selectedIndex")"
kb "__winvKb.tap($K.KEY_Home)";                        check "Home → 0" "0" "$(ev "$E._panel._selectedIndex")"
kb "__winvKb.tap($K.KEY_Page_Down)";                   check "PageDown → 4" "4" "$(ev "$E._panel._selectedIndex")"
kb "__winvKb.tap($K.KEY_Page_Up)";                     check "PageUp → 0" "0" "$(ev "$E._panel._selectedIndex")"

echo "== filtro"
kb "__winvKb.type('linha')"
check "filtro 'linha'" '"linha"' "$(ev "$E._panel._filter")"
check "1 card filtrado" "1" "$(ev "$E._panel._rows.length")"
kb "__winvKb.tap($K.KEY_BackSpace)";                   check "Backspace → 'linh'" '"linh"' "$(ev "$E._panel._filter")"
kb "__winvKb.tap([$K.KEY_Control_L, $K.KEY_BackSpace])"; check "Ctrl+Backspace limpa" '""' "$(ev "$E._panel._filter")"
check "5 cards de novo" "5" "$(ev "$E._panel._rows.length")"

echo "== fixar / excluir / limpar"
kb "__winvKb.tap($K.KEY_Down); __winvKb.tap([$K.KEY_Control_L, $K.KEY_p])"
check "Ctrl+P fixa" "true" "$(ev "$E._history.items[0].pinned")"
check "fixado vai pro topo" '"Primeiro texto copiado"' "$(ev "$E._history.items[0].text")"
kb "__winvKb.tap($K.KEY_End); __winvKb.tap($K.KEY_Delete)"
check "Delete remove" "4" "$(ev "$E._history.items.length")"
kb "__winvKb.tap([$K.KEY_Control_L, $K.KEY_Shift_L, $K.KEY_Delete])"
check "Ctrl+Shift+Delete mantém só fixados" '[true]' "$(ev "$E._history.items.map(i=>i.pinned)")"
check "painel mostra card do fixado" "1" "$(ev "$E._panel._rows.length")"
kb "__winvKb.tap([$K.KEY_Control_L, $K.KEY_p])";       check "Ctrl+P desafixa" "false" "$(ev "$E._history.items[0].pinned")"

echo "== fechar / colar"
kb "__winvKb.tap($K.KEY_Escape)"
check "Esc fecha" "false" "$(ev "$E._panel.isOpen")"
check "foco liberado" "true" "$(ev "global.stage.get_key_focus() === null")"
ev "imports.gi.St.Clipboard.get_default().set_text(imports.gi.St.ClipboardType.CLIPBOARD, 'segundo item'); 'ok'" >/dev/null; sleep 0.5
kb "__winvKb.tap([$K.KEY_Super_L, $K.KEY_v])"; kb "__winvKb.tap($K.KEY_Down)"
kb "__winvKb.tap([$K.KEY_Shift_L, $K.KEY_Return])" 0.6
check "Shift+Enter fecha" "false" "$(ev "$E._panel.isOpen")"
check "Shift+Enter copiou (item subiu)" '"Primeiro texto copiado"' "$(ev "$E._history.items[0].text")"

echo "== imagem"
"$HERE/tools/shot.sh" "$STATE/img.png" >/dev/null
ev "(()=>{const GLib=imports.gi.GLib,St=imports.gi.St;const [,c]=GLib.file_get_contents('$STATE/img.png');St.Clipboard.get_default().set_content(St.ClipboardType.CLIPBOARD,'image/png',new GLib.Bytes(c));return 'ok'})()" >/dev/null; sleep 0.8
check "imagem entrou" '"image"' "$(ev "$E._history.items[0].type")"
kb "__winvKb.tap([$K.KEY_Super_L, $K.KEY_v])" 0.6
check "miniatura gerada" "true" "$(ev "$E._panel._thumbCache.get($E._history.items[0].hash) !== null")"
check "dimensões detectadas" "[1280,800]" "$(ev "[$E._history.items[0].width,$E._history.items[0].height]")"
kb "__winvKb.tap($K.KEY_Escape)"

echo "== enable/disable x10"
ev "(()=>{const em=Main.extensionManager;for(let i=0;i<10;i++){em.disableExtension('winv@local');em.enableExtension('winv@local');}return 'ok'})()" >/dev/null; sleep 1
check "ENABLED após 10 ciclos" "1" "$(ev "Main.extensionManager.lookup('winv@local').state")"
check "1 painel no uiGroup (sem vazamento)" "1" "$(ev "Main.layoutManager.uiGroup.get_children().filter(c=>c.has_style_class_name&&c.has_style_class_name('winv-panel')).length")"
check "Super+V removido de toggle-message-tray" '["<Super>m"]' "$(ev "new imports.gi.Gio.Settings({schema_id:'org.gnome.shell.keybindings'}).get_strv('toggle-message-tray')")"
ev "Main.extensionManager.disableExtension('winv@local'); 'ok'" >/dev/null; sleep 0.5
check "disable restaura binding" '["<Super>v","<Super>m"]' "$(ev "new imports.gi.Gio.Settings({schema_id:'org.gnome.shell.keybindings'}).get_strv('toggle-message-tray')")"
check "0 painéis após disable" "0" "$(ev "Main.layoutManager.uiGroup.get_children().filter(c=>c.has_style_class_name&&c.has_style_class_name('winv-panel')).length")"
ev "Main.extensionManager.enableExtension('winv@local'); 'ok'" >/dev/null; sleep 0.5
kb "__winvKb.tap([$K.KEY_Super_L, $K.KEY_v])"; check "Super+V funciona após re-enable" "true" "$(ev "Main.extensionManager.lookup('winv@local').stateObj._panel.isOpen")"; kb "__winvKb.tap($K.KEY_Escape)"

echo "== log"
errs="$(grep -E "JS ERROR|CRITICAL|winv@local: Error" "$LOG" 2>/dev/null | grep -v "NM.Object" | wc -l)"
check "sem JS ERROR/CRITICAL no log" "0" "$errs"
[ "$errs" != "0" ] && grep -E "JS ERROR|CRITICAL|winv@local: Error" "$LOG" | grep -v "NM.Object" | tail -5

echo; echo "RESULTADO: $pass PASS, $fail FAIL"
[ "$fail" = 0 ]
