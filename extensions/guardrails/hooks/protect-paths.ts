import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Protects sensitive paths from being accessed or modified accidentally.
 *
 * Protected paths:
 * - .env files (unless suffixed with .example, .sample, or .test)
 * - .git/ directory contents
 * - node_modules/ directory contents
 *
 * Covers native tools: read, write, edit, bash, grep, find, ls
 */

// .env file patterns
const ENV_FILE_PATTERN = /\.env$/i;
const ALLOWED_ENV_SUFFIXES =
  /\.(example|sample|test)\.env$|\.env\.(example|sample|test)$/i;

// Directory patterns
const GIT_DIR_PATTERN = /(?:^|[/\\])\.git(?:[/\\]|$)/;
const NODE_MODULES_DIR_PATTERN = /(?:^|[/\\])node_modules(?:[/\\]|$)/;

// Allow-list for node_modules
//
// We normally block node_modules access to avoid accidental edits to dependency code.
// However, pi itself may be installed via Homebrew into a global node_modules location,
// and we want to allow reading its bundled docs/examples.
const ALLOWED_NODE_MODULES_PREFIXES = [
  resolve("/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent"),
];

function isAllowedNodeModulesPath(filePath: string): boolean {
  const resolvedPath = resolve(filePath);

  return ALLOWED_NODE_MODULES_PREFIXES.some(
    (prefix) => resolvedPath === prefix || resolvedPath.startsWith(`${prefix}${sep}`),
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(resolve(filePath));
    return true;
  } catch {
    return false;
  }
}

type ProtectionOptions = {
  allowGlobalPiInstallNodeModules?: boolean;
};

function isProtectedDirectory(filePath: string, options?: ProtectionOptions): boolean {
  const resolvedPath = resolve(filePath);

  // Still protect .git everywhere (no exceptions)
  if (GIT_DIR_PATTERN.test(resolvedPath)) {
    return true;
  }

  if (NODE_MODULES_DIR_PATTERN.test(resolvedPath)) {
    const allowNodeModules = Boolean(options?.allowGlobalPiInstallNodeModules);
    if (allowNodeModules && isAllowedNodeModulesPath(resolvedPath)) {
      return false;
    }

    return true;
  }

  return false;
}

async function isProtectedEnvFile(filePath: string): Promise<boolean> {
  if (!ENV_FILE_PATTERN.test(filePath)) {
    return false;
  }

  if (ALLOWED_ENV_SUFFIXES.test(filePath)) {
    return false;
  }

  // Only block if file actually exists on disk
  return fileExists(filePath);
}

async function isProtectedPath(filePath: string, options?: ProtectionOptions): Promise<boolean> {
  // Check protected directories first (synchronous, no file check needed)
  if (isProtectedDirectory(filePath, options)) {
    return true;
  }

  // Check .env files (requires file existence check)
  return isProtectedEnvFile(filePath);
}

function getProtectionReason(filePath: string): string {
  if (isProtectedDirectory(filePath)) {
    if (GIT_DIR_PATTERN.test(filePath)) {
      return `Accessing ${filePath} is not allowed. The .git directory is protected to prevent repository corruption.`;
    }
    if (NODE_MODULES_DIR_PATTERN.test(filePath)) {
      return `Accessing ${filePath} is not allowed. The node_modules directory is protected. Use package manager commands to manage dependencies.`;
    }
    return `Path "${filePath}" is protected.`;
  }

  // Must be an env file
  return `Accessing ${filePath} is not allowed. Environment files containing secrets are protected. Explain to the user why you want to access this .env file, and if changes are needed ask the user to make them. Only .env.example, .env.sample, or .env.test files can be accessed.`;
}

// -------------------------------------------------------------------
// Tool protection rule interface
// -------------------------------------------------------------------

interface ToolProtectionRule {
  /** Tool names this rule applies to */
  tools: string[];
  /** Extract paths/targets from tool input that need checking */
  extractTargets: (input: Record<string, unknown>) => string[];
  /** Check if a target should be blocked */
  shouldBlock: (target: string) => Promise<boolean>;
  /** Generate block message for a target */
  blockMessage: (target: string) => string;
}

// -------------------------------------------------------------------
// Protection rules
// -------------------------------------------------------------------

const extractPathTargets = (input: Record<string, unknown>): string[] => {
  const path = String(input.file_path ?? input.path ?? "");
  return path ? [path] : [];
};

const protectionRules: ToolProtectionRule[] = [
  {
    // Read-like tools
    tools: ["read", "grep", "find", "ls"],
    extractTargets: extractPathTargets,
    shouldBlock: (target) => isProtectedPath(target, { allowGlobalPiInstallNodeModules: true }),
    blockMessage: getProtectionReason,
  },
  {
    // Write tools stay strict (no node_modules allow-list)
    tools: ["write", "edit"],
    extractTargets: extractPathTargets,
    shouldBlock: isProtectedPath,
    blockMessage: getProtectionReason,
  },
  {
    // Bash needs to parse command string for protected path references
    tools: ["bash"],
    extractTargets: (input) => {
      const command = String(input.command ?? "");
      const files: string[] = [];

      // Match .env file references in bash commands
      const envFileRegex =
        /(?:^|\s|[<>|;&"'`])([^\s<>|;&"'`]*\.env)(?:\s|$|[<>|;&"'`])/gi;

      for (const match of command.matchAll(envFileRegex)) {
        const file = match[1];
        if (file) {
          files.push(file);
        }
      }

      // Match .git/ directory references
      const gitDirRegex =
        /(?:^|\s|[<>|;&"'`])([^\s<>|;&"'`]*\.git[/\\][^\s<>|;&"'`]*)(?:\s|$|[<>|;&"'`])/gi;

      for (const match of command.matchAll(gitDirRegex)) {
        const file = match[1];
        if (file) {
          files.push(file);
        }
      }

      // Match node_modules/ directory references
      const nodeModulesRegex =
        /(?:^|\s|[<>|;&"'`])([^\s<>|;&"'`]*node_modules[/\\][^\s<>|;&"'`]*)(?:\s|$|[<>|;&"'`])/gi;

      for (const match of command.matchAll(nodeModulesRegex)) {
        const file = match[1];
        if (file) {
          files.push(file);
        }
      }

      return files;
    },
    shouldBlock: isProtectedPath,
    blockMessage: (target) =>
      `Command references protected path ${target}. ${getProtectionReason(target)}`,
  },
];

// Build lookup: tool name -> rule
const rulesByTool = new Map<string, ToolProtectionRule>();
for (const rule of protectionRules) {
  for (const tool of rule.tools) {
    rulesByTool.set(tool, rule);
  }
}

// -------------------------------------------------------------------
// Hook
// -------------------------------------------------------------------

export function setupProtectPathsHook(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const rule = rulesByTool.get(event.toolName);
    if (!rule) return;

    const targets = rule.extractTargets(event.input);

    for (const target of targets) {
      if (await rule.shouldBlock(target)) {
        ctx.ui.notify(`Blocked access to protected path: ${target}`, "warning");
        return {
          block: true,
          reason: rule.blockMessage(target),
        };
      }
    }
    return;
  });
}

// Backward compatibility alias
export const setupProtectEnvFilesHook = setupProtectPathsHook;
