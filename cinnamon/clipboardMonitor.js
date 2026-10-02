// clipboardMonitor.js — gerencia monitoramento do clipboard via clipboard-helper.js
imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Gdk = '3.0';
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Signals = imports.signals;

class ClipboardMonitor {
    constructor() {
        this._subprocess = null;
        this._cancellable = null;
        this._paused = false;
        this._stClipboard = St.Clipboard.get_default();

        Gtk.init_check(null);
        const display = Gdk.Display.get_default();
        this._gtkClipboard = display ? Gtk.Clipboard.get_default(display) : null;
    }

    enable() {
        if (this._subprocess)
            return;

        try {
            this._cancellable = new Gio.Cancellable();
            const helperPath = GLib.build_filenamev([__dirname, 'clipboard-helper.js']);

            this._subprocess = new Gio.Subprocess({
                argv: ['gjs', helperPath],
                flags: Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
            });
            this._subprocess.init(this._cancellable);

            const stdoutStream = new Gio.DataInputStream({
                base_stream: this._subprocess.get_stdout_pipe(),
            });

            this._readStream(stdoutStream);
        } catch (e) {
            global.logWarning(`[supv] erro ao iniciar clipboard-helper: ${e.message}`);
        }
    }

    _readStream(stream) {
        stream.read_line_async(GLib.PRIORITY_DEFAULT, this._cancellable, (source, res) => {
            try {
                const [line] = source.read_line_finish_utf8(res);
                if (line === null)
                    return; // EOF / fechamento

                const trimmed = line.trim();
                if (!this._paused && trimmed.startsWith('{')) {
                    try {
                        const data = JSON.parse(trimmed);
                        if (data.type === 'text' && data.text) {
                            this.emit('text-copied', data.text);
                        } else if (data.type === 'image' && data.hash) {
                            this.emit('image-copied', data);
                        }
                    } catch (err) {
                        global.logWarning(`[supv] erro ao processar JSON: ${err.message}`);
                    }
                }

                this._readStream(stream);
            } catch {
                // Cancelado ou stream fechada
            }
        });
    }

    disable() {
        if (this._cancellable) {
            this._cancellable.cancel();
            this._cancellable = null;
        }
        if (this._subprocess) {
            try {
                this._subprocess.force_exit();
            } catch {
                // Processo já encerrado
            }
            this._subprocess = null;
        }
    }

    pause() {
        this._paused = true;
    }

    resume() {
        this._paused = false;
    }

    setClipboard(item, history) {
        this.pause();
        try {
            if (item.type === 'text') {
                if (this._gtkClipboard)
                    this._gtkClipboard.set_text(item.text, -1);
                this._stClipboard.set_text(St.ClipboardType.CLIPBOARD, item.text);
            } else if (item.type === 'image') {
                if (this._gtkClipboard && item.file) {
                    try {
                        const pixbuf = GdkPixbuf.Pixbuf.new_from_file(item.file);
                        this._gtkClipboard.set_image(pixbuf);
                    } catch (e) {
                        global.logWarning(`[supv] falha ao carregar imagem para clipboard: ${e.message}`);
                    }
                }
            }
        } finally {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                this.resume();
                return GLib.SOURCE_REMOVE;
            });
        }
    }
}
Signals.addSignalMethods(ClipboardMonitor.prototype);

module.exports = { ClipboardMonitor };
