# Kimi provider extension for pi

This extension registers a single custom provider:

- `kimi/kimi-for-coding`

It uses **Kimi's Anthropic-compatible** coding-agents endpoint.

## Why not the OpenAI-compatible endpoint?

In practice, the OpenAI-compatible endpoint (`https://api.kimi.com/coding/v1`) currently responds with:

> `403 Kimi For Coding is currently only available for Coding Agents ...`

when called from pi (via the OpenAI JS SDK). The Anthropic-compatible endpoint works, so this extension only supports that path to avoid duplicated models and a broken backend.

## Setup (Anthropic-compatible)

### Recommended (avoid `ANTHROPIC_*` collisions)

Claude Code may also read `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY`.
To avoid breaking it, prefer the provider-specific env vars for pi:

```sh
export KIMI_ANTHROPIC_BASE_URL=https://api.kimi.com/coding/
export KIMI_API_KEY=sk-kimi-...

pi
```

You can also inline them for a one-off run:

```sh
KIMI_ANTHROPIC_BASE_URL=https://api.kimi.com/coding/ \
KIMI_API_KEY=sk-kimi-... \
pi
```

### Compatibility (matches Kimi's Claude Code docs)

If you do want to follow Kimi's docs verbatim, these also work (pi will read them as a fallback):

```sh
export ANTHROPIC_BASE_URL=https://api.kimi.com/coding/
export ANTHROPIC_API_KEY=sk-kimi-...

pi
```

If you set these for Kimi and later want to run Claude Code with your Max subscription, run Claude Code with them unset, e.g.:

```sh
env -u ANTHROPIC_BASE_URL -u ANTHROPIC_API_KEY claude
```

## Files

- `index.ts`: extension entrypoint
