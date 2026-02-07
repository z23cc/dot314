import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const REWIND_EXTENSION_PATH = path.join(os.homedir(), ".pi", "agent", "extensions", "rewind", "index.ts");

async function requestConversationOnlyForkWhenRewindIsInstalled(pi: ExtensionAPI): Promise<boolean> {
  try {
    await access(REWIND_EXTENSION_PATH);
    pi.events.emit("rewind:fork-preference", {
      mode: "conversation-only",
      source: "fork-from-first",
    });
    return true;
  } catch {
    return false;
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("fork-from-first", {
    description: "Fork current session from its first user message",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();

      const firstUserEntry = ctx.sessionManager
        .getEntries()
        .find(
          (entry) =>
            entry.type === "message" &&
            entry.message?.role === "user"
        );

      if (!firstUserEntry) {
        if (ctx.hasUI) {
          ctx.ui.notify("No user message found to fork from", "warning");
        }
        return;
      }

      const rewindInstalled = await requestConversationOnlyForkWhenRewindIsInstalled(pi);
      if (ctx.hasUI && rewindInstalled) {
        ctx.ui.notify("Rewind detected: forcing conversation-only fork", "info");
      }

      const result = await ctx.fork(firstUserEntry.id);

      if (ctx.hasUI) {
        if (result.cancelled) {
          ctx.ui.notify("Fork cancelled", "warning");
        } else {
          ctx.ui.notify("Forked from first message and switched to new session", "info");
        }
      }
    },
  });
}
