// Helper de teclado virtual dentro do shell aninhado (carregar via tools/eval.sh - < tools/kb.js)
globalThis.__winvKb = (() => {
  const Clutter = imports.gi.Clutter; const GLib = imports.gi.GLib;
  const seat = global.stage.context.get_backend().get_default_seat();
  const dev = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
  const t = () => GLib.get_monotonic_time();
  const K = Clutter;
  const api = {
    press(k) { dev.notify_keyval(t(), k, Clutter.KeyState.PRESSED); },
    release(k) { dev.notify_keyval(t(), k, Clutter.KeyState.RELEASED); },
    tap(keys) {
      if (!Array.isArray(keys)) keys = [keys];
      for (const k of keys) api.press(k);
      for (const k of [...keys].reverse()) api.release(k);
    },
    type(str) { for (const ch of str) api.tap(Clutter.unicode_to_keysym(ch.codePointAt(0))); },
    K,
  };
  return api;
})();
'kb ready'
