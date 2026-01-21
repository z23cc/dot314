---
name: qmd
description: Local search/indexing CLI (BM25 + vectors + rerank) + helper scripts (e.g. time-window session log analysis)
---

# qmd

Use `qmd` to index local files and search them.

This skill is the canonical reference for:
- General-purpose local search (docs, code, notes, etc.)
- Session-log intelligence gathering (via a pre-indexed `sessions` collection)

There may also be helper scripts in this folder (for example, for processing session logs) that complement qmd searches.

## Indexing

```bash
# Add a collection (example: markdown docs)
qmd collection add /path --name docs --mask "**/*.md"

# Update index
qmd update

# Status
qmd status
```

## Search

```bash
# BM25 (keyword)
qmd search "query"

# Vector similarity (semantic)
qmd vsearch "query"

# Hybrid (usually best)
qmd query "query"

# Get a snippet (or use --full)
qmd get docs/path.md:10 -l 40
qmd get docs/path.md --full
```

### Useful options

```bash
-n NUM          # Number of results (default: 5)
--full          # Show full document instead of snippet
--files         # Output file paths only (for piping)
--line-numbers  # Add line numbers to output
--min-score N   # Filter by minimum similarity score
```

## Notes

- Embeddings/rerank use Ollama at `OLLAMA_URL` (default `http://localhost:11434`).
- Index lives under `~/.cache/qmd` by default.

---

# Sessions (qmd-powered)

Session logs are already indexed as the `sessions` collection.

## qmd: Search across all sessions (all time)

```bash
# Keyword search (BM25)
qmd search "apply_edits" -n 20

# Semantic similarity
qmd vsearch "investigated flaky tests" -n 10

# Hybrid search (usually best)
qmd query "how did the agent implement OAuth redirect" -n 10

# Get full session file
qmd get sessions/path-to-file.jsonl --full
```

### Field-oriented searches (session JSONL)

```bash
# By tool
qmd search '"toolName":"rp_exec"' -n 20
qmd search '"toolName":"subagent"' -n 20

# Tool results that were marked error
qmd search '"isError":true' -n 20

# By message role
qmd search '"role":"user"' -n 20
qmd search '"role":"assistant"' -n 20

# By entry type
qmd search '"type":"toolResult"' -n 20
qmd search '"type":"message"' -n 20
```

## Time window + aggregation (script)

When you need "last N hours" views, tool frequency summaries, or quick operational reports, use:

- Script: `./analyze-sessions.sh`
- Location: `/Users/ww/.pi/agent/skills/qmd/analyze-sessions.sh`

```bash
cd /Users/ww/.pi/agent/skills/qmd

# Report for last 24 hours
./analyze-sessions.sh --hours 24 --report

# Sessions that include a particular regex pattern (ranked by match count)
./analyze-sessions.sh --hours 48 --pattern "apply_edits|rp_exec"

# Edit-related activity diagnostics
./analyze-sessions.sh --hours 36 --edit-diagnostics

# Tool usage statistics
./analyze-sessions.sh --hours 24 --tool-stats

# Restrict to a project (derived from session path)
./analyze-sessions.sh --hours 72 --report --project pi-mono

# Restrict to sessions that used a specific tool
./analyze-sessions.sh --hours 72 --tool-stats --tool rp_exec
```

## Session JSONL structure (reference)

Each JSONL line has a `type` field:

| Type | Key Fields |
|------|------------|
| `message` | `role`, `content`, `toolCall` |
| `toolResult` | `toolName`, `isError`, `content` |
| `custom` | `customType`, `data` |
```
