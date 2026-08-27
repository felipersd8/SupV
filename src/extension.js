// extension.js — ciclo de vida, atalho global, integração dos módulos.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {History, ItemType} from './history.js';
import {ClipboardMonitor} from './clipboardMonitor.js';
import {Paster} from './paster.js';
import {ClipboardPanel} from './panel.js';

const KEYBINDING_NAME = 'toggle-winv';
const SHELL_KEYBINDINGS_SCHEMA = 'org.gnome.shell.keybindings';
const MESSAGE_TRAY_KEY = 'toggle-message-tray';

const Indicator = GObject.registerClass(
class WinVIndicator extends PanelMenu.Button {
    _init(onToggle) {
        super._init(0.0, 'WinV', true);
        this.add_child(new St.Icon({
            icon_name: 'edit-paste-symbolic',
            style_class: 'system-status-icon',
        }));
        this.connect('button-press-event', () => {
            onToggle();
            return Clutter.EVENT_STOP;
        });
    }
});

function normalizeAccel(accel) {
    // Comparação tolerante: '<Super>v' ≡ '<super>V'. Não precisa ser perfeita —
    // só serve para detectar o conflito com o atalho padrão do GNOME.
    return accel.trim().toLowerCase().replace(/\s+/g, '');
}

export default class WinVExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._shellKeybindings = new Gio.Settings({schema_id: SHELL_KEYBINDINGS_SCHEMA});
        this._pasteTimeoutId = 0;

        const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'winv']);
        this._history = new History({
            cacheDir,
            maxItems: this._settings.get_int('history-size'),
            persist: this._settings.get_boolean('persist-history'),
        });
        this._history.load();

        this._paster = new Paster(this._settings);

        this._panel = new ClipboardPanel({history: this._history, settings: this._settings});
        this._panelActivateId = this._panel.connect('activate', (_p, item, paste) => this._onActivate(item, paste));

        this._monitor = new ClipboardMonitor();
        this._monitorTextId = this._monitor.connect('text', (_m, text) => this._onText(text));
        this._monitorImageId = this._monitor.connect('image', (_m, bytes) => this._onImage(bytes));
        this._monitor.enable();

        this._takeOverConflictingBinding();
        this._addKeybinding();

        this._settings.connectObject(
            'changed::history-size', () => {
                this._history.maxItems = this._settings.get_int('history-size');
            },
            'changed::persist-history', () => {
                this._history.persist = this._settings.get_boolean('persist-history');
                if (!this._history.persist)
                    this._history.purgeDisk();
            },
            'changed::show-indicator', () => this._updateIndicator(),
            'changed::clear-request', () => this._history.clearUnpinned(),
            `changed::${KEYBINDING_NAME}`, () => {
                this._restoreConflictingBinding();
                this._takeOverConflictingBinding();
            },
            this);

        this._updateIndicator();
    }

    disable() {
        // Pode ser chamado ao bloquear a tela: tudo precisa ser desfeito.
        this._cancelPasteTimeout();
        this._settings?.disconnectObject(this);

        this._removeKeybinding();
        this._restoreConflictingBinding();

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        if (this._monitor) {
            this._monitor.disable();
            this._monitor.disconnect(this._monitorTextId);
            this._monitor.disconnect(this._monitorImageId);
            this._monitor = null;
        }
        if (this._panel) {
            this._panel.disconnect(this._panelActivateId);
            this._panel.destroy();
            this._panel = null;
        }
        if (this._paster) {
            this._paster.destroy();
            this._paster = null;
        }
        if (this._history) {
            this._history.destroy();
            this._history = null;
        }
        this._shellKeybindings = null;
        this._settings = null;
    }

    /* ---------- clipboard → histórico ---------- */

    _onText(text) {
        const max = this._settings.get_int('max-text-bytes');
        if (new TextEncoder().encode(text).length > max)
            return;
        if (text.trim().length === 0)
            return;
        this._history.addText(text);
    }

    _onImage(bytes) {
        const max = this._settings.get_int('max-image-bytes');
        if (bytes.get_size() > max)
            return;
        this._history.addImage(bytes);
    }

    /* ---------- histórico → clipboard (+ colar) ---------- */

    _onActivate(item, paste) {
        const clipboard = St.Clipboard.get_default();
        if (item.type === ItemType.TEXT) {
            clipboard.set_text(St.ClipboardType.CLIPBOARD, item.text);
        } else {
            const bytes = this._history.getImageBytes(item);
            if (!bytes)
                return;
            clipboard.set_content(St.ClipboardType.CLIPBOARD, 'image/png', bytes);
        }

        if (!paste || !this._settings.get_boolean('paste-on-select'))
            return;

        this._cancelPasteTimeout();
        const delay = this._settings.get_int('paste-delay-ms');
        this._pasteTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._pasteTimeoutId = 0;
            try {
                this._paster?.paste();
            } catch (e) {
                console.warn(`[winv] falha ao simular colar: ${e.message}`);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelPasteTimeout() {
        if (this._pasteTimeoutId) {
            GLib.source_remove(this._pasteTimeoutId);
            this._pasteTimeoutId = 0;
        }
    }

    /* ---------- atalho ---------- */

    _addKeybinding() {
        Main.wm.addKeybinding(
            KEYBINDING_NAME,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.ALL,
            () => this._panel?.toggle());
    }

    _removeKeybinding() {
        Main.wm.removeKeybinding(KEYBINDING_NAME);
    }

    /**
     * O GNOME usa Super+V para a lista de notificações (toggle-message-tray).
     * Removemos só a combinação conflitante (Super+M continua funcionando),
     * guardamos o valor original e restauramos no disable().
     */
    _takeOverConflictingBinding() {
        const ours = this._settings.get_strv(KEYBINDING_NAME).map(normalizeAccel);
        const current = this._shellKeybindings.get_strv(MESSAGE_TRAY_KEY);
        const remaining = current.filter(b => !ours.includes(normalizeAccel(b)));
        if (remaining.length === current.length)
            return; // sem conflito
        if (!this._settings.get_boolean('message-tray-binding-saved')) {
            this._settings.set_strv('saved-message-tray-binding', current);
            this._settings.set_boolean('message-tray-binding-saved', true);
        }
        this._shellKeybindings.set_strv(MESSAGE_TRAY_KEY, remaining);
        console.log(`[winv] toggle-message-tray: ${JSON.stringify(current)} → ${JSON.stringify(remaining)} (original salvo)`);
    }

    _restoreConflictingBinding() {
        if (!this._settings?.get_boolean('message-tray-binding-saved'))
            return;
        const saved = this._settings.get_strv('saved-message-tray-binding');
        this._shellKeybindings.set_strv(MESSAGE_TRAY_KEY, saved);
        this._settings.set_boolean('message-tray-binding-saved', false);
        this._settings.set_strv('saved-message-tray-binding', []);
        console.log(`[winv] toggle-message-tray restaurado para ${JSON.stringify(saved)}`);
    }

    /* ---------- ícone na barra ---------- */

    _updateIndicator() {
        const want = this._settings.get_boolean('show-indicator');
        if (want && !this._indicator) {
            this._indicator = new Indicator(() => this._panel?.toggle());
            Main.panel.addToStatusArea('winv', this._indicator);
        } else if (!want && this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
