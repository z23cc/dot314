/**
 * editor-enhancements
 *
 * Composite custom editor that combines:
 * - shell-completions (autocomplete wrapping for !/!! mode)
 * - file-picker (@ opens overlay file browser)
 * - raw-paste alt+v (paste clipboard text "raw" into editor, bypassing large-paste markers)
 *
 * NOTE: This extension intentionally owns ctx.ui.setEditorComponent().
 * Disable other extensions that also call setEditorComponent (shell-completions/, file-picker.ts, raw-paste.ts)
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { EnhancedEditor } from "./enhanced-editor.js";

export default function (pi: ExtensionAPI) {
    let activeEditor: EnhancedEditor | null = null;

    const attachEditor = (ctx: ExtensionContext) => {
        if (!ctx.hasUI) return;

        ctx.ui.setEditorComponent((tui, theme, keybindings) => {
            activeEditor = new EnhancedEditor(tui, theme, keybindings, ctx.ui, pi);
            return activeEditor;
        });
    };

    pi.on("session_start", (_event, ctx) => {
        attachEditor(ctx);
    });

    pi.on("session_switch", (_event, ctx) => {
        attachEditor(ctx);
    });

    // Keep /files command (useful even if @ intercept is disabled someday)
    pi.registerCommand("files", {
        description: "Browse and select files to reference (inserts @refs at cursor)",
        handler: async (_args, ctx) => {
            if (!ctx.hasUI) return;
            if (!activeEditor) {
                ctx.ui.notify("Editor not ready", "warning");
                return;
            }
            await activeEditor.openFilePickerAtCursor();
        },
    });

    // Provide alt+v raw clipboard paste (the only raw-paste feature you wanted)
    pi.registerShortcut("alt+v", {
        description: "Paste clipboard text raw into editor (bypasses [paste #..] markers)",
        handler: async (ctx) => {
            if (!ctx.hasUI) return;
            if (!activeEditor) {
                ctx.ui.notify("Editor not ready", "warning");
                return;
            }
            await activeEditor.pasteClipboardRawAtCursor();
        },
    });
}
