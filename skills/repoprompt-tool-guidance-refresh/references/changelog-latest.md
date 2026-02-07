Version 1.6.14

New Features (CLI)

Machine-readable tool schemas - New --tools-schema flag and tools --schema command for structured JSON output of tool definitions, enabling integration with external systems
JSON file/stdin support - Pass JSON arguments via @file or @- (stdin) for easier handling of complex payloads
Improvements

Improved git tool diff detail levels - New "patches" detail level for truncated diffs; "full" now provides complete untruncated output
Better discovery agent guidance - Context builder now explores more broadly and effectively when analyzing codebases
Smarter CLI JSON parsing - Auto-detects JSON files and auto-repairs common formatting issues from LLM outputs
Fixes

Fixed silent failures in apply_edits replace-all - Now shows a clear error when no matches are found instead of silently succeeding