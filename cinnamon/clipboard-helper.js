// clipboard-helper.js — processo auxiliar leve para monitorar eventos X11 do clipboard
imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Gdk = '3.0';
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

Gtk.init_check(null);
const display = Gdk.Display.get_default();
if (!display) {
    printerr('[supv-helper] Display not available');
    imports.system.exit(1);
}

const clipboard = Gtk.Clipboard.get_default(display);
const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'supv', 'img']);
GLib.mkdir_with_parents(cacheDir, 0o755);

let lastTextHash = '';
let lastImageHash = '';
let pendingTimeoutId = 0;

function checkClipboard() {
    try {
        if (clipboard.wait_is_text_available()) {
            const text = clipboard.wait_for_text();
            if (text && text.length > 0) {
                const hash = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, text, -1);
                if (hash !== lastTextHash) {
                    lastTextHash = hash;
                    print(JSON.stringify({ type: 'text', text: text }));
                    return;
                }
            }
        }

        if (clipboard.wait_is_image_available()) {
            const pixbuf = clipboard.wait_for_image();
            if (pixbuf) {
                const [, buffer] = pixbuf.save_to_bufferv('png', [], []);
                const bytes = new GLib.Bytes(buffer);
                const hash = GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA256, bytes);
                if (hash !== lastImageHash) {
                    lastImageHash = hash;
                    const filePath = GLib.build_filenamev([cacheDir, `${hash}.png`]);
                    const file = Gio.File.new_for_path(filePath);
                    file.replace_contents_bytes_async(
                        bytes, null, false,
                        Gio.FileCreateFlags.REPLACE_DESTINATION, null, null
                    );
                    print(JSON.stringify({
                        type: 'image',
                        hash: hash,
                        file: filePath,
                        width: pixbuf.get_width(),
                        height: pixbuf.get_height(),
                        size: bytes.get_size(),
                    }));
                }
            }
        }
    } catch (e) {
        printerr(`[supv-helper] error: ${e.message}`);
    }
}

clipboard.connect('owner-change', () => {
    if (pendingTimeoutId) {
        GLib.source_remove(pendingTimeoutId);
    }
    pendingTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => {
        pendingTimeoutId = 0;
        checkClipboard();
        return GLib.SOURCE_REMOVE;
    });
});

// Verifica inicial
GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
    checkClipboard();
    return GLib.SOURCE_REMOVE;
});

// Encerra imediatamente se o processo pai fechar o stdin (pipe EOF)
const GioUnix = imports.gi.GioUnix;
const stdinStream = new Gio.DataInputStream({
    base_stream: new GioUnix.InputStream({ fd: 0, close_fd: false }),
});

function listenStdin() {
    stdinStream.read_line_async(GLib.PRIORITY_DEFAULT, null, (stream, res) => {
        try {
            const [line] = stream.read_line_finish_utf8(res);
            if (line === null) {
                loop.quit();
                return;
            }
            listenStdin();
        } catch {
            loop.quit();
        }
    });
}
listenStdin();

const loop = new GLib.MainLoop(null, false);
loop.run();
