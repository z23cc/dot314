# RepoPrompt CLI extension for Pi (`repoprompt-cli`)

This folder contains the Pi extension that integrates the **RepoPrompt CLI** (`rp-cli`) into Pi.

It provides two Pi tools:

- `rp_bind` — bind to a specific RepoPrompt **window id** + **compose tab** (routing)
- `rp_exec` — run `rp-cli -e <cmd>` against that binding

## Optional: readcache for `rp_exec read`

If enabled, `rp_exec` will apply [Gurpartap/pi-readcache](https://github.com/Gurpartap/pi-readcache)-like token savings for single-command file reads, returning:

- an *unchanged marker* on repeat reads, or
- a *unified diff* when a reread changed and the diff is small/useful, otherwise
- baseline output (fail-open)

### Enable

Create:

- `~/.pi/agent/extensions/repoprompt-cli/config.json`

```json
{
  "readcacheReadFile": true
}
```

Note: when enabled, the extension may persist UTF-8 file snapshots to an on-disk content-addressed store under
`<repo-root>/.pi/readcache/objects` to compute diffs/unchanged markers across calls. Common secret filenames (e.g. `.env*`, `*.pem`) are excluded,
but this is best-effort

### Supported read forms (cached)

Caching only triggers when `cmd` is a **single** read-like invocation (no chains / pipes):

- `read <path> [start] [limit]`
- `read <path> -N` (tail)
- `cat <path> [start] [limit]`
- `read_file path=<path> start_line=<n> limit=<n>`
- slice suffix: `read <path>:<start>-<end>` (or `path=<path>:<start>-<end>`)

### Bypass for a single call

Add `bypass_cache=true` to the `cmd`:

```text
rp_exec cmd="read path=src/main.ts start_line=1 limit=120 bypass_cache=true"
```

## Readcache gotchas

- `rawJson=true` disables readcache. Don't use unless debugging
- Need full content? rerun with `bypass_cache=true`
- Single-command reads only (no `&&` / `;` / `|`)
- Multi-root: use absolute or specific relative paths

### When caching will NOT trigger

`rp_exec` intentionally fails open to baseline output when parsing is ambiguous or unsafe. Caching is disabled for:

- **fallback parser limitation**: when `just-bash` AST parsing is unavailable, only unquoted/unescaped single-command reads are parsed for caching. Quoted/escaped forms (e.g. paths with spaces) will fail open to baseline output

- compound commands: `&&`, `;`, pipelines (`|`)
- multiple top-level invocations in one `cmd`
- `rawJson=true`
- unbound execution (no window/tab)
- read requests with unknown flags/args that prevent canonicalization

## Slash commands

These are **Pi slash commands** (for the chat UI), not `rp_exec` commands:

- `/rpbind <window_id> <tab>`
- `/rpcli-readcache-status`
- `/rpcli-readcache-refresh <path> [start-end]`

## Smoke test

1) Bind:

```text
/rpbind 4 Compose
```

2) Read the same range twice:

```text
Use rp_exec with cmd: "read src/main.ts 1 40".
Use rp_exec with cmd: "read src/main.ts 1 40".
```

The second call should return a `[readcache: ...]` marker.
