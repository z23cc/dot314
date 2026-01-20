# Guardrails

Security hooks to prevent potentially dangerous operations.

## Features

- **prevent-brew**: Blocks Homebrew commands (project uses Nix)
- **protect-paths**: Prevents access to sensitive paths (`.env` files, `.git/`, `node_modules/`)
- **permission-gate**: Prompts for confirmation on dangerous commands

## Hooks

### prevent-brew

Blocks bash commands that attempt to install packages using Homebrew. Notifies the user that the project uses Nix for package management.

Blocked patterns:
- `brew install`
- `brew cask install`
- `brew bundle`
- `brew upgrade`
- `brew reinstall`

### protect-paths

Prevents accessing sensitive paths that could expose secrets or cause corruption.

**Protected paths:**
- `.env` files (unless suffixed with `.example`, `.sample`, or `.test`)
- `.git/` directory (prevents repository corruption)
- `node_modules/` directory (use package manager instead)

**Coverage:**
- Tools: `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`
- Bash command parsing detects references like `cat .git/config` or `rm -rf node_modules/foo`
- File existence check for `.env` (only blocks if file actually exists)
- Context-aware error messages explain why each path type is protected

### permission-gate

Prompts user confirmation before executing dangerous commands:
- `rm -rf` (recursive force delete)
- `sudo` (superuser command)
- `: | sh` (piped shell execution)
- `dd if=` (disk write operation)
- `mkfs.` (filesystem format)
- `chmod -R 777` (insecure recursive permissions)
- `chown -R` (recursive ownership change)
