#!/usr/bin/env bash
# Screenshot do shell aninhado (devkit) via Shell.Screenshot → arquivo PNG.
# Uso: tools/shot.sh /caminho/saida.png
set -euo pipefail
OUT="$1"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$HERE/tools/eval.sh" "
(() => {
  const Gio = imports.gi.Gio; const Shell = imports.gi.Shell;
  const file = Gio.File.new_for_path('$OUT');
  const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
  const s = new Shell.Screenshot();
  s.screenshot(false, stream, (o, res) => { try { s.screenshot_finish(res); } catch (e) { log('shot err ' + e.message); } stream.close(null); });
  return 'ok';
})()" >/dev/null
sleep 1.5
ls -la "$OUT"
