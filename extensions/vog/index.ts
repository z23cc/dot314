import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type VogConfig = {
	enabled: boolean;
	message: string;
};

const DEFAULT_CONFIG: VogConfig = {
	enabled: false,
	message: "",
};

const CONFIG_FILE_NAME = "vog.json";

// Status items are sorted by key alphabetically in the footer
// Use a numeric prefix so this status appears first
const STATUS_KEY = "0-vog";

const PROJECT_CONTEXT_MARKER = "\n# Project Context";

function injectMessageIntoSystemPrompt(systemPrompt: string, message: string): string {
	const trimmed = message.trim();
	if (!trimmed) return systemPrompt;

	const markerIndex = systemPrompt.indexOf(PROJECT_CONTEXT_MARKER);
	if (markerIndex !== -1) {
		// Insert the message on its own line immediately before "# Project Context"
		return systemPrompt.slice(0, markerIndex) + "\n" + trimmed + '\n' + systemPrompt.slice(markerIndex);
	}

	if (systemPrompt.startsWith("# Project Context")) {
		return trimmed + "\n" + systemPrompt;
	}

	// Fallback: append at end if the marker isn't present (e.g. custom system prompt)
	return systemPrompt + "\n" + trimmed + '\n';
}

function getConfigPath(): string {
	const thisFilePath = fileURLToPath(import.meta.url);
	return path.join(path.dirname(thisFilePath), CONFIG_FILE_NAME);
}

function normalizeConfig(maybeConfig: unknown): VogConfig {
	if (!maybeConfig || typeof maybeConfig !== "object") return DEFAULT_CONFIG;
	const record = maybeConfig as Record<string, unknown>;

	return {
		enabled: typeof record.enabled === "boolean" ? record.enabled : DEFAULT_CONFIG.enabled,
		message: typeof record.message === "string" ? record.message : DEFAULT_CONFIG.message,
	};
}

function isErrno(err: unknown, code: string): boolean {
	return typeof err === "object" && err !== null && "code" in err && (err as any).code === code;
}

function maybeDecodeEscapedJson(raw: string): string | undefined {
	const trimmed = raw.trim();
	// Config file can sometimes contain literal escape sequences (e.g. \"\\u007b\" instead of \"{\"). Decode if needed
	if (!trimmed.startsWith("\\u007b") || !trimmed.endsWith("\\u007d")) return undefined;

	return trimmed
		.replace(/\\u007b/g, "{")
		.replace(/\\u007d/g, "}")
		.replace(/\\n/g, "\n")
		.replace(/\\t/g, "\t")
		.replace(/\\\"/g, "\"");
}

function parseConfig(raw: string): { config: VogConfig; repaired: boolean } {
	try {
		return { config: normalizeConfig(JSON.parse(raw) as unknown), repaired: false };
	} catch {
		const decoded = maybeDecodeEscapedJson(raw);
		if (!decoded) throw new Error("Invalid JSON");
		return { config: normalizeConfig(JSON.parse(decoded) as unknown), repaired: true };
	}
}

async function writeConfig(configPath: string, config: VogConfig): Promise<void> {
	const serialized = JSON.stringify(config, null, "\t") + "\n";
	const tmpPath = `${configPath}.tmp`;
	await fs.writeFile(tmpPath, serialized, "utf8");
	await fs.rename(tmpPath, configPath);
}

function updateStatus(ctx: ExtensionContext, config: VogConfig): void {
	if (!ctx.hasUI) return;

	if (!config.enabled) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}

	ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("accent", "vog ✓"));
}

async function loadConfig(
	ctx: ExtensionContext,
	configPath: string,
	options?: { allowResetPrompt?: boolean },
): Promise<VogConfig> {
	try {
		const raw = await fs.readFile(configPath, "utf8");
		const { config, repaired } = parseConfig(raw);
		if (repaired) {
			await writeConfig(configPath, config);
			if (ctx.hasUI) ctx.ui.notify(`vog: repaired escaped config format at ${configPath}`, "info");
		}
		updateStatus(ctx, config);
		return config;
	} catch (err) {
		if (isErrno(err, "ENOENT")) {
			await writeConfig(configPath, DEFAULT_CONFIG);
			updateStatus(ctx, DEFAULT_CONFIG);
			return DEFAULT_CONFIG;
		}

		// Invalid JSON or other read error
		if (ctx.hasUI) {
			ctx.ui.notify(
				`vog: failed to read/parse ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
				"error",
			);
		}

		if (options?.allowResetPrompt && ctx.hasUI) {
			const ok = await ctx.ui.confirm(
				"Reset vog config?",
				"Config file is invalid JSON. Reset to defaults? (You can re-edit the file afterwards)",
			);
			if (ok) {
				await writeConfig(configPath, DEFAULT_CONFIG);
				ctx.ui.notify("vog: config reset to defaults", "info");
			}
		}

		updateStatus(ctx, DEFAULT_CONFIG);
		return DEFAULT_CONFIG;
	}
}

async function saveConfig(ctx: ExtensionContext, configPath: string, config: VogConfig): Promise<void> {
	try {
		await writeConfig(configPath, config);
		updateStatus(ctx, config);
	} catch (err) {
		if (ctx.hasUI) {
			ctx.ui.notify(`vog: failed to write ${configPath}: ${err instanceof Error ? err.message : String(err)}`, "error");
		}
	}
}

async function openMenu(ctx: ExtensionContext, configPath: string): Promise<void> {
	if (!ctx.hasUI) return;

	const config = await loadConfig(ctx, configPath, { allowResetPrompt: true });
	const trimmed = config.message.trim();
	const messagePreview = trimmed ? trimmed.slice(0, 80) : "(empty)";

	const selection = await ctx.ui.select(
		"/vog",
		[
			`${config.enabled ? "Turn off" : "Turn on"} (currently ${config.enabled ? "on" : "off"})`,
			"Edit message (multi-line)",
			"Clear message",
			`Show config path (${configPath})`,
			`Show message preview: ${messagePreview}`,
		],
	);

	if (!selection) return;

	if (selection.startsWith("Turn ")) {
		await saveConfig(ctx, configPath, { ...config, enabled: !config.enabled });
		ctx.ui.notify(`vog: turned ${!config.enabled ? "on" : "off"}`, "info");
		return;
	}

	if (selection === "Edit message (multi-line)") {
		const edited = await ctx.ui.editor("vog message (appended to system prompt when enabled):", config.message);
		if (edited === undefined) return;
		await saveConfig(ctx, configPath, { ...config, message: edited });
		ctx.ui.notify("vog: message updated", "info");
		return;
	}

	if (selection === "Clear message") {
		const ok = await ctx.ui.confirm("Clear vog message?", "This will set the message to empty (state unchanged)");
		if (!ok) return;
		await saveConfig(ctx, configPath, { ...config, message: "" });
		ctx.ui.notify("vog: message cleared", "info");
		return;
	}

	if (selection.startsWith("Show config path")) {
		ctx.ui.notify(configPath, "info");
		return;
	}

	if (selection.startsWith("Show message preview")) {
		ctx.ui.notify(messagePreview, "info");
		return;
	}
}

export default function vogExtension(pi: ExtensionAPI) {
	const configPath = getConfigPath();

	pi.on("session_start", async (_event, ctx) => {
		await loadConfig(ctx, configPath, { allowResetPrompt: true });
	});

	pi.registerCommand("vog", {
		description: "Append a custom message to the system prompt. Usage: /vog [on|off|<message>] (no args opens menu)",
		handler: async (args, ctx) => {
			const argText = (args ?? "").trim();

			if (!argText) {
				await openMenu(ctx, configPath);
				return;
			}

			const lower = argText.toLowerCase();
			if (lower === "on" || lower === "off") {
				const config = await loadConfig(ctx, configPath, { allowResetPrompt: true });
				const enabled = lower === "on";
				await saveConfig(ctx, configPath, { ...config, enabled });
				if (ctx.hasUI) ctx.ui.notify(`vog: turned ${enabled ? "on" : "off"}`, "info");
				return;
			}

			// Treat the argument as the new message. Also enables vog so it applies immediately
			const config = await loadConfig(ctx, configPath, { allowResetPrompt: true });
			await saveConfig(ctx, configPath, { ...config, enabled: true, message: argText });
			if (ctx.hasUI) ctx.ui.notify("vog: message set (enabled)", "info");
		},
	});

	pi.on("before_agent_start", async (event, ctx) => {
		// No prompts here; if config is broken we'll fall back to defaults for this turn
		const config = await loadConfig(ctx, configPath);
		if (!config.enabled) return;
		const message = config.message.trim();
		if (!message) return;

		return {
			systemPrompt: injectMessageIntoSystemPrompt(event.systemPrompt, message),
		};
	});
}
