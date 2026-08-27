// panel.js — o popup do histórico (visual + navegação por teclado), no estilo Win+V.
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import GdkPixbuf from 'gi://GdkPixbuf';
import Mtk from 'gi://Mtk';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AnimationUtils from 'resource:///org/gnome/shell/misc/animationUtils.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Signals from 'resource:///org/gnome/shell/misc/signals.js';

import {ItemType} from './history.js';

const SHELL_MAJOR = parseInt(Config.PACKAGE_VERSION);
const THUMB_MAX_W = 300;
const THUMB_MAX_H = 120;
const PREVIEW_MAX_LINES = 4;
const PREVIEW_MAX_CHARS = 240;
const PREVIEW_MAX_LINE_CHARS = 160;
const PAGE_STEP = 5;
const POINTER_OFFSET = 6;

const HAS_ORIENTATION = St.BoxLayout.find_property('orientation') !== null;

function vbox(params = {}) {
    const p = HAS_ORIENTATION
        ? {orientation: Clutter.Orientation.VERTICAL}
        : {vertical: true};
    return new St.BoxLayout({...p, ...params});
}

function hbox(params = {}) {
    const p = HAS_ORIENTATION
        ? {orientation: Clutter.Orientation.HORIZONTAL}
        : {vertical: false};
    return new St.BoxLayout({...p, ...params});
}

function formatSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** @returns {{text: string, truncated: boolean}} */
function makePreview(text) {
    const normalized = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
    let lines = normalized.split('\n');
    // Remove linhas vazias no início/fim para o card não ficar "oco".
    while (lines.length > 0 && lines[0].trim() === '')
        lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim() === '')
        lines.pop();
    let truncated = false;
    if (lines.length > PREVIEW_MAX_LINES) {
        lines = lines.slice(0, PREVIEW_MAX_LINES);
        truncated = true;
    }
    lines = lines.map(l => {
        if (l.length > PREVIEW_MAX_LINE_CHARS) {
            truncated = true;
            return l.slice(0, PREVIEW_MAX_LINE_CHARS);
        }
        return l;
    });
    let out = lines.join('\n');
    if (out.length > PREVIEW_MAX_CHARS) {
        out = out.slice(0, PREVIEW_MAX_CHARS);
        truncated = true;
    }
    if (truncated)
        out = `${out.trimEnd()}…`;
    return {text: out, truncated};
}

export class ClipboardPanel extends Signals.EventEmitter {
    /**
     * @param {object} params
     * @param {import('./history.js').History} params.history
     * @param {Gio.Settings} params.settings
     */
    constructor({history, settings}) {
        super();
        this._history = history;
        this._settings = settings;
        this._isOpen = false;
        this._grab = null;
        this._stageEventId = 0;
        this._filter = '';
        this._selectedIndex = 0;
        /** @type {Array<{item: object, card: St.Button}>} */
        this._rows = [];
        this._thumbCache = new Map();
        this._warmIdleId = 0;

        this._historyChangedId = this._history.connect('changed', () => {
            this._scheduleThumbnailWarmup();
            if (this._isOpen)
                this._rebuild();
        });

        this._build();
        this._scheduleThumbnailWarmup();
    }

    get isOpen() {
        return this._isOpen;
    }

    /* ---------- construção ---------- */

    _build() {
        this._actor = vbox({
            style_class: 'popup-menu-content winv-panel',
            reactive: true,
            can_focus: true,
            track_hover: true,
            visible: false,
        });
        this._actor.connect('key-press-event', this._onKeyPress.bind(this));

        // Cabeçalho
        const header = hbox({style_class: 'winv-header', x_expand: true});
        this._titleLabel = new St.Label({
            text: 'Área de transferência',
            style_class: 'winv-title',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._filterBox = hbox({style_class: 'winv-filter', visible: false, y_align: Clutter.ActorAlign.CENTER});
        this._filterBox.add_child(new St.Icon({icon_name: 'edit-find-symbolic', style_class: 'winv-filter-icon'}));
        this._filterLabel = new St.Label({text: '', y_align: Clutter.ActorAlign.CENTER});
        this._filterBox.add_child(this._filterLabel);
        const spacer = new St.Widget({x_expand: true});
        this._clearButton = new St.Button({
            label: 'Limpar tudo',
            style_class: 'winv-clear-button',
            can_focus: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._clearButton.connect('clicked', () => this._clearAll());
        header.add_child(this._titleLabel);
        header.add_child(this._filterBox);
        header.add_child(spacer);
        header.add_child(this._clearButton);
        this._actor.add_child(header);

        // Lista rolável
        this._scroll = new St.ScrollView({
            style_class: 'winv-scroll',
            x_expand: true,
            y_expand: true,
            overlay_scrollbars: true,
        });
        this._scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        this._list = vbox({style_class: 'winv-list', x_expand: true});
        if (this._scroll.set_child)
            this._scroll.set_child(this._list);
        else
            this._scroll.add_actor(this._list);
        this._actor.add_child(this._scroll);

        // Estado vazio
        this._emptyLabel = new St.Label({
            style_class: 'winv-empty',
            text: 'Nada aqui ainda — copie algo e ele aparece aqui',
            visible: false,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._emptyLabel.clutter_text.line_wrap = true;
        this._emptyLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._actor.add_child(this._emptyLabel);

        Main.layoutManager.addTopChrome(this._actor);
    }

    _visibleItems() {
        const items = this._history.items;
        if (this._filter === '')
            return items;
        const needle = this._filter.toLowerCase();
        return items.filter(i => i.type === ItemType.TEXT && i.text.toLowerCase().includes(needle));
    }

    _rebuild() {
        this._list.destroy_all_children();
        this._rows = [];

        const items = this._visibleItems();
        for (const item of items) {
            const card = this._createCard(item);
            this._list.add_child(card);
            this._rows.push({item, card});
        }

        const hasItems = items.length > 0;
        this._scroll.visible = hasItems;
        this._emptyLabel.visible = !hasItems;
        if (!hasItems) {
            this._emptyLabel.text = this._filter === ''
                ? 'Nada aqui ainda — copie algo e ele aparece aqui'
                : `Nenhum item contém “${this._filter}”`;
        }
        this._clearButton.visible = this._history.items.some(i => !i.pinned);

        this._filterLabel.text = this._filter;
        this._filterBox.visible = this._filter !== '';

        this._setSelected(Math.min(this._selectedIndex, Math.max(0, this._rows.length - 1)));
    }

    _createCard(item) {
        const card = new St.Button({
            style_class: 'popup-menu-item winv-card',
            x_expand: true,
            can_focus: false,
            reactive: true,
            track_hover: true,
            button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO,
        });
        card.add_style_class_name(item.type === ItemType.IMAGE ? 'winv-card-image' : 'winv-card-text');

        const row = hbox({style_class: 'winv-card-row', x_expand: true});
        const content = vbox({style_class: 'winv-card-content', x_expand: true, y_align: Clutter.ActorAlign.START});

        if (item.type === ItemType.TEXT) {
            const {text, truncated} = makePreview(item.text);
            const clip = vbox({style_class: 'winv-text-clip', clip_to_allocation: true, x_expand: true});
            const label = new St.Label({text, style_class: 'winv-text', x_expand: true});
            label.clutter_text.line_wrap = true;
            label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            label.clutter_text.use_markup = false;
            clip.add_child(label);
            content.add_child(clip);
            if (truncated || item.size >= 1024) {
                const meta = new St.Label({text: formatSize(item.size), style_class: 'winv-meta'});
                meta.opacity = 140;
                content.add_child(meta);
            }
        } else {
            const thumb = this._getThumbnail(item);
            if (thumb) {
                const img = new St.Widget({
                    style_class: 'winv-thumb',
                    content: thumb.content,
                    width: thumb.width,
                    height: thumb.height,
                    x_align: Clutter.ActorAlign.START,
                });
                content.add_child(img);
            } else {
                content.add_child(new St.Icon({icon_name: 'image-x-generic-symbolic', icon_size: 32, x_align: Clutter.ActorAlign.START}));
            }
            const dims = item.width && item.height ? ` · ${item.width}×${item.height}` : '';
            const meta = new St.Label({text: `Imagem PNG${dims} · ${formatSize(item.size)}`, style_class: 'winv-meta'});
            meta.opacity = 140;
            content.add_child(meta);
        }

        // Ações (fixar / excluir) — aparecem no hover ou quando selecionado
        const actions = hbox({style_class: 'winv-actions', y_align: Clutter.ActorAlign.START});
        const pinBtn = new St.Button({
            style_class: 'winv-action-button',
            can_focus: false,
            child: new St.Icon({icon_name: 'view-pin-symbolic'}),
        });
        pinBtn.accessible_name = item.pinned ? 'Desafixar' : 'Fixar';
        if (item.pinned)
            pinBtn.add_style_class_name('winv-pinned');
        pinBtn.connect('clicked', () => {
            this._history.togglePin(item.id);
        });
        const delBtn = new St.Button({
            style_class: 'winv-action-button',
            can_focus: false,
            child: new St.Icon({icon_name: 'window-close-symbolic'}),
        });
        delBtn.accessible_name = 'Excluir';
        delBtn.connect('clicked', () => {
            this._history.remove(item.id);
        });
        actions.add_child(pinBtn);
        actions.add_child(delBtn);
        actions.opacity = item.pinned ? 255 : 0;
        card._actions = actions;
        card._pinned = item.pinned;

        row.add_child(content);
        row.add_child(actions);
        card.set_child(row);

        card.connect('notify::hover', () => this._updateActionsVisibility(card));
        card.connect('clicked', (_btn, button) => {
            if (button === 2)
                this._activate(item, false);
            else
                this._activate(item, true);
        });
        return card;
    }

    _updateActionsVisibility(card) {
        const selected = card.has_style_pseudo_class('selected');
        card._actions.opacity = card.hover || selected || card._pinned ? 255 : 0;
    }

    /* ---------- miniaturas ---------- */

    _scheduleThumbnailWarmup() {
        if (this._warmIdleId)
            return;
        this._warmIdleId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
            this._warmIdleId = 0;
            for (const item of this._history.items) {
                if (item.type === ItemType.IMAGE && !this._thumbCache.has(item.hash))
                    this._getThumbnail(item);
            }
            // Limpa miniaturas de itens que não existem mais.
            const alive = new Set(this._history.items.map(i => i.hash));
            for (const hash of [...this._thumbCache.keys()]) {
                if (!alive.has(hash))
                    this._thumbCache.delete(hash);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _getThumbnail(item) {
        if (this._thumbCache.has(item.hash))
            return this._thumbCache.get(item.hash);
        let result = null;
        try {
            const bytes = this._history.getImageBytes(item);
            if (!bytes)
                throw new Error('sem bytes');
            const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            const maxW = THUMB_MAX_W * scale;
            const maxH = THUMB_MAX_H * scale;
            const loader = new GdkPixbuf.PixbufLoader();
            let origW = 0, origH = 0;
            loader.connect('size-prepared', (l, w, h) => {
                origW = w;
                origH = h;
                const s = Math.min(1, maxW / w, maxH / h);
                l.set_size(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
            });
            loader.write_bytes(bytes);
            loader.close();
            const pixbuf = loader.get_pixbuf();
            if (!pixbuf)
                throw new Error('pixbuf nulo');
            if (origW && origH)
                this._history.setImageDimensions(item, origW, origH);

            const content = St.ImageContent.new_with_preferred_size(pixbuf.width, pixbuf.height);
            const format = pixbuf.get_has_alpha() ? Cogl.PixelFormat.RGBA_8888 : Cogl.PixelFormat.RGB_888;
            const pixels = pixbuf.read_pixel_bytes();
            if (SHELL_MAJOR >= 47) {
                const coglContext = global.stage.context.get_backend().get_cogl_context();
                content.set_bytes(coglContext, pixels, format, pixbuf.width, pixbuf.height, pixbuf.rowstride);
            } else {
                content.set_bytes(pixels, format, pixbuf.width, pixbuf.height, pixbuf.rowstride);
            }
            result = {
                content,
                width: Math.round(pixbuf.width / scale),
                height: Math.round(pixbuf.height / scale),
            };
        } catch (e) {
            console.warn(`[winv] miniatura falhou (${item.file}): ${e.message}`);
            result = null;
        }
        this._thumbCache.set(item.hash, result);
        return result;
    }

    /* ---------- seleção / teclado ---------- */

    _setSelected(index) {
        if (this._rows.length === 0) {
            this._selectedIndex = 0;
            return;
        }
        index = Math.max(0, Math.min(index, this._rows.length - 1));
        this._rows.forEach(({card}, i) => {
            if (i === index)
                card.add_style_pseudo_class('selected');
            else
                card.remove_style_pseudo_class('selected');
            this._updateActionsVisibility(card);
        });
        this._selectedIndex = index;
        const {card} = this._rows[index];
        if (this._isOpen)
            AnimationUtils.ensureActorVisibleInScrollView(this._scroll, card);
    }

    _selectedItem() {
        return this._rows[this._selectedIndex]?.item ?? null;
    }

    _onKeyPress(_actor, event) {
        const sym = event.get_key_symbol();
        const state = event.get_state();
        const ctrl = (state & Clutter.ModifierType.CONTROL_MASK) !== 0;
        const shift = (state & Clutter.ModifierType.SHIFT_MASK) !== 0;
        const superKey = (state & Clutter.ModifierType.MOD4_MASK) !== 0;
        const alt = (state & Clutter.ModifierType.MOD1_MASK) !== 0;
        const last = this._rows.length - 1;

        switch (sym) {
        case Clutter.KEY_Escape:
            this.close();
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Return:
        case Clutter.KEY_KP_Enter:
        case Clutter.KEY_ISO_Enter: {
            const item = this._selectedItem();
            if (item)
                this._activate(item, !shift);
            return Clutter.EVENT_STOP;
        }
        case Clutter.KEY_Up:
        case Clutter.KEY_KP_Up:
            this._setSelected(this._selectedIndex - 1);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Down:
        case Clutter.KEY_KP_Down:
        case Clutter.KEY_Tab:
            this._setSelected(this._selectedIndex + 1);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_ISO_Left_Tab:
            this._setSelected(this._selectedIndex - 1);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Home:
        case Clutter.KEY_KP_Home:
            this._setSelected(0);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_End:
        case Clutter.KEY_KP_End:
            this._setSelected(last);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Page_Up:
        case Clutter.KEY_KP_Page_Up:
            this._setSelected(this._selectedIndex - PAGE_STEP);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Page_Down:
        case Clutter.KEY_KP_Page_Down:
            this._setSelected(this._selectedIndex + PAGE_STEP);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Delete:
        case Clutter.KEY_KP_Delete:
            if (ctrl && shift) {
                this._clearAll();
            } else {
                const item = this._selectedItem();
                if (item)
                    this._history.remove(item.id);
            }
            return Clutter.EVENT_STOP;
        case Clutter.KEY_BackSpace:
            if (this._filter.length > 0) {
                this._filter = ctrl ? '' : this._filter.slice(0, -1);
                this._rebuild();
            }
            return Clutter.EVENT_STOP;
        default:
            break;
        }

        if (ctrl && (sym === Clutter.KEY_p || sym === Clutter.KEY_P)) {
            const item = this._selectedItem();
            if (item)
                this._history.togglePin(item.id);
            return Clutter.EVENT_STOP;
        }

        if (!ctrl && !superKey && !alt) {
            const uni = event.get_key_unicode();
            if (uni && uni.length > 0 && uni.charCodeAt(0) >= 0x20) {
                this._filter += uni;
                this._selectedIndex = 0;
                this._rebuild();
                return Clutter.EVENT_STOP;
            }
        }
        return Clutter.EVENT_STOP; // não deixar teclas vazarem pra baixo do modal
    }

    /* ---------- ações ---------- */

    _activate(item, paste) {
        this.close();
        this.emit('activate', item, paste);
    }

    _clearAll() {
        this._history.clearUnpinned();
    }

    /* ---------- abrir / fechar ---------- */

    toggle() {
        if (this._isOpen)
            this.close();
        else
            this.open();
    }

    open() {
        if (this._isOpen)
            return;
        this._filter = '';
        this._selectedIndex = 0;
        this._rebuild();

        this._actor.show();
        const grab = Main.pushModal(this._actor, {actionMode: Shell.ActionMode.POPUP});
        // GNOME ≤ 49: Clutter.Grab.get_seat_state() indica se o grab falhou.
        // Mutter 18 (GNOME 50) removeu a API; nesse caso assumimos sucesso.
        if (Clutter.GrabState && grab.get_seat_state?.() === Clutter.GrabState.NONE) {
            Main.popModal(grab);
            this._actor.hide();
            console.warn('[winv] não foi possível obter o grab do teclado');
            return;
        }
        this._grab = grab;
        this._isOpen = true;
        this._position();
        this._setSelected(0);

        this._stageEventId = global.stage.connect('captured-event', this._onStageEvent.bind(this));
        // Garante que o foco de teclado esteja no painel (o pushModal já faz isso, mas
        // extensões de terceiros podem roubar o foco).
        global.stage.set_key_focus(this._actor);

        this._actor.opacity = 0;
        this._actor.ease({opacity: 255, duration: 100, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        this.emit('opened');
    }

    close() {
        if (!this._isOpen)
            return;
        this._isOpen = false;
        if (this._stageEventId) {
            global.stage.disconnect(this._stageEventId);
            this._stageEventId = 0;
        }
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
        this._actor.remove_all_transitions();
        this._actor.hide();
        this.emit('closed');
    }

    _onStageEvent(_stage, event) {
        const type = event.type();
        if (type !== Clutter.EventType.BUTTON_PRESS && type !== Clutter.EventType.TOUCH_BEGIN)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        const [ax, ay] = this._actor.get_transformed_position();
        const [aw, ah] = this._actor.get_transformed_size();
        if (x < ax || y < ay || x > ax + aw || y > ay + ah) {
            this.close();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _position() {
        const [px, py] = global.get_pointer();
        let monitorIndex = -1;
        try {
            monitorIndex = global.display.get_monitor_index_for_rect(
                new Mtk.Rectangle({x: px, y: py, width: 1, height: 1}));
        } catch (e) {
            monitorIndex = -1;
        }
        if (monitorIndex < 0)
            monitorIndex = Main.layoutManager.focusIndex ?? Main.layoutManager.primaryIndex;
        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);

        const [, natWidth] = this._actor.get_preferred_width(-1);
        const [, natHeight] = this._actor.get_preferred_height(natWidth);
        const w = Math.min(natWidth, workArea.width);
        const h = Math.min(natHeight, workArea.height);

        let x = px + POINTER_OFFSET;
        let y = py + POINTER_OFFSET;
        if (x + w > workArea.x + workArea.width)
            x = workArea.x + workArea.width - w;
        if (y + h > workArea.y + workArea.height)
            y = workArea.y + workArea.height - h;
        x = Math.max(workArea.x, x);
        y = Math.max(workArea.y, y);

        this._actor.set_position(Math.round(x), Math.round(y));
    }

    destroy() {
        this.close();
        if (this._warmIdleId) {
            GLib.source_remove(this._warmIdleId);
            this._warmIdleId = 0;
        }
        if (this._historyChangedId) {
            this._history.disconnect(this._historyChangedId);
            this._historyChangedId = 0;
        }
        this._thumbCache.clear();
        this._rows = [];
        if (this._actor) {
            Main.layoutManager.removeChrome(this._actor);
            this._actor.destroy();
            this._actor = null;
        }
        this._history = null;
        this._settings = null;
    }
}
