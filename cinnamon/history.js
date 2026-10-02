// history.js — modelo do histórico para Cinnamon: dedupe, fixar, limites e persistência.
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Signals = imports.signals;

const ItemType = Object.freeze({
    TEXT: 'text',
    IMAGE: 'image',
});

const HISTORY_FILE = 'history.json';
const IMAGE_DIR = 'img';
const SAVE_DEBOUNCE_MS = 1500;
const FORMAT_VERSION = 1;

class History {
    /**
     * @param {object} params
     * @param {string} params.cacheDir
     * @param {number} params.maxItems
     * @param {boolean} params.persist
     */
    constructor({cacheDir, maxItems, persist}) {
        this._cacheDir = cacheDir;
        this._imageDir = GLib.build_filenamev([cacheDir, IMAGE_DIR]);
        this._historyFile = GLib.build_filenamev([cacheDir, HISTORY_FILE]);
        this._maxItems = maxItems;
        this._persist = persist;
        this._items = [];
        this._saveTimeoutId = 0;
        this._dirty = false;
        this._nextId = 1;
        this._pendingImageBytes = new Map();

        GLib.mkdir_with_parents(this._imageDir, 0o700);
    }

    get items() {
        return this._items;
    }

    get maxItems() {
        return this._maxItems;
    }

    set maxItems(value) {
        this._maxItems = Math.max(1, value | 0);
        if (this._trim())
            this._changed();
    }

    get persist() {
        return this._persist;
    }

    set persist(value) {
        this._persist = !!value;
        if (this._persist)
            this._scheduleSave();
        else
            this._deleteHistoryFile();
    }

    getById(id) {
        return this._items.find(i => i.id === id) ?? null;
    }

    getImageBytes(item) {
        if (!item || item.type !== ItemType.IMAGE)
            return null;
        const pending = this._pendingImageBytes.get(item.hash);
        if (pending)
            return pending;
        try {
            const [, contents] = GLib.file_get_contents(item.file);
            return new GLib.Bytes(contents);
        } catch (e) {
            global.logWarning(`[supv] não foi possível ler ${item.file}: ${e.message}`);
            return null;
        }
    }

    setImageDimensions(item, width, height) {
        if (!item || item.type !== ItemType.IMAGE)
            return;
        if (item.width === width && item.height === height)
            return;
        item.width = width;
        item.height = height;
        this._dirty = true;
        this._scheduleSave();
    }

    addText(text) {
        if (typeof text !== 'string' || text.length === 0)
            return null;
        const hash = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, text, -1);
        const existing = this._findByHash(hash);
        if (existing) {
            existing.timestamp = Date.now();
            this._sort();
            this._changed();
            return existing;
        }
        const item = {
            id: this._newId(),
            type: ItemType.TEXT,
            hash,
            size: new TextEncoder().encode(text).length,
            pinned: false,
            timestamp: Date.now(),
            text,
        };
        this._insert(item);
        return item;
    }

    addImage(bytesOrEntry, info = {}) {
        if (!bytesOrEntry)
            return null;
        if (bytesOrEntry.hash && bytesOrEntry.file) {
            const existing = this._findByHash(bytesOrEntry.hash);
            if (existing) {
                existing.timestamp = Date.now();
                this._sort();
                this._changed();
                return existing;
            }
            const item = {
                id: this._newId(),
                type: ItemType.IMAGE,
                hash: bytesOrEntry.hash,
                size: bytesOrEntry.size ?? 0,
                pinned: false,
                timestamp: Date.now(),
                file: bytesOrEntry.file,
                width: bytesOrEntry.width ?? 0,
                height: bytesOrEntry.height ?? 0,
            };
            this._insert(item);
            return item;
        }

        const bytes = bytesOrEntry;
        if (bytes.get_size() === 0)
            return null;
        const hash = GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA256, bytes);
        const existing = this._findByHash(hash);
        if (existing) {
            existing.timestamp = Date.now();
            this._sort();
            this._changed();
            return existing;
        }
        const file = GLib.build_filenamev([this._imageDir, `${hash}.png`]);
        const item = {
            id: this._newId(),
            type: ItemType.IMAGE,
            hash,
            size: bytes.get_size(),
            pinned: false,
            timestamp: Date.now(),
            file,
            width: info.width ?? 0,
            height: info.height ?? 0,
        };
        this._writeImage(file, bytes);
        this._insert(item);
        return item;
    }

    remove(id) {
        const idx = this._items.findIndex(i => i.id === id);
        if (idx < 0)
            return false;
        const [item] = this._items.splice(idx, 1);
        this._deleteImage(item);
        this._changed();
        return true;
    }

    togglePin(id) {
        const item = this.getById(id);
        if (!item)
            return false;
        item.pinned = !item.pinned;
        this._sort();
        this._trim();
        this._changed();
        return item.pinned;
    }

    clearUnpinned() {
        const removed = this._items.filter(i => !i.pinned);
        if (removed.length === 0)
            return;
        this._items = this._items.filter(i => i.pinned);
        removed.forEach(i => this._deleteImage(i));
        this._changed();
    }

    clearAll() {
        const removed = this._items;
        this._items = [];
        removed.forEach(i => this._deleteImage(i));
        this._changed();
    }

    load() {
        if (!this._persist)
            return;
        let contents;
        try {
            [, contents] = GLib.file_get_contents(this._historyFile);
        } catch (e) {
            if (!e.matches?.(GLib.FileError, GLib.FileError.NOENT))
                global.logWarning(`[supv] não foi possível ler ${this._historyFile}: ${e.message}`);
            return;
        }
        try {
            const data = JSON.parse(new TextDecoder().decode(contents));
            if (!data || !Array.isArray(data.items))
                return;
            const items = [];
            for (const raw of data.items) {
                if (!raw || typeof raw.hash !== 'string')
                    continue;
                if (raw.type === ItemType.TEXT && typeof raw.text === 'string' && raw.text.length > 0) {
                    items.push({
                        id: this._newId(),
                        type: ItemType.TEXT,
                        hash: raw.hash,
                        size: raw.size | 0,
                        pinned: !!raw.pinned,
                        timestamp: raw.timestamp | 0,
                        text: raw.text,
                    });
                } else if (raw.type === ItemType.IMAGE && typeof raw.file === 'string') {
                    if (!GLib.file_test(raw.file, GLib.FileTest.IS_REGULAR))
                        continue;
                    items.push({
                        id: this._newId(),
                        type: ItemType.IMAGE,
                        hash: raw.hash,
                        size: raw.size | 0,
                        pinned: !!raw.pinned,
                        timestamp: raw.timestamp | 0,
                        file: raw.file,
                        width: raw.width | 0,
                        height: raw.height | 0,
                    });
                }
            }
            this._items = items;
            this._sort();
            this._trim();
            this._dirty = false;
            this.emit('changed');
        } catch (e) {
            global.logWarning(`[supv] histórico corrompido, ignorando: ${e.message}`);
        }
    }

    flush() {
        if (this._saveTimeoutId) {
            GLib.source_remove(this._saveTimeoutId);
            this._saveTimeoutId = 0;
        }
        if (!this._persist || !this._dirty)
            return;
        try {
            GLib.mkdir_with_parents(this._cacheDir, 0o700);
            GLib.file_set_contents(this._historyFile, this._serialize());
            this._dirty = false;
        } catch (e) {
            global.logWarning(`[supv] falha ao salvar histórico: ${e.message}`);
        }
    }

    purgeDisk() {
        this._deleteHistoryFile();
        try {
            const dir = Gio.File.new_for_path(this._imageDir);
            const en = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = en.next_file(null)) !== null) {
                const name = info.get_name();
                const inUse = this._items.some(i => i.file && i.file.endsWith(`/${name}`));
                if (!inUse)
                    dir.get_child(name).delete(null);
            }
            en.close(null);
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                global.logWarning(`[supv] falha ao limpar imagens: ${e.message}`);
        }
    }

    destroy() {
        this.flush();
        if (!this._persist)
            this.purgeDisk();
        this._items = [];
        this._pendingImageBytes.clear();
    }

    _newId() {
        return `${this._nextId++}`;
    }

    _findByHash(hash) {
        return this._items.find(i => i.hash === hash) ?? null;
    }

    _insert(item) {
        this._items.push(item);
        this._sort();
        this._trim();
        this._changed();
    }

    _sort() {
        this._items.sort((a, b) => {
            if (a.pinned !== b.pinned)
                return a.pinned ? -1 : 1;
            return b.timestamp - a.timestamp;
        });
    }

    _trim() {
        const unpinned = this._items.filter(i => !i.pinned);
        if (unpinned.length <= this._maxItems)
            return false;
        const toRemove = new Set(unpinned.slice(this._maxItems).map(i => i.id));
        this._items = this._items.filter(i => !toRemove.has(i.id));
        unpinned.slice(this._maxItems).forEach(i => this._deleteImage(i));
        return true;
    }

    _changed() {
        this._dirty = true;
        this._scheduleSave();
        this.emit('changed');
    }

    _scheduleSave() {
        if (!this._persist)
            return;
        if (this._saveTimeoutId)
            GLib.source_remove(this._saveTimeoutId);
        this._saveTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, SAVE_DEBOUNCE_MS, () => {
            this._saveTimeoutId = 0;
            this._saveAsync();
            return GLib.SOURCE_REMOVE;
        });
    }

    _serialize() {
        return JSON.stringify({
            version: FORMAT_VERSION,
            items: this._items.map(i => ({
                type: i.type,
                hash: i.hash,
                size: i.size,
                pinned: i.pinned,
                timestamp: i.timestamp,
                text: i.text,
                file: i.file,
                width: i.width,
                height: i.height,
            })),
        });
    }

    _saveAsync() {
        if (!this._persist || !this._dirty)
            return;
        const bytes = new GLib.Bytes(new TextEncoder().encode(this._serialize()));
        const file = Gio.File.new_for_path(this._historyFile);
        this._dirty = false;
        file.replace_contents_bytes_async(bytes, null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION | Gio.FileCreateFlags.PRIVATE, null,
            (f, res) => {
                try {
                    f.replace_contents_finish(res);
                } catch (e) {
                    this._dirty = true;
                    global.logWarning(`[supv] falha ao salvar histórico: ${e.message}`);
                }
            });
    }

    _deleteHistoryFile() {
        try {
            Gio.File.new_for_path(this._historyFile).delete(null);
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                global.logWarning(`[supv] falha ao apagar histórico: ${e.message}`);
        }
    }

    _writeImage(path, bytes) {
        const hash = GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA256, bytes);
        this._pendingImageBytes.set(hash, bytes);
        const file = Gio.File.new_for_path(path);
        file.replace_contents_bytes_async(bytes, null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION | Gio.FileCreateFlags.PRIVATE, null,
            (f, res) => {
                try {
                    f.replace_contents_finish(res);
                } catch (e) {
                    global.logWarning(`[supv] falha ao gravar imagem ${path}: ${e.message}`);
                }
                this._pendingImageBytes.delete(hash);
            });
    }

    _deleteImage(item) {
        if (item.type !== ItemType.IMAGE || !item.file)
            return;
        if (this._items.some(i => i !== item && i.file === item.file))
            return;
        try {
            Gio.File.new_for_path(item.file).delete(null);
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                global.logWarning(`[supv] falha ao apagar ${item.file}: ${e.message}`);
        }
    }
}
Signals.addSignalMethods(History.prototype);

module.exports = { History, ItemType };
