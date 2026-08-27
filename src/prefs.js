// prefs.js — janela de preferências (libadwaita).
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const KEYBINDING_NAME = 'toggle-winv';
const DEFAULT_ACCEL = '<Super>v';

const ShortcutDialog = GObject.registerClass(
class WinVShortcutDialog extends Adw.Window {
    _init(parent, settings) {
        super._init({
            transient_for: parent,
            modal: true,
            title: 'Definir atalho',
            default_width: 400,
            default_height: 260,
            resizable: false,
        });
        this._settings = settings;

        const status = new Adw.StatusPage({
            icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
            title: 'Pressione a nova combinação',
            description: 'Use pelo menos um modificador (Super, Ctrl, Alt).\nEsc cancela · Backspace restaura o padrão (Super+V).',
        });
        const toolbar = new Adw.ToolbarView();
        toolbar.add_top_bar(new Adw.HeaderBar({show_title: false}));
        toolbar.set_content(status);
        this.set_content(toolbar);

        const controller = new Gtk.EventControllerKey();
        controller.connect('key-pressed', (_c, keyval, keycode, state) => this._onKeyPressed(keyval, keycode, state));
        this.add_controller(controller);
    }

    _onKeyPressed(keyval, keycode, state) {
        const mask = state & Gtk.accelerator_get_default_mod_mask();
        if (mask === 0 && keyval === Gdk.KEY_Escape) {
            this.close();
            return Gdk.EVENT_STOP;
        }
        if (mask === 0 && keyval === Gdk.KEY_BackSpace) {
            this._settings.set_strv(KEYBINDING_NAME, [DEFAULT_ACCEL]);
            this.close();
            return Gdk.EVENT_STOP;
        }
        if (!this._isValid(keyval, mask))
            return Gdk.EVENT_STOP;
        const accel = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask);
        this._settings.set_strv(KEYBINDING_NAME, [accel]);
        this.close();
        return Gdk.EVENT_STOP;
    }

    _isValid(keyval, mask) {
        if (!Gtk.accelerator_valid(keyval, mask))
            return false;
        const isFunctionKey = keyval >= Gdk.KEY_F1 && keyval <= Gdk.KEY_F35;
        if (mask === 0 && !isFunctionKey)
            return false;
        // Só Shift + tecla comum seria digitação normal.
        if (mask === Gdk.ModifierType.SHIFT_MASK && !isFunctionKey)
            return false;
        return true;
    }
});

export default class WinVPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(560, 640);
        window.set_search_enabled(false);

        const page = new Adw.PreferencesPage({title: 'WinV', icon_name: 'edit-paste-symbolic'});
        window.add(page);

        /* ---- Comportamento ---- */
        const behavior = new Adw.PreferencesGroup({title: 'Comportamento'});
        page.add(behavior);

        const sizeRow = new Adw.SpinRow({
            title: 'Tamanho máximo do histórico',
            subtitle: 'Itens não fixados mantidos (os fixados não contam)',
            adjustment: new Gtk.Adjustment({lower: 5, upper: 500, step_increment: 5, page_increment: 25}),
        });
        settings.bind('history-size', sizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        behavior.add(sizeRow);

        const persistRow = new Adw.SwitchRow({
            title: 'Persistir em disco',
            subtitle: 'Mantém o histórico entre sessões (~/.cache/winv). Desligado = limpa ao sair',
        });
        settings.bind('persist-history', persistRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behavior.add(persistRow);

        const pasteRow = new Adw.SwitchRow({
            title: 'Colar automaticamente ao selecionar',
            subtitle: 'Enter/clique cola no app com foco. Desligado = só copia',
        });
        settings.bind('paste-on-select', pasteRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behavior.add(pasteRow);

        const termRow = new Adw.SwitchRow({
            title: 'Usar Ctrl+Shift+V em terminais',
            subtitle: 'Detecta GNOME Terminal, Ptyxis, Kitty, Alacritty, WezTerm, Konsole, Tilix…',
        });
        settings.bind('terminal-shift-paste', termRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behavior.add(termRow);

        const indicatorRow = new Adw.SwitchRow({
            title: 'Mostrar ícone na barra superior',
            subtitle: 'O Windows não tem; desligado por padrão',
        });
        settings.bind('show-indicator', indicatorRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behavior.add(indicatorRow);

        /* ---- Atalho ---- */
        const shortcutGroup = new Adw.PreferencesGroup({
            title: 'Atalho',
            description: 'Super+V é o padrão. O atalho de notificações do GNOME que usava Super+V é movido para Super+M enquanto a extensão estiver ativa.',
        });
        page.add(shortcutGroup);

        const shortcutRow = new Adw.ActionRow({title: 'Abrir/fechar histórico', activatable: true});
        const shortcutLabel = new Gtk.ShortcutLabel({
            disabled_text: 'Desativado',
            valign: Gtk.Align.CENTER,
        });
        const updateLabel = () => {
            const [accel] = settings.get_strv(KEYBINDING_NAME);
            shortcutLabel.accelerator = accel ?? '';
        };
        updateLabel();
        settings.connect(`changed::${KEYBINDING_NAME}`, updateLabel);
        shortcutRow.add_suffix(shortcutLabel);
        shortcutRow.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic', valign: Gtk.Align.CENTER}));
        shortcutRow.connect('activated', () => {
            new ShortcutDialog(window, settings).present();
        });
        shortcutGroup.add(shortcutRow);

        /* ---- Histórico ---- */
        const historyGroup = new Adw.PreferencesGroup({title: 'Histórico'});
        page.add(historyGroup);

        const clearRow = new Adw.ActionRow({
            title: 'Limpar histórico agora',
            subtitle: 'Remove todos os itens, exceto os fixados',
        });
        const clearButton = new Gtk.Button({label: 'Limpar', valign: Gtk.Align.CENTER});
        clearButton.add_css_class('destructive-action');
        clearButton.connect('clicked', () => {
            settings.set_int('clear-request', settings.get_int('clear-request') + 1);
            window.add_toast(new Adw.Toast({title: 'Histórico limpo', timeout: 2}));
        });
        clearRow.add_suffix(clearButton);
        historyGroup.add(clearRow);

        /* ---- Avançado ---- */
        const advanced = new Adw.PreferencesGroup({title: 'Avançado'});
        page.add(advanced);

        const delayRow = new Adw.SpinRow({
            title: 'Atraso antes de colar (ms)',
            subtitle: 'Tempo para o foco voltar ao app antes de simular Ctrl+V. Aumente se o texto não colar',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 1000, step_increment: 10, page_increment: 50}),
        });
        settings.bind('paste-delay-ms', delayRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        advanced.add(delayRow);

        const maxTextRow = new Adw.SpinRow({
            title: 'Tamanho máximo de texto (KB)',
            subtitle: 'Textos maiores são ignorados',
            adjustment: new Gtk.Adjustment({lower: 16, upper: 16384, step_increment: 64, page_increment: 512}),
        });
        maxTextRow.value = settings.get_int('max-text-bytes') / 1024;
        maxTextRow.connect('notify::value', () => settings.set_int('max-text-bytes', Math.round(maxTextRow.value * 1024)));
        advanced.add(maxTextRow);

        const maxImageRow = new Adw.SpinRow({
            title: 'Tamanho máximo de imagem (MB)',
            subtitle: 'Imagens maiores são ignoradas',
            adjustment: new Gtk.Adjustment({lower: 1, upper: 100, step_increment: 1, page_increment: 5}),
        });
        maxImageRow.value = settings.get_int('max-image-bytes') / (1024 * 1024);
        maxImageRow.connect('notify::value', () => settings.set_int('max-image-bytes', Math.round(maxImageRow.value * 1024 * 1024)));
        advanced.add(maxImageRow);
    }
}
