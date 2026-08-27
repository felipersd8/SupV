// paster.js — injeta Ctrl+V (ou Ctrl+Shift+V em terminais) via dispositivo virtual do Mutter.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

const TERMINAL_HINTS = [
    'terminal', 'kitty', 'alacritty', 'wezterm', 'konsole', 'tilix', 'ptyxis',
    'foot', 'xterm', 'urxvt', 'rxvt', 'terminator', 'guake', 'tabby', 'hyper',
    'warp', 'blackbox', 'contour', 'ghostty', 'rio', 'sakura', 'lxterminal',
    'xfce4-terminal', 'mate-terminal', 'deepin-terminal', 'qterminal', 'st-256color',
];

function getSeat() {
    // GNOME 47+: global.stage.context.get_backend(); GNOME 46: Clutter.get_default_backend()
    const backend = global.stage.context?.get_backend?.() ?? Clutter.get_default_backend?.();
    return backend.get_default_seat();
}

export class Paster {
    /** @param {Gio.Settings} settings */
    constructor(settings) {
        this._settings = settings;
        this._device = null;
    }

    _getDevice() {
        if (!this._device)
            this._device = getSeat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        return this._device;
    }

    /** Janela com foco parece ser um terminal? */
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

    /** Simula o atalho de colar no app com foco. */
    paste() {
        const useShift = this._settings.get_boolean('terminal-shift-paste') && this.isTerminalFocused();
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
            this._device.run_dispose();
            this._device = null;
        }
        this._settings = null;
    }
}
