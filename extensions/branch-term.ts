import { spawn } from "node:child_process"
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import { SessionManager } from "@mariozechner/pi-coding-agent"

const TERMINAL_FLAG = "branch-terminal"

function normalizeTerminalFlag(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined
	const trimmed = value.trim()
	return trimmed.length > 0 ? trimmed : undefined
}

function renderTerminalCommand(template: string, sessionFile: string): string {
	if (template.includes("{session}")) {
		return template.split("{session}").join(sessionFile)
	}
	return `${template} ${sessionFile}`
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`
}

function spawnDetached(command: string, args: string[], onError?: (error: Error) => void): void {
	const child = spawn(command, args, { detached: true, stdio: "ignore" })
	child.unref()
	if (onError) child.on("error", onError)
}

async function isMacAppAvailable(pi: ExtensionAPI, appName: string): Promise<boolean> {
	const result = await pi.exec("open", ["-Ra", appName])
	return result.code === 0
}

async function openInITerm(pi: ExtensionAPI, forkFile: string): Promise<{ opened: boolean; error?: string }> {
	if (process.platform !== "darwin") return { opened: false }

	const appCandidates = ["iTerm2", "iTerm"]
	const availableApp = (
		await (async () => {
			for (const candidate of appCandidates) {
				if (await isMacAppAvailable(pi, candidate)) return candidate
			}
			return undefined
		})()
	)

	if (!availableApp) return { opened: false }

	const command = `pi --session ${shellQuote(forkFile)}`
	const scriptLines = [
		`tell application "${availableApp}"`,
		"activate",
		"if (count of windows) is 0 then",
		"create window with default profile",
		"else",
		"tell current window to create tab with default profile",
		"end if",
		"tell current session of current window",
		`write text ${JSON.stringify(command)}`,
		"end tell",
		"end tell",
	]

	const osascriptArgs = scriptLines.flatMap((line) => ["-e", line])
	const result = await pi.exec("osascript", osascriptArgs)
	if (result.code !== 0) {
		return { opened: false, error: result.stderr || result.stdout || "osascript failed" }
	}

	return { opened: true }
}

async function openInMacOSTerminal(
	pi: ExtensionAPI,
	forkFile: string
): Promise<{ opened: boolean; error?: string }> {
	if (process.platform !== "darwin") return { opened: false }
	if (!(await isMacAppAvailable(pi, "Terminal"))) return { opened: false }

	const command = `pi --session ${shellQuote(forkFile)}`
	const scriptLines = [
		"tell application \"Terminal\"",
		"activate",
		"if (count of windows) is 0 then",
		`do script ${JSON.stringify(command)}`,
		"else",
		`do script ${JSON.stringify(command)} in front window`,
		"end if",
		"end tell",
	]

	const osascriptArgs = scriptLines.flatMap((line) => ["-e", line])
	const result = await pi.exec("osascript", osascriptArgs)
	if (result.code !== 0) {
		return { opened: false, error: result.stderr || result.stdout || "osascript failed" }
	}

	return { opened: true }
}

export default function (pi: ExtensionAPI) {
	pi.registerFlag(TERMINAL_FLAG, {
		description: "Command to open a new terminal. Use {session} placeholder for the session file path.",
		type: "string",
	})

	pi.registerCommand("branch", {
		description: "Fork current session into a new terminal",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle()

			const sessionFile = ctx.sessionManager.getSessionFile()
			if (!sessionFile) {
				if (ctx.hasUI) ctx.ui.notify("Session is not persisted. Restart without --no-session.", "error")
				return
			}

			const leafId = ctx.sessionManager.getLeafId()
			if (!leafId) {
				if (ctx.hasUI) ctx.ui.notify("No messages yet. Nothing to branch.", "error")
				return
			}

			const forkManager = SessionManager.open(sessionFile)
			const forkFile = forkManager.createBranchedSession(leafId)
			if (!forkFile) {
				throw new Error("Failed to create branched session")
			}

			const terminalFlag = normalizeTerminalFlag(pi.getFlag(`--${TERMINAL_FLAG}`))
			if (terminalFlag) {
				const command = renderTerminalCommand(terminalFlag, forkFile)
				spawnDetached("bash", ["-lc", command], (error) => {
					if (ctx.hasUI) ctx.ui.notify(`Terminal command failed: ${error.message}`, "error")
				})
				if (ctx.hasUI) ctx.ui.notify("Opened fork in new terminal", "info")
				return
			}

			if (process.env.TMUX) {
				const result = await pi.exec("tmux", ["new-window", "-n", "branch", "pi", "--session", forkFile])
				if (result.code !== 0) {
					throw new Error(result.stderr || result.stdout || "tmux new-window failed")
				}
				if (ctx.hasUI) ctx.ui.notify("Opened fork in new tmux window", "info")
				return
			}

			if (process.platform === "darwin") {
				const iTermAttempt = await openInITerm(pi, forkFile)
				if (iTermAttempt.opened) {
					if (ctx.hasUI) ctx.ui.notify("Opened fork in iTerm (new tab)", "info")
					return
				}
				if (iTermAttempt.error && ctx.hasUI) ctx.ui.notify(`iTerm failed to open: ${iTermAttempt.error}`, "warning")

				const terminalAttempt = await openInMacOSTerminal(pi, forkFile)
				if (terminalAttempt.opened) {
					if (ctx.hasUI) ctx.ui.notify("Opened fork in macOS Terminal (new tab)", "info")
					return
				}
				if (terminalAttempt.error && ctx.hasUI) {
					ctx.ui.notify(`macOS Terminal failed to open: ${terminalAttempt.error}`, "warning")
				}
			}

			spawnDetached("alacritty", ["-e", "pi", "--session", forkFile], (error) => {
				if (ctx.hasUI) {
					ctx.ui.notify(`Alacritty failed to open: ${error.message}`, "warning")
					ctx.ui.notify(`Run: pi --session ${forkFile}`, "info")
				}
			})
			if (ctx.hasUI) ctx.ui.notify("Opened fork in new Alacritty window", "info")
		},
	})
}