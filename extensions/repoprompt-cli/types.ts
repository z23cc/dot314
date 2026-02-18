// types.ts - shared types for the repoprompt-cli extension

export interface RpCliConfig {
    // Optional read_file caching (pi-readcache-like behavior)
    readcacheReadFile?: boolean; // default: false
}
