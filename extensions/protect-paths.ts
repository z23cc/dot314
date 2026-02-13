/**
 * Protect Paths Extension
 *
 * Standalone directory protection hooks that complement @aliou/pi-guardrails
 * (which handles .env files and dangerous command confirmation).
 *
 * This extension protects:
 * - .git/ directory contents (prevents repository corruption)
 * - node_modules/ directory contents (use package manager instead)
 * - Homebrew install/upgrade commands (remind to use project package manager)
 * - Broad `rm` commands (confirm before any rm, not just rm -rf)
 * - Piped shell execution (`: | sh` patterns)
 *
 * The node_modules/ protection has an allowlist for Pi's own global
 * Homebrew install path, so reading Pi's bundled docs still works.
 *
 * The extra permission gates (rm, piped shell) use ctx.ui.confirm()
 * rather than hard blocks, complementing upstream's AST-based gates
 * which only cover rm -rf, sudo, dd, mkfs, chmod -R 777, chown -R.
 */

import { resolve, sep } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ============================================================================
// Configuration
// ============================================================================

// Allow reading Pi's own node_modules when installed via Homebrew
const ALLOWED_NODE_MODULES_PREFIXES = [
    resolve("/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent"),
];

const BREW_INSTALL_PATTERNS = [
    /\bbrew\s+install\b/,
    /\bbrew\s+cask\s+install\b/,
    /\bbrew\s+bundle\b/,
    /\bbrew\s+upgrade\b/,
    /\bbrew\s+reinstall\b/,
];

// Extra dangerous command patterns that upstream guardrails doesn't cover.
// These use ctx.ui.confirm() (soft gate) rather than hard blocks.
const EXTRA_DANGEROUS_PATTERNS: { pattern: RegExp; description: string }[] = [
    { pattern: /\brm\s+/, description: "delete" },
    { pattern: /:\s*\|\s*sh/, description: "piped shell execution" },
];

// Tools that can read files (allowed to read from allowlisted node_modules)
const READ_TOOLS = ["read", "grep", "find", "ls"];

// Tools that can write/modify files (strict: no node_modules allowlist)
const WRITE_TOOLS = ["write", "edit"];

// ============================================================================
// Path checking
// ============================================================================

const GIT_DIR_PATTERN = /(?:^|[/\\])\.git(?:[/\\]|$)/;
const NODE_MODULES_PATTERN = /(?:^|[/\\])node_modules(?:[/\\]|$)/;

function isAllowedNodeModulesPath(filePath: string): boolean {
    const resolved = resolve(filePath);
    return ALLOWED_NODE_MODULES_PREFIXES.some(
        (prefix) => resolved === prefix || resolved.startsWith(`${prefix}${sep}`),
    );
}

function isProtectedDirectory(filePath: string, allowNodeModulesRead: boolean): boolean {
    const resolved = resolve(filePath);

    if (GIT_DIR_PATTERN.test(resolved)) {
        return true;
    }

    if (NODE_MODULES_PATTERN.test(resolved)) {
        if (allowNodeModulesRead && isAllowedNodeModulesPath(resolved)) {
            return false;
        }
        return true;
    }

    return false;
}

function getProtectionReason(filePath: string): string {
    if (GIT_DIR_PATTERN.test(filePath)) {
        return `Accessing ${filePath} is not allowed. The .git directory is protected to prevent repository corruption.`;
    }
    if (NODE_MODULES_PATTERN.test(filePath)) {
        return `Accessing ${filePath} is not allowed. The node_modules directory is protected. Use package manager commands to manage dependencies.`;
    }
    return `Path "${filePath}" is protected.`;
}

function extractPathFromInput(input: Record<string, unknown>): string {
    const p = String(input.file_path ?? input.path ?? "");
    return p || "";
}

function extractProtectedDirRefsFromCommand(command: string): string[] {
    const refs: string[] = [];

    const gitDirRegex =
        /(?:^|\s|[<>|;&"'`])([^\s<>|;&"'`]*\.git[/\\][^\s<>|;&"'`]*)(?:\s|$|[<>|;&"'`])/gi;
    for (const match of command.matchAll(gitDirRegex)) {
        if (match[1]) refs.push(match[1]);
    }

    const nodeModulesRegex =
        /(?:^|\s|[<>|;&"'`])([^\s<>|;&"'`]*node_modules[/\\][^\s<>|;&"'`]*)(?:\s|$|[<>|;&"'`])/gi;
    for (const match of command.matchAll(nodeModulesRegex)) {
        if (match[1]) refs.push(match[1]);
    }

    return refs;
}

// ============================================================================
// Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
    // --- Directory protection for file-oriented tools ---
    pi.on("tool_call", async (event, ctx) => {
        const isReadTool = READ_TOOLS.includes(event.toolName);
        const isWriteTool = WRITE_TOOLS.includes(event.toolName);
        if (!isReadTool && !isWriteTool) return;

        const filePath = extractPathFromInput(event.input);
        if (!filePath) return;

        const allowNodeModulesRead = isReadTool;
        if (isProtectedDirectory(filePath, allowNodeModulesRead)) {
            ctx.ui.notify(`Blocked access to protected path: ${filePath}`, "warning");
            return {
                block: true,
                reason: getProtectionReason(filePath),
            };
        }
        return;
    });

    // --- Directory protection for bash commands ---
    pi.on("tool_call", async (event, ctx) => {
        if (event.toolName !== "bash") return;

        const command = String(event.input.command ?? "");
        const refs = extractProtectedDirRefsFromCommand(command);

        for (const ref of refs) {
            if (isProtectedDirectory(ref, false)) {
                ctx.ui.notify(`Blocked access to protected path: ${ref}`, "warning");
                return {
                    block: true,
                    reason: `Command references protected path ${ref}. ${getProtectionReason(ref)}`,
                };
            }
        }
        return;
    });

    // --- Prevent Homebrew install/upgrade ---
    pi.on("tool_call", async (event, ctx) => {
        if (event.toolName !== "bash") return;

        const command = String(event.input.command ?? "");

        for (const pattern of BREW_INSTALL_PATTERNS) {
            if (pattern.test(command)) {
                ctx.ui.notify("Blocked brew command. Use the project's package manager instead.", "warning");
                return {
                    block: true,
                    reason: "Homebrew install/upgrade commands are blocked. Please use the project's package manager (npm, pnpm, bun, nix, etc.) instead.",
                };
            }
        }
        return;
    });

    // --- Extra permission gates (confirm, not hard block) ---
    // These complement upstream @aliou/pi-guardrails which covers rm -rf, sudo,
    // dd, mkfs, chmod -R 777, chown -R via AST structural matching.
    // The patterns here catch broader cases that upstream intentionally skips.
    pi.on("tool_call", async (event, ctx) => {
        if (event.toolName !== "bash") return;

        const command = String(event.input.command ?? "");

        for (const { pattern, description } of EXTRA_DANGEROUS_PATTERNS) {
            if (pattern.test(command)) {
                const truncatedCmd = command.length > 80
                    ? `${command.substring(0, 80)}...`
                    : command;

                const proceed = await ctx.ui.confirm(
                    "Dangerous Command Detected",
                    `This command contains ${description}:\n\n${truncatedCmd}\n\nAllow execution?`,
                );

                if (!proceed) {
                    return { block: true, reason: "User denied dangerous command" };
                }
                break;
            }
        }
        return;
    });
}
