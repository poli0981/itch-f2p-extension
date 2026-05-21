// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Push serialization helpers — entry conversion, index I/O, file
 * distribution, JSON array merge, and commit-message construction.
 *
 * Extracted from push-handler.js (v1.9.1 refactor). Consumed by
 * push-strategies.js.
 */

import {
    DATA_FILE_MAX_ENTRIES,
    DATA_FILE_PREFIX,
    REPO_DATA_DIR,
    REPO_INDEX_PATH,
} from "../shared/constants.js";
import {logWarn} from "../shared/logger.js";
import {getFileContent} from "./github-api.js";

// ════════════════════════════════════════════════════════════
// Entry serialization
// ════════════════════════════════════════════════════════════

/**
 * Convert a queue entry to a full game_info.json-compatible object.
 * Mirrors the shape produced by scraper.py scrape_game_info().
 *
 * ALL fields are always included for consistent data processing:
 *   - Single-value fields: fallback to "N/A" if missing
 *   - Multi-value fields:  fallback to [] if missing
 *   - User-editable fields: always included with current value
 *
 * @param {object} entry - Queue entry
 * @returns {object} Object matching game_info.json schema
 */
export function toFullObject (entry) {
    return {
        // Single-value fields (strings — "N/A" if missing)
        url: entry.url || "N/A",
        name: entry.name || "N/A",
        dev: entry.dev || "N/A",
        description: entry.description || "N/A",
        genre: entry.genre || "N/A",
        status: entry.status || "N/A",
        publisher: entry.publisher || "N/A",
        release_date: entry.release_date || "N/A",
        rating: entry.rating || "N/A",
        rating_count: entry.rating_count || "N/A",
        average_session: entry.average_session || "N/A",
        nsfw: entry.nsfw || "No",
        thumbnail: entry.thumbnail || "N/A",

        // Multi-value fields (arrays — [] if missing)
        tags: Array.isArray (entry.tags) ? entry.tags : [],
        platforms: Array.isArray (entry.platforms) ? entry.platforms : [],
        languages: Array.isArray (entry.languages) ? entry.languages : [],
        inputs: Array.isArray (entry.inputs) ? entry.inputs : [],
        made_with: Array.isArray (entry.made_with) ? entry.made_with : [],

        // User-editable fields — always included
        safe_virus: entry.safe_virus || "?",
        notes: (
            entry.notes || ""
        ).trim (),
    };
}

// ════════════════════════════════════════════════════════════
// Index & file-splitting helpers
// ════════════════════════════════════════════════════════════

/**
 * Generate a zero-padded data file name.
 * @param {number} num - File number (1-based)
 * @returns {string} e.g. "game_info_001.json"
 */
function dataFileName (num) {
    return `${DATA_FILE_PREFIX}${String (num).padStart (3, "0")}.json`;
}

/**
 * Read the index file from the repo. Returns default if missing.
 * @returns {Promise<{data: object, raw: string|null}>}
 */
export async function readIndex () {
    try {
        const file = await getFileContent (REPO_INDEX_PATH, {
            useCache: false,
            allowMissing: true,
        });
        if (file && file.content && file.content.trim ()) {
            const data = JSON.parse (file.content.trim ());
            return {data};
        }
    }
    catch (err) {
        if (err.type === "auth") throw err;
        await logWarn ("push", `Could not read index.json: ${err.message || err}`);
    }
    return {data: {max_per_file: DATA_FILE_MAX_ENTRIES, files: []}};
}

/**
 * Distribute new entries across data files respecting the max-per-file limit.
 *
 * @param {object} indexData - Current index.json content
 * @param {object[]} newEntries - Serialized entries to push
 * @returns {{fileOps: Array<{path: string, entries: object[], isNew: boolean}>, updatedIndex: object}}
 */
export function distributeEntries (indexData, newEntries) {
    const maxPerFile = indexData.max_per_file || DATA_FILE_MAX_ENTRIES;
    const files = [...(
        indexData.files || []
    )];
    const fileOps = [];

    const remaining = [...newEntries];

    // If no files exist yet, seed the first one
    if (files.length === 0) {
        files.push ({name: dataFileName (1), count: 0});
    }

    while (remaining.length > 0) {
        const current = files[files.length - 1];
        const space = maxPerFile - current.count;

        if (space > 0) {
            const batch = remaining.splice (0, space);
            fileOps.push ({
                path: `${REPO_DATA_DIR}/${current.name}`,
                entries: batch,
                isNew: current.count === 0,
            });
            current.count += batch.length;
        }

        // Still entries left → create next file
        if (remaining.length > 0) {
            const nextNum = files.length + 1;
            const newFile = {name: dataFileName (nextNum), count: 0};
            files.push (newFile);
        }
    }

    return {
        fileOps,
        updatedIndex: {max_per_file: maxPerFile, files},
    };
}

// ════════════════════════════════════════════════════════════
// Merge & commit message
// ════════════════════════════════════════════════════════════

/**
 * Merge new entries into existing JSON array.
 *
 * @param {string} existing - Current file content (JSON array string)
 * @param {Array} newEntries - New entries to append
 * @returns {string} Merged JSON string
 */
export function mergeJsonArray (existing, newEntries) {
    let currentArray = [];

    if (existing && existing.trim ()) {
        try {
            currentArray = JSON.parse (existing.trim ());
            if (!Array.isArray (currentArray)) {
                currentArray = [];
            }
        }
        catch {
            currentArray = [];
        }
    }

    const merged = [...currentArray, ...newEntries];
    return JSON.stringify (merged, null, 4) + "\n";
}

/**
 * Build the commit message for a push.
 * @param {number} count - Number of games pushed
 * @param {string} prefix - Commit message prefix (settings.commit_prefix)
 * @param {string} format - "full_object" | "url_only"
 * @returns {string}
 */
export function buildCommitMessage (count, prefix, format) {
    const date = new Date ().toISOString ().slice (0, 10);
    const target = format === "full_object" ? "game_info" : "temp_link";
    return `${prefix} add ${count} game(s) to ${target} [${date}]`;
}
