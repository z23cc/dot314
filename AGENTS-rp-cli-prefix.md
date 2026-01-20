# Tool Guidance

This section overrides generic tool guidance for **repo exploration, context building, and file editing** inside pi.

RepoPrompt (via `rp_exec`) is the default for repo-scoped work because it materially improves context quality and reduces routing mistakes. However, pi's native `edit` is often the best tool for exact-block code replacement.

Every backticked command in this doc is an `rp_exec.cmd` string (what goes after `rp-cli -e`) unless explicitly labeled as a pi native tool.

---

## Mental Model

RepoPrompt (macOS app) organizes state as:
- **Workspaces** → one or more root folders
- **Windows** → each shows one workspace
- **Compose tabs** → each tab has a prompt + file selection (selection is what chat/review sees)

Integration layers:
- **rp-cli** → CLI client talking to the app's MCP server
- **rp_exec** (pi tool) → runs `rp-cli -e <cmd>` with safe defaults
- **rp_bind(windowId, tab)** (pi tool) → pins rp_exec to a specific window + tab

---

## Why RepoPrompt is the Default

Use `rp_exec` over pi's native tools for repo work because it materially improves context quality and operational correctness:

- **Better exploration primitives**: `tree`, `search`, and `structure` are gitignore-aware and tuned for codebase navigation
- **Selection = context**: the compose tab's selection is the single source of truth for what chat/edit/review sees
- **Token-efficient structure**: codemaps (signatures) and slices let you include APIs and relevant portions without dumping whole files
- **Less context pollution**: rp_exec output is bounded and formatted; native shell output injects large, low-signal logs into the model context

You're optimizing for **correctness and stable context**, not convenience.

---

## Bind Before Operating

Before any repo work:

1. `windows` — list available windows
2. `workspace tabs` — list tabs if needed
3. `rp_bind(windowId, tab)` — bind to a specific window and compose tab (tab is usually `"Compose"`)
4. Then proceed with `tree`, `search`, `read`, `select`, `context`, `structure`, etc.

If rp_exec is unbound, only run safe bootstrap commands (`windows`, `workspace list`, `workspace tabs`, `help`, `refresh`, or `workspace switch ... --new-window`) until you can bind.

Routing failures are the #1 cause of "0 matches", "wrong files", or "empty results". If output looks wrong, assume routing first—not tool failure.

---

## Hard Constraints

Do not use bash for: `ls`, `find`, `grep`, `cat`, `wc`, `tree`, or similar file exploration.

Do not use pi's native `grep`, `find`, `ls`, `write` for repo work.

Do not use pi's native `read` for anything except `*/SKILL.md` files (and one edge case noted below). Skill files live in `~/.pi/agent/skills/` or `~/.codex/skills/`, outside any project workspace. RepoPrompt could reach them if you added that folder as a root, but the ceremony isn't worth it for reading a small file. This is an architectural boundary, not an arbitrary exception.

Never switch workspaces in an existing window unless the user explicitly says it's safe. Switching clobbers selection, prompt, and context. Prefer `workspace switch <name> --new-window`.

Keep context intentional: select only what you need, prefer codemaps for reference files, use slices when only a portion matters, avoid `context --all` unless truly needed.

---

## Quick Start

Minimal orientation:
```
tree --folders
```

Typical discovery loop:
```
tree
search "Auth" src/
read path/to/file 1 160
select set src/auth/ && context
structure src/auth/
```

Each rp_exec call is a fresh connection. Use `&&` to chain deterministic sequences in one call.

---

## Tool Selection by Task

| Task | Tool | Why |
|------|------|-----|
| Repo structure | rp_exec `tree` | gitignore-aware, fast orientation |
| Code search | rp_exec `search` | extension filtering, context lines |
| API signatures | rp_exec `structure` | token-efficient, no native equivalent |
| Context curation | rp_exec `select`, `context` | selection is the chat/review input |
| Reading repo files | rp_exec `read` | workspace-scoped, supports tail reads |
| Reading skill files | pi native `read` | skills live outside RP workspace roots |
| Edit: exact block replacement | pi native `edit` | exact-match, loud failure, best for multiline/punctuation |
| Edit: replace-all, multi-edit, diff preview, rewrite | rp_exec `call apply_edits {...}` | capabilities native edit doesn't have |
| File create/move/delete | rp_exec `file create/move/delete` | workspace-aware |

---

## Reading

### Default: rp_exec read

- `read <path> [start] [limit]` — prefer 120–200 line chunks
- Tail read via negative start: `read path/to/file -20` (last 20 lines)

### Edge case: embedded triple-backtick fences

RepoPrompt's pretty output uses markdown fences. If the file contains ``` lines, the formatting can collide. This is rare in practice.

Options:
- Use pi's native `read` for that file
- Use `rp_exec` with `rawJson=true` and JSON form: `call read_file {"path":"...","start_line":1,"limit":160}`

---

## Editing

Two separate concerns:
1. **Matching semantics** — exact block vs substring replace
2. **Quoting/parsing** — shorthand CLI vs JSON

### Pi's native `edit` (preferred for exact block replacement)

Use when you know the exact old block and want loud failure if it's not present.

- Exact-match replacement (oldText must match exactly)
- Best for multiline code blocks, punctuation-heavy content, template literals

This is the common case for surgical edits.

### rp_exec JSON form (preferred for advanced features)

Use when you need:
- Replace-all (`all:true`)
- Multiple edits in one call (`edits:[...]`)
- Diff preview (`verbose:true`)
- Full file rewrite (`rewrite:"..."`)

```
call apply_edits {"path":"...","search":"...","replace":"...","all":true,"verbose":true}
```

### rp_exec shorthand (`edit file "a" "b"`)

Avoid except for very simple ASCII replacements. The two-layer parsing (tool call string → rp-cli command parsing) makes quoting painful quickly.

### File creation

Use `file create` (rp_exec) rather than pi's native `write`. For complex file content, use JSON form: `call file_actions {"action":"create","path":"...","content":"..."}`

### The `failOnNoopEdits` parameter

By default, `rp_exec` errors loudly when an edit makes no changes (parity with pi's native `edit`). If you intentionally want idempotent edits (e.g., "ensure this line exists"), set `failOnNoopEdits=false`—the tool will succeed but still print an explanation.

---

## Routing and Multi-window Notes

If results look wrong:
1. Assume routing first (wrong window/tab)
2. `tree` (no args) to confirm workspace roots
3. `workspace tabs` then bind to the correct tab
4. Don't "fix" confusion by switching workspaces in-place

RepoPrompt only operates within workspace root folders. If the repo isn't in any workspace:
```
workspace create Temp --folder-path /abs/path --new-window
```

---

## Output Hygiene

Prefer:
- `tree --folders` for quick orientation
- `read` in 120–200 line chunks
- `structure` for signatures instead of whole-file reads

Redirect large outputs to a file, then read slices:
```
tree --folders > /tmp/rp_tree.txt
search TODO src/ > /tmp/rp_search.txt
read /tmp/rp_search.txt 1 160
```

---

## Fallback Rules (Exploration and Read)

These rules apply to exploration and read operations. For editing, see the table and Editing section above.

Fall back to pi's native tools only if:

1. rp-cli is not installed or not on PATH
2. A specific rp_exec command fails after one retry
3. You're reading a `*/SKILL.md` file
4. The file contains ``` fences and you don't want to use rawJson

Unexpected output is usually a routing issue—wrong workspace, wrong window, wrong tab—not a tool failure. Check binding and workspace roots before falling back.

---

## Advanced: Direct Tool Calls

Prefer high-level commands. Use `call <tool> {json}` only when you need exact parameters.

- `tools --groups` — list tool groups
- `describe <tool_name>` — show tool schema
- `call <tool_name> {json_args}` — raw invocation

Common uses:
- `call apply_edits {...}` — complex edits (JSON avoids quoting pitfalls)
- `call file_actions {...}` — creating files with complex content
- `call read_file {...}` — when you need rawJson output
