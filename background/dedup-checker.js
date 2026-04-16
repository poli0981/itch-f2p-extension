// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Deduplication checker for itch.io.
 *
 * Key differences from Steam extension:
 *   - Steam: dedup key = numeric appid, source = JSONL files
 *   - itch.io: dedup key = normalized URL, source = JSON files
 *   - game_info.json: array of objects with "url" field
 *   - temp_link.json: array of URL strings OR objects with "url" field
 */

import {REPO_DATA_DIR, REPO_INDEX_PATH, REPO_TEMP_PATH} from "../shared/constants.js";
import {loadCachedUrls, loadQueue, loadSettings, saveCachedUrls} from "../shared/storage.js";
import {normalizeUrl} from "../shared/utils.js";
import {logDebug, logInfo, logWarn} from "../shared/logger.js";
import {getFileContent} from "./github-api.js";

let cachedSet = null;
let cachedAt = 0;

/**
 * Extract all URLs from a JSON string.
 * Handles both formats:
 *   - Array of strings: ["https://dev.itch.io/game"]
 *   - Array of objects:  [{"url": "https://dev.itch.io/game", ...}]
 *
 * @param {string} jsonContent - Raw JSON file content
 * @returns {string[]} Array of normalized URL strings
 */
function extractUrlsFromJSON (jsonContent) {
    if (!jsonContent || !jsonContent.trim ()) return [];

    try {
        const parsed = JSON.parse (jsonContent.trim ());
        if (!Array.isArray (parsed)) return [];

        const urls = [];
        for (const item of parsed) {
            let rawUrl;
            if (typeof item === "string") {
                rawUrl = item;
            }
            else if (typeof item === "object" && item !== null) {
                rawUrl = item.url || "";
            }
            else {
                continue;
            }

            const normalized = normalizeUrl (rawUrl);
            if (normalized) {
                urls.push (normalized);
            }
        }
        return urls;
    }
    catch {
        return [];
    }
}

/**
 * Fetch all known URLs from the remote repository.
 *
 * Data files are stored as data_game/game_info_001.json, _002.json, etc.
 * The file list is read from data_game/index.json.
 * temp_link.json remains at scripts/temp_link.json.
 */
export async function fetchRemoteUrls (forceRefresh = false) {
    const settings = await loadSettings ();
    const ttlMs = (
                      settings.cache_ttl_minutes || 5
                  ) * 60 * 1000;

    // In-memory cache
    if (!forceRefresh && cachedSet && Date.now () - cachedAt < ttlMs) {
        await logDebug ("dedup", `Using cached URL set (${cachedSet.size} entries)`);
        return cachedSet;
    }

    // Storage cache
    if (!forceRefresh) {
        const stored = await loadCachedUrls ();
        if (stored && stored.fetched_at) {
            const age = Date.now () - new Date (stored.fetched_at).getTime ();
            if (age < ttlMs) {
                cachedSet = new Set (stored.urls);
                cachedAt = Date.now ();
                await logDebug ("dedup", `Loaded URL set from storage (${cachedSet.size} entries)`);
                return cachedSet;
            }
        }
    }

    await logInfo ("dedup", "Fetching remote data for deduplication...");

    const allUrls = [];

    // 1) Read data_game/index.json → fetch each data file
    try {
        const indexFile = await getFileContent (REPO_INDEX_PATH, {
            useCache: !forceRefresh,
            allowMissing: true,
        });
        if (indexFile && indexFile.content.trim ()) {
            const indexData = JSON.parse (indexFile.content.trim ());
            const fileList = indexData.files || [];

            // Fetch all data files in parallel
            const fetches = fileList.map ((f) =>
                getFileContent (`${REPO_DATA_DIR}/${f.name}`, {
                    useCache: !forceRefresh,
                    allowMissing: true,
                }).catch ((err) => {
                    logWarn ("dedup", `Failed to fetch ${f.name}: ${err.message || err}`);
                    return null;
                }),
            );

            const results = await Promise.all (fetches);
            for (let i = 0; i < results.length; i++) {
                if (results[i] && results[i].content) {
                    const urls = extractUrlsFromJSON (results[i].content);
                    allUrls.push (...urls);
                    await logDebug ("dedup", `${fileList[i].name}: ${urls.length} URLs`);
                }
            }
        }
    }
    catch (err) {
        if (err.type === "auth") throw err;
        await logWarn ("dedup", `Failed to read index.json: ${err.message || err}`);
    }

    // 2) temp_link.json — pending queue
    try {
        const tempFile = await getFileContent (REPO_TEMP_PATH, {
            useCache: !forceRefresh,
            allowMissing: true,
        });
        if (tempFile && tempFile.content.trim ()) {
            const urls = extractUrlsFromJSON (tempFile.content);
            allUrls.push (...urls);
            await logDebug ("dedup", `temp_link.json: ${urls.length} URLs`);
        }
    }
    catch (err) {
        await logWarn ("dedup", `Failed to fetch temp_link.json: ${err.message || err}`);
    }

    cachedSet = new Set (allUrls);
    cachedAt = Date.now ();

    await saveCachedUrls (Array.from (cachedSet));

    await logInfo ("dedup", `Dedup cache refreshed: ${cachedSet.size} known URLs`);
    return cachedSet;
}

/**
 * Check if a URL is a duplicate.
 *
 * @param {string} gameUrl - itch.io game URL to check
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<{isDuplicate: boolean, source: string|null}>}
 */
export async function checkDuplicate (gameUrl, forceRefresh = false) {
    const normalized = normalizeUrl (gameUrl);
    if (!normalized) {
        return {isDuplicate: false, source: null};
    }

    // 1) Check local queue first
    const queue = await loadQueue ();
    const inQueue = queue.some ((g) => normalizeUrl (g.url) === normalized);
    if (inQueue) {
        return {isDuplicate: true, source: "queue"};
    }

    // 2) Check remote data
    try {
        const remoteSet = await fetchRemoteUrls (forceRefresh);
        if (remoteSet.has (normalized)) {
            return {isDuplicate: true, source: "remote"};
        }
    }
    catch (err) {
        await logWarn ("dedup", `Remote dedup check failed: ${err.message || err}. Allowing add.`);
    }

    return {isDuplicate: false, source: null};
}

export async function refreshDedupCache () {
    const set = await fetchRemoteUrls (true);
    return set.size;
}

export function clearDedupCache () {
    cachedSet = null;
    cachedAt = 0;
}
