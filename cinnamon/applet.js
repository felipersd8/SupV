// applet.js — ponto de entrada do applet Sup V para o Cinnamon.
const Applet = imports.ui.applet;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;

const { History } = require('./history');
const { ClipboardMonitor } = require('./clipboardMonitor');
const { Paster } = require('./paster');
const { ClipboardPanel } = require('./panel');

class SupVApplet extends Applet.IconApplet {
    constructor(metadata, orientation, panel_height, instanceId) {
        super(orientation, panel_height, instanceId);

        this.metadata = metadata;
        this.instanceId = instanceId;

        this.set_applet_icon_symbolic_name('edit-paste-symbolic');
        this.set_applet_tooltip(_('Sup V — Histórico da Área de Transferência (Super+V)'));

        const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'supv']);
        this._history = new History({
            cacheDir,
            maxItems: 50,
            persist: true,
        });
        this._history.load();

        this._paster = new Paster();
        this._monitor = new ClipboardMonitor();

        this._monitor.connect('text-copied', (_mon, text) => {
            this._history.addText(text);
        });
        this._monitor.connect('image-copied', (_mon, data) => {
            this._history.addImage(data);
        });
        this._monitor.enable();

        this._panel = new ClipboardPanel({
            history: this._history,
            onSelect: (item, autoPaste) => {
                this._monitor.setClipboard(item, this._history);
                if (autoPaste) {
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
                        this._paster.paste(true);
                        return GLib.SOURCE_REMOVE;
                    });
                }
            },
        });

        // Registrar atalho global Super+V no Cinnamon
        this._hotkeyId = 'supv-toggle-' + instanceId;
        Main.keybindingManager.addHotKey(this._hotkeyId, '<Super>v', () => {
            this.toggle();
        });
    }

    on_applet_clicked() {
        this.toggle();
    }

    toggle() {
        if (this._panel.isOpen) {
            this._panel.close();
        } else {
            this._panel.open();
        }
    }

    on_applet_removed_from_panel() {
        Main.keybindingManager.removeHotKey(this._hotkeyId);
        this._monitor.disable();
        this._history.destroy();
        this._panel.destroy();
        this._paster.destroy();
    }
}

function main(metadata, orientation, panel_height, instanceId) {
    return new SupVApplet(metadata, orientation, panel_height, instanceId);
}
