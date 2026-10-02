// panel.js — popup flutuante do histórico no estilo Win+V para Cinnamon.
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Pango = imports.gi.Pango;
const St = imports.gi.St;
const Main = imports.ui.main;
const Signals = imports.signals;

const { ItemType } = require('./history');

const PREVIEW_MAX_LINES = 4;
const PREVIEW_MAX_CHARS = 240;
const PREVIEW_MAX_LINE_CHARS = 160;
const PAGE_STEP = 5;
const POINTER_OFFSET = 8;

function formatSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function makePreview(text) {
    const normalized = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
    let lines = normalized.split('\n');
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

class ClipboardPanel {
    constructor({history, onSelect}) {
        this._history = history;
        this._onSelect = onSelect;
        this._isOpen = false;
        this._stageEventId = 0;
        this._filter = '';
        this._selectedIndex = 0;
        this._rows = [];

        this._historyChangedId = this._history.connect('changed', () => {
            if (this._isOpen)
                this._rebuild();
        });

        this._build();
    }

    get isOpen() {
        return this._isOpen;
    }

    _build() {
        this._actor = new St.BoxLayout({
            vertical: true,
            style_class: 'supv-panel',
            reactive: true,
            can_focus: true,
            visible: false,
        });
        this._actor.connect('key-press-event', this._onKeyPress.bind(this));

        // Cabeçalho
        const header = new St.BoxLayout({style_class: 'supv-header', x_expand: true});
        this._titleLabel = new St.Label({
            text: 'Área de transferência',
            style_class: 'supv-title',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._filterBox = new St.BoxLayout({style_class: 'supv-filter', visible: false, y_align: Clutter.ActorAlign.CENTER});
        this._filterBox.add_child(new St.Icon({icon_name: 'edit-find-symbolic', style_class: 'supv-filter-icon'}));
        this._filterLabel = new St.Label({text: '', y_align: Clutter.ActorAlign.CENTER});
        this._filterBox.add_child(this._filterLabel);

        const spacer = new St.Widget({x_expand: true});
        this._clearButton = new St.Button({
            label: 'Limpar tudo',
            style_class: 'supv-clear-button',
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
            style_class: 'supv-scroll',
            x_expand: true,
            y_expand: true,
            overlay_scrollbars: true,
        });
        this._scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        this._list = new St.BoxLayout({vertical: true, style_class: 'supv-list', x_expand: true});
        this._scroll.add_actor(this._list);
        this._actor.add_child(this._scroll);

        // Estado vazio
        this._emptyLabel = new St.Label({
            style_class: 'supv-empty',
            text: 'Nada aqui ainda — copie algo e aparecerá aqui',
            visible: false,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._actor.add_child(this._emptyLabel);

        Main.uiGroup.add_actor(this._actor);
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
                ? 'Nada aqui ainda — copie algo e aparecerá aqui'
                : `Nenhum item contém “${this._filter}”`;
        }
        this._clearButton.visible = this._history.items.some(i => !i.pinned);

        this._filterLabel.text = this._filter;
        this._filterBox.visible = this._filter !== '';

        this._setSelected(Math.min(this._selectedIndex, Math.max(0, this._rows.length - 1)));
    }

    _createCard(item) {
        const card = new St.Button({
            style_class: 'supv-card',
            x_expand: true,
            can_focus: false,
            reactive: true,
            track_hover: true,
        });

        const row = new St.BoxLayout({style_class: 'supv-card-row', x_expand: true});
        const content = new St.BoxLayout({vertical: true, style_class: 'supv-card-content', x_expand: true, y_align: Clutter.ActorAlign.START});

        if (item.type === ItemType.TEXT) {
            const {text, truncated} = makePreview(item.text);
            const clip = new St.BoxLayout({vertical: true, style_class: 'supv-text-clip', x_expand: true});
            const label = new St.Label({text, style_class: 'supv-text', x_expand: true});
            label.clutter_text.line_wrap = true;
            label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            clip.add_child(label);
            content.add_child(clip);

            if (truncated || item.size >= 1024) {
                const meta = new St.Label({text: formatSize(item.size), style_class: 'supv-meta'});
                meta.opacity = 140;
                content.add_child(meta);
            }
        } else {
            content.add_child(new St.Icon({
                icon_name: 'image-x-generic-symbolic',
                icon_size: 32,
                x_align: Clutter.ActorAlign.START,
            }));
            const dims = item.width && item.height ? ` · ${item.width}×${item.height}` : '';
            const meta = new St.Label({text: `Imagem PNG${dims} · ${formatSize(item.size)}`, style_class: 'supv-meta'});
            meta.opacity = 140;
            content.add_child(meta);
        }

        // Ações (Fixar e Excluir)
        const actions = new St.BoxLayout({style_class: 'supv-actions', y_align: Clutter.ActorAlign.START});
        const pinBtn = new St.Button({
            style_class: 'supv-action-button',
            can_focus: false,
            child: new St.Icon({icon_name: 'view-pin-symbolic'}),
        });
        if (item.pinned)
            pinBtn.add_style_class_name('supv-pinned');
        pinBtn.connect('clicked', () => {
            this._history.togglePin(item.id);
        });

        const delBtn = new St.Button({
            style_class: 'supv-action-button',
            can_focus: false,
            child: new St.Icon({icon_name: 'window-close-symbolic'}),
        });
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

        card.connect('notify::hover', () => {
            card._actions.opacity = card.hover || card._pinned ? 255 : 0;
        });

        card.connect('clicked', () => {
            this._activate(item, true);
        });

        return card;
    }

    _activate(item, autoPaste) {
        this.close();
        if (this._onSelect)
            this._onSelect(item, autoPaste);
    }

    _clearAll() {
        this._history.clearUnpinned();
    }

    _setSelected(index) {
        if (this._rows.length === 0) {
            this._selectedIndex = 0;
            return;
        }
        index = Math.max(0, Math.min(index, this._rows.length - 1));
        this._rows.forEach(({card}, i) => {
            if (i === index) {
                card.add_style_class_name('selected');
                card._actions.opacity = 255;
            } else {
                card.remove_style_class_name('selected');
                card._actions.opacity = card.hover || card._pinned ? 255 : 0;
            }
        });
        this._selectedIndex = index;
        const sel = this._rows[index];
        if (sel && this._isOpen)
            this._ensureVisible(sel.card);
    }

    _ensureVisible(card) {
        if (!this._scroll || !card)
            return;
        const adj = this._scroll.vscroll.adjustment;
        const [hasY, y] = card.get_transformed_position();
        const [hasScrollY, scrollY] = this._scroll.get_transformed_position();
        const relY = y - scrollY + adj.value;
        const h = card.height;
        if (relY < adj.value) {
            adj.value = Math.max(0, relY);
        } else if (relY + h > adj.value + this._scroll.height) {
            adj.value = relY + h - this._scroll.height;
        }
    }

    _selectedItem() {
        return this._rows[this._selectedIndex]?.item ?? null;
    }

    _onKeyPress(_actor, event) {
        const sym = event.get_key_symbol();
        const state = event.get_state();
        const shift = (state & Clutter.ModifierType.SHIFT_MASK) !== 0;

        switch (sym) {
        case Clutter.KEY_Escape:
            this.close();
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Return:
        case Clutter.KEY_KP_Enter: {
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
        case Clutter.KEY_Page_Up:
            this._setSelected(this._selectedIndex - PAGE_STEP);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Page_Down:
            this._setSelected(this._selectedIndex + PAGE_STEP);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Delete:
        case Clutter.KEY_KP_Delete: {
            const item = this._selectedItem();
            if (item)
                this._history.remove(item.id);
            return Clutter.EVENT_STOP;
        }
        case Clutter.KEY_BackSpace:
            if (this._filter.length > 0) {
                this._filter = this._filter.slice(0, -1);
                this._selectedIndex = 0;
                this._rebuild();
            }
            return Clutter.EVENT_STOP;
        default: {
            const ch = Clutter.keysym_to_unicode(sym);
            if (ch && ch >= 32 && !event.has_control_modifier() && !event.has_mod4_modifier()) {
                this._filter += String.fromCharCode(ch);
                this._selectedIndex = 0;
                this._rebuild();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }
        }
    }

    open() {
        if (this._isOpen)
            return;
        this._filter = '';
        this._selectedIndex = 0;
        this._rebuild();

        this._actor.show();
        Main.pushModal(this._actor);
        this._isOpen = true;
        this._position();
        this._setSelected(0);

        this._stageEventId = global.stage.connect('captured-event', this._onStageEvent.bind(this));
        global.stage.set_key_focus(this._actor);

        this._actor.opacity = 255;
    }

    close() {
        if (!this._isOpen)
            return;
        this._isOpen = false;
        if (this._stageEventId) {
            global.stage.disconnect(this._stageEventId);
            this._stageEventId = 0;
        }
        Main.popModal(this._actor);
        this._actor.hide();
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
        const monitor = Main.layoutManager.currentMonitor;

        const [, natWidth] = this._actor.get_preferred_width(-1);
        const [, natHeight] = this._actor.get_preferred_height(natWidth);
        const w = Math.min(natWidth, monitor.width);
        const h = Math.min(natHeight, monitor.height);

        let x = px + POINTER_OFFSET;
        let y = py + POINTER_OFFSET;
        if (x + w > monitor.x + monitor.width)
            x = monitor.x + monitor.width - w;
        if (y + h > monitor.y + monitor.height)
            y = monitor.y + monitor.height - h;
        x = Math.max(monitor.x, x);
        y = Math.max(monitor.y, y);

        this._actor.set_position(Math.round(x), Math.round(y));
    }

    destroy() {
        this.close();
        if (this._historyChangedId) {
            this._history.disconnect(this._historyChangedId);
            this._historyChangedId = 0;
        }
        Main.uiGroup.remove_actor(this._actor);
        this._actor.destroy();
    }
}
Signals.addSignalMethods(ClipboardPanel.prototype);

module.exports = { ClipboardPanel };
