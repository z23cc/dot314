---
description: Bind rp_exec to a RepoPrompt window and compose tab
---

# Bind to RepoPrompt Window and Tab

Bind `rp_exec` to a specific RepoPrompt window and compose tab. This ensures subsequent RepoPrompt operations target the correct workspace and context.

## Background

- `rp_exec` runs `rp-cli -e <cmd>` with safe defaults
- `rp_bind(windowId, tab)` pins `rp_exec` to a specific window + tab (persists across session reloads)
- Before binding, only safe bootstrap commands are allowed: `windows`, `workspace tabs`, `help`, `refresh`, or `workspace switch/create ... --new-window`

## Workflow

### 1) List windows

```
rp_exec(cmd: "windows")
```

### 2) User selects window

If only one window is open, note its ID and skip to step 3.

Otherwise, use the `question` tool:

```
question(
  question: "Select a RepoPrompt window:",
  options: ["1: dot314 (3 roots)", "2: wave-metrics (2 roots)", ...]
)
```

Build options from the windows output showing: window ID, workspace name, and root count.

### 3) List tabs in that window

Use `windowId` override since we're not bound yet:

```
rp_exec(cmd: "workspace tabs", windowId: <selected_id>)
```

### 4) User selects tab

If only one tab exists (typically "Compose"), note it and skip to step 5.

Otherwise, use the `question` tool:

```
question(
  question: "Select a compose tab:",
  options: ["Compose (12 files) [active]", "Feature Work (5 files)", ...]
)
```

- Mark the active tab with `[active]`
- Show file count if available

### 5) Bind with rp_bind

```
rp_bind(windowId: <selected_id>, tab: "<selected_tab>")
```

This persists the binding across session reloads.

### 6) Confirm

Report the binding clearly:

> **Bound rp_exec** → window 1 (dot314), tab "Compose"
>
> Subsequent `rp_exec` calls will target this window and tab automatically.

## Notes

- Tab can be specified by name or UUID
- The binding does NOT set `focus: true` (avoids disrupting user's UI)
- If you need to temporarily target a different window/tab, pass `windowId` and `tab` overrides directly to `rp_exec`
