# RepoPrompt 1.6.1

## New Features

- **Jujutsu (jj) VCS Support** - RepoPrompt now supports Jujutsu version control alongside Git, with automatic detection and seamless switching between backends

## Improvements

- **file_search is now 80% more token efficient** - Optimized search result formatting significantly reduces token usage
- Upgraded MCP backend to better support coding agents that do MCP tool search
- Improved search result formatting with hierarchical file tree view for easier navigation
- Better handling of workspaces with multiple git repositories
- Performance improvements for file sorting operations

## Fixes

- Fixed git tool support when used in a worktree
- Fixed context builder settings getting reset after app restart
