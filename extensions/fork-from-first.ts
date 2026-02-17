import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const AGENT_DIR = path.join(os.homedir(), ".pi", "agent");

const REWIND_EXTENSION_DIR = path.join(AGENT_DIR, "extensions", "rewind");
const REWIND_EXTENSION_CANDIDATES = [
  "index.ts",
  "index.js",
  path.join("dist", "index.js"),
  path.join("build", "index.js"),
  "package.json",
];

async function isRewindInstalled(): Promise<boolean> {
  try {
    await access(REWIND_EXTENSION_DIR);
  } catch {
    return false;
  }

  for (const relPath of REWIND_EXTENSION_CANDIDATES) {
    try {
      await access(path.join(REWIND_EXTENSION_DIR, relPath));
      return true;
    } catch {
      // keep looking
    }
  }

  return false;
}

async function requestConversationOnlyForkWhenRewindIsInstalled(pi: ExtensionAPI): Promise<boolean> {
  if (!(await isRewindInstalled())) {
    return false;
  }

  pi.events.emit("rewind:fork-preference", {
    mode: "conversation-only",
    source: "fork-from-first",
  });

  return true;
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
