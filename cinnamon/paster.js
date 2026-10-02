// paster.js — simula Ctrl+V (ou Ctrl+Shift+V em terminais) no Cinnamon via dispositivo virtual do Muffin/Clutter.
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;

const TERMINAL_HINTS = [
    'terminal', 'kitty', 'alacritty', 'wezterm', 'konsole', 'tilix', 'ptyxis',
    'foot', 'xterm', 'urxvt', 'rxvt', 'terminator', 'guake', 'tabby', 'hyper',
    'warp', 'blackbox', 'contour', 'ghostty', 'rio', 'sakura', 'lxterminal',
    'xfce4-terminal', 'mate-terminal', 'deepin-terminal', 'qterminal', 'st-256color',
];

class Paster {
    constructor() {
        this._device = null;
    }

    _getDevice() {
        if (!this._device) {
            const seat = Clutter.get_default_backend().get_default_seat();
            this._device = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        }
        return this._device;
    }

    isTerminalFocused() {
        const win = global.display.focus_window;
        if (!win)
            return false;
        const parts = [
            win.get_wm_class?.(),
            win.get_wm_class_instance?.(),
            win.get_gtk_application_id?.(),
            win.get_sandboxed_app_id?.(),
        ].filter(Boolean).map(s => s.toLowerCase());
        return parts.some(p => TERMINAL_HINTS.some(h => p.includes(h)));
    }

    paste(useTerminalShift = true) {
        const useShift = useTerminalShift && this.isTerminalFocused();
        const keys = [Clutter.KEY_Control_L];
        if (useShift)
            keys.push(Clutter.KEY_Shift_L);
        keys.push(Clutter.KEY_v);
        this._sendChord(keys);
    }

    _sendChord(keys) {
        const dev = this._getDevice();
        const t = () => GLib.get_monotonic_time();
        for (const k of keys)
            dev.notify_keyval(t(), k, Clutter.KeyState.PRESSED);
        for (const k of [...keys].reverse())
            dev.notify_keyval(t(), k, Clutter.KeyState.RELEASED);
    }

    destroy() {
        if (this._device) {
            this._device = null;
        }
    }
}

module.exports = { Paster };
