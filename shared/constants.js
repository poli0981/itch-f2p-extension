// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Shared constants & configuration.
 * Single source of truth for URLs, limits, defaults, and field definitions.
 *
 * Key differences from Steam extension:
 *   - URL pattern: {creator}.itch.io/{slug} (no numeric appid)
 *   - Data format: JSON array (not JSONL)
 *   - Repo paths: game_info.json, temp_link.json
 *   - Fields: NSFW, made_with, rating, avg_session, inputs (no anti_cheat)
 */

// ── GitHub API ──
export const GITHUB_API_BASE = "https://api.github.com";

// ── Repository paths ──
export const REPO_DATA_DIR        = "data_game";
export const REPO_INDEX_PATH      = "data_game/index.json";
export const DATA_FILE_MAX_ENTRIES = 500;
export const DATA_FILE_PREFIX     = "game_info_";
export const REPO_TEMP_PATH       = "scripts/temp_link.json";

// ── itch.io ──
// Game page URL pattern: https://{creator}.itch.io/{slug}
export const ITCH_GAME_URL_RE = /^https:\/\/([a-z0-9-]+)\.itch\.io\/([a-z0-9-]+)\/?$/i;
// Broader match for extraction (allows query/fragment)
export const ITCH_URL_EXTRACT_RE = /https:\/\/([a-z0-9-]+)\.itch\.io\/([a-z0-9-]+)/i;

// ── Queue limits ──
export const QUEUE_MAX = 150;

// ── Logging ──
export const LOG_LEVELS = ["debug", "info", "warn", "error"];
export const LOG_MAX_DEFAULT = 500;

// ── Auto-detected fields (read-only in queue UI) ──
export const AUTO_FIELDS = {
    description:     { label: "Description",     type: "text" },
    release_date:    { label: "Release Date",    type: "text" },
    dev:             { label: "Developer",       type: "text" },
    publisher:       { label: "Publisher",        type: "text" },
    status:          { label: "Status",          type: "text" },
    rating:          { label: "Rating",          type: "text" },
    rating_count:    { label: "Rating Count",    type: "text" },
    average_session: { label: "Avg Session",     type: "text" },
    nsfw:            { label: "NSFW",            type: "text" },
    // Multi-value (arrays)
    tags:            { label: "Tags",            type: "list" },
    platforms:       { label: "Platforms",        type: "list" },
    languages:       { label: "Languages",       type: "list" },
    inputs:          { label: "Inputs",          type: "list" },
    made_with:       { label: "Made With",       type: "list" },
    thumbnail:       { label: "Thumbnail",       type: "text" },
};

// ── Editable fields (user can modify in queue UI) ──
export const EDITABLE_FIELDS = {
    genre:      { label: "Genre",  type: "tag-select", placeholder: "Select or type genre...", default: "" },
    safe_virus: { label: "Safe",   type: "select", options: ["?", "yes", "no"], default: "?" },
    notes:      { label: "Notes",  type: "text",   placeholder: "Any notes...", default: "" },
};

// ── Genre preset list (common itch.io genres) ──
export const GENRE_PRESETS = [
    "Action", "Adventure", "RPG", "Strategy", "Simulation",
    "Puzzle", "Platformer", "Shooter", "Fighting", "Survival",
    "Horror", "Visual Novel", "Interactive Fiction", "Card Game",
    "Racing", "Rhythm", "Sports", "Educational", "Tool",
    "Sandbox", "Roguelike", "Roguelite", "Metroidvania",
    "Tower Defense", "Point & Click", "Idle", "Clicker",
    "MMORPG", "Battle Royale",
];

// ── Storage keys ──
export const STORAGE_KEYS = {
    SETTINGS:       "settings",
    QUEUE:          "queue",
    LOGS:           "logs",
    CACHE_URLS:     "cache:urls",
    GPG_KEY_ENC:    "gpg:key_encrypted",
    GPG_KEY_META:   "gpg:key_meta",
};

// ── Default settings ──
export const DEFAULT_SETTINGS = {
    // GitHub connection
    github_owner: "",
    github_repo: "",
    github_branch: "main",
    github_token: "",

    // Committer identity
    committer_name: "",
    committer_email: "",

    // GPG
    gpg_enabled: false,

    // Push
    auto_push_threshold: 0,
    commit_prefix: "ext:",
    push_format: "url_only",  // "url_only" | "full_object"

    // Cache
    cache_ttl_minutes: 5,

    // Logging
    log_level: "info",
    log_max_entries: 500,
};

// ── Message types ──
export const MSG = {
    GAME_DETECTED:       "GAME_DETECTED",
    GET_QUEUE:           "GET_QUEUE",
    ADD_TO_QUEUE:        "ADD_TO_QUEUE",
    REMOVE_FROM_QUEUE:   "REMOVE_FROM_QUEUE",
    UPDATE_ENTRY:        "UPDATE_ENTRY",
    PUSH_QUEUE:          "PUSH_QUEUE",
    GET_SETTINGS:        "GET_SETTINGS",
    SAVE_SETTINGS:       "SAVE_SETTINGS",
    CHECK_DUPLICATE:     "CHECK_DUPLICATE",
    GET_QUEUE_SIZE:      "GET_QUEUE_SIZE",
    GET_LOGS:            "GET_LOGS",
    EXPORT_LOGS:         "EXPORT_LOGS",
    CLEAR_LOGS:          "CLEAR_LOGS",
    RESET_EXTENSION:     "RESET_EXTENSION",
    REFRESH_CACHE:       "REFRESH_CACHE",
    GPG_IMPORT_KEY:      "GPG_IMPORT_KEY",
    GPG_VALIDATE_KEY:    "GPG_VALIDATE_KEY",
    GPG_GET_KEY_META:    "GPG_GET_KEY_META",
    GPG_REMOVE_KEY:      "GPG_REMOVE_KEY",
    PUSH_QUEUE_UNSIGNED: "PUSH_QUEUE_UNSIGNED",
};
