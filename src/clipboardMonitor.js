// clipboardMonitor.js — observa a área de transferência via Meta.Selection (sem polling).
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Signals from 'resource:///org/gnome/shell/misc/signals.js';

const TEXT_MIMETYPES = ['text/plain;charset=utf-8', 'text/plain', 'UTF8_STRING', 'STRING', 'TEXT'];
const IMAGE_MIMETYPE = 'image/png';
const PASSWORD_HINT_MIMETYPES = ['x-kde-passwordManagerHint', 'application/x-password-manager'];

export class ClipboardMonitor extends Signals.EventEmitter {
    constructor() {
        super();
        this._selection = global.display.get_selection();
        this._clipboard = St.Clipboard.get_default();
        this._ownerChangedId = 0;
        this._paused = false;
    }

    enable() {
        if (this._ownerChangedId)
            return;
        this._ownerChangedId = this._selection.connect('owner-changed', (_sel, type, _source) => {
            if (type === Meta.SelectionType.SELECTION_CLIPBOARD)
                this._onClipboardChanged();
        });
    }

    disable() {
        if (this._ownerChangedId) {
            this._selection.disconnect(this._ownerChangedId);
            this._ownerChangedId = 0;
        }
    }

    /** Lê o clipboard atual (útil no enable, para capturar o que já está lá). */
    readNow() {
        this._onClipboardChanged();
    }

    _onClipboardChanged() {
        let mimetypes;
        try {
            mimetypes = this._clipboard.get_mimetypes(St.ClipboardType.CLIPBOARD) ?? [];
        } catch (e) {
            console.warn(`[supv] get_mimetypes falhou: ${e.message}`);
            return;
        }
        if (mimetypes.length === 0)
            return; // clipboard vazio / dono sumiu
        if (mimetypes.some(m => PASSWORD_HINT_MIMETYPES.includes(m)))
            return; // gerenciador de senhas

        const hasText = mimetypes.some(m => TEXT_MIMETYPES.includes(m));
        const hasImage = mimetypes.includes(IMAGE_MIMETYPE);

        if (hasText) {
            this._clipboard.get_text(St.ClipboardType.CLIPBOARD, (_cb, text) => {
                if (text === null || text === undefined || text.length === 0)
                    return;
                this.emit('text', text);
            });
        } else if (hasImage) {
            this._clipboard.get_content(St.ClipboardType.CLIPBOARD, IMAGE_MIMETYPE, (_cb, bytes) => {
                if (!bytes || bytes.get_size() === 0)
                    return;
                this.emit('image', bytes);
            });
        }
    }
}
