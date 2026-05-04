// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Push handler – orchestrates pushing queue entries to GitHub.
 *
 * Two push modes determined by settings.push_format:
 *
 *   "url_only" (default)
 *     → Appends URL strings to scripts/temp_link.json
 *     → Backend update_info.py scrapes full metadata later
 *     → Lightweight, minimal data in commit
 *
 *   "full_object"
 *     → Appends full game objects to data_game/game_info_XXX.json
 *     → Files are split at DATA_FILE_MAX_ENTRIES (500) entries each
 *     → data_game/index.json tracks file list and entry counts
 *     → Always uses Git Database API for atomic multi-file commits
 *
 * Both paths support unsigned and signed (GPG) commits.
 * Merge strategy: JSON.parse existing → concat new → JSON.stringify
 */

import {
    DATA_FILE_MAX_ENTRIES,
    DATA_FILE_PREFIX,
    REPO_DATA_DIR,
    REPO_INDEX_PATH,
    REPO_TEMP_PATH,
} from "../shared/constants.js";
import {loadQueue, loadSettings, saveQueue} from "../shared/storage.js";
import {extractGameId} from "../shared/utils.js";
import {logError, logInfo, logWarn} from "../shared/logger.js";
import {
    createBlob,
    createSignedCommit,
    createTree,
    createUnsignedCommit,
    getFileContent,
    getHeadCommit,
    invalidatePath,
    putFileContent,
    updateRef,
} from "./github-api.js";
import {refreshDedupCache} from "./dedup-checker.js";
import {dedupeQueueAgainstRemote} from "./queue-manager.js";
import {buildCommitPayload, getKeyMeta, isSigningAvailable, signCommitPayload} from "./gpg-signer.js";

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
function toFullObject (entry) {
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
async function readIndex () {
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
function distributeEntries (indexData, newEntries) {
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
// Merge helper
// ════════════════════════════════════════════════════════════

/**
 * Merge new entries into existing JSON array.
 *
 * @param {string} existing - Current file content (JSON array string)
 * @param {Array} newEntries - New entries to append
 * @returns {string} Merged JSON string
 */
function mergeJsonArray (existing, newEntries) {
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

// ════════════════════════════════════════════════════════════
// Push: full_object (multi-file via Git Database API)
// ════════════════════════════════════════════════════════════

/**
 * Execute a full_object push using Git Database API.
 * Handles multi-file commits (data files + index.json) atomically.
 * Works for both signed and unsigned commits.
 */
async function executeFullObjectPush (entries, settings, signed) {
    const commitMsg = buildCommitMessage (entries.length, settings.commit_prefix || "ext:", "full_object");
    const serialized = entries.map ((e) => toFullObject (e));

    // 1. Read current index
    const {data: indexData} = await readIndex ();

    // 2. Distribute entries across files
    const {fileOps, updatedIndex} = distributeEntries (indexData, serialized);

    // 3. Build blobs for each data file
    const blobEntries = [];

    for (const op of fileOps) {
        let existingContent = "";
        if (!op.isNew) {
            try {
                const file = await getFileContent (op.path, {useCache: false, allowMissing: true});
                if (file) existingContent = file.content;
            }
            catch (err) {
                if (err.type === "auth") throw err;
                await logWarn ("push", `Could not fetch ${op.path}: ${err.message}. Treating as new.`);
            }
        }

        const merged = mergeJsonArray (existingContent, op.entries);
        const blobSha = await createBlob (merged);
        blobEntries.push ({path: op.path, blobSha});
    }

    // 4. Blob for updated index.json
    const indexContent = JSON.stringify (updatedIndex, null, 4) + "\n";
    const indexBlobSha = await createBlob (indexContent);
    blobEntries.push ({path: REPO_INDEX_PATH, blobSha: indexBlobSha});

    // 5. Create tree with all file changes
    const head = await getHeadCommit ();
    const treeSha = await createTree (head.treeSha, blobEntries);

    // 6. Create commit (signed or unsigned)
    const now = new Date ();
    const unixTimestamp = Math.floor (now.getTime () / 1000);
    const isoDate = new Date (unixTimestamp * 1000).toISOString ();

    const committerName = settings.committer_name || "itch-f2p-ext[bot]";
    const authorName = "itch-f2p-ext[bot]";
    let committerEmail, authorEmail;

    if (signed) {
        const keyMeta = await getKeyMeta ();
        const keyEmail = keyMeta?.userIDs?.[0]?.match (/<(.+?)>/)?.[1] || "";
        committerEmail = keyEmail || settings.committer_email || "noreply@github.com";
        authorEmail = settings.committer_email || committerEmail;
    }
    else {
        committerEmail = settings.committer_email || "noreply@github.com";
        authorEmail = committerEmail;
    }

    let commitSha;

    if (signed) {
        const payload = buildCommitPayload ({
            treeSha,
            parentSha: head.sha,
            authorName,
            authorEmail,
            committerName,
            committerEmail,
            message: commitMsg,
            timestamp: unixTimestamp,
        });

        const signResult = await signCommitPayload (payload);
        if (!signResult.ok) {
            throw {type: "gpg_failed", message: signResult.error};
        }

        commitSha = await createSignedCommit ({
            treeSha,
            parentSha: head.sha,
            message: commitMsg,
            signature: signResult.signature,
            authorName,
            authorEmail,
            committerName,
            committerEmail,
            date: isoDate,
        });
    }
    else {
        commitSha = await createUnsignedCommit ({
            treeSha,
            parentSha: head.sha,
            message: commitMsg,
            authorName,
            authorEmail,
            committerName,
            committerEmail,
            date: isoDate,
        });
    }

    await updateRef (commitSha);

    // Invalidate cache for all touched paths
    for (const op of fileOps) {
        await invalidatePath (op.path);
    }
    await invalidatePath (REPO_INDEX_PATH);

    // Detailed per-file breakdown so the UI can show progress feedback
    // (e.g. "Pushed 8 games to 2 files: game_info_003.json +5, game_info_004.json +3")
    const files = fileOps.map ((op) => ({
        name: op.path.split ("/").pop (),
        added: op.entries.length,
        isNew: op.isNew,
    }));

    return {ok: true, commitSha, signed, targetPath: REPO_INDEX_PATH, files};
}

// ════════════════════════════════════════════════════════════
// Push: url_only (single file via Contents API — unchanged)
// ════════════════════════════════════════════════════════════

async function executeUrlOnlyUnsignedPush (entries, settings) {
    const targetPath = REPO_TEMP_PATH;
    const newEntries = entries.map ((e) => e.url);
    const commitMsg = buildCommitMessage (entries.length, settings.commit_prefix || "ext:", "url_only");

    let existingContent = "";
    let existingSha = null;

    try {
        const file = await getFileContent (targetPath, {useCache: false, allowMissing: true});
        if (file) {
            existingContent = file.content;
            existingSha = file.sha;
        }
    }
    catch (err) {
        if (err.type === "auth") throw err;
        await logWarn ("push", `Could not fetch ${targetPath}: ${err.message}. Will create new.`);
    }

    const merged = mergeJsonArray (existingContent, newEntries);
    const result = await putFileContent (targetPath, merged, existingSha, commitMsg);

    return {ok: true, commitSha: result.commitSha, targetPath};
}

async function executeUrlOnlySignedPush (entries, settings) {
    const targetPath = REPO_TEMP_PATH;
    const newEntries = entries.map ((e) => e.url);
    const commitMsg = buildCommitMessage (entries.length, settings.commit_prefix || "ext:", "url_only");

    const keyMeta = await getKeyMeta ();
    const keyEmail = keyMeta?.userIDs?.[0]?.match (/<(.+?)>/)?.[1] || "";

    const committerName = settings.committer_name || "itch-f2p-ext";
    const committerEmail = keyEmail || settings.committer_email || "noreply@github.com";
    const authorName = "itch-f2p-ext[bot]";
    const authorEmail = settings.committer_email || committerEmail;

    let existingContent = "";
    try {
        const file = await getFileContent (targetPath, {useCache: false, allowMissing: true});
        if (file) existingContent = file.content;
    }
    catch (err) {
        if (err.type === "auth") throw err;
        await logWarn ("push", `Could not fetch ${targetPath}: ${err.message}`);
    }

    const merged = mergeJsonArray (existingContent, newEntries);

    const head = await getHeadCommit ();
    const blobSha = await createBlob (merged);
    const treeSha = await createTree (head.treeSha, targetPath, blobSha);

    const now = new Date ();
    const unixTimestamp = Math.floor (now.getTime () / 1000);
    const isoDate = new Date (unixTimestamp * 1000).toISOString ();

    const payload = buildCommitPayload ({
        treeSha,
        parentSha: head.sha,
        authorName,
        authorEmail,
        committerName,
        committerEmail,
        message: commitMsg,
        timestamp: unixTimestamp,
    });

    const signResult = await signCommitPayload (payload);
    if (!signResult.ok) {
        throw {type: "gpg_failed", message: signResult.error};
    }

    const commitSha = await createSignedCommit ({
        treeSha,
        parentSha: head.sha,
        message: commitMsg,
        signature: signResult.signature,
        authorName,
        authorEmail,
        committerName,
        committerEmail,
        date: isoDate,
    });

    await updateRef (commitSha);

    return {ok: true, commitSha, signed: true, targetPath};
}

// ════════════════════════════════════════════════════════════
// Dispatch
// ════════════════════════════════════════════════════════════

function buildCommitMessage (count, prefix, format) {
    const date = new Date ().toISOString ().slice (0, 10);
    const target = format === "full_object" ? "game_info" : "temp_link";
    return `${prefix} add ${count} game(s) to ${target} [${date}]`;
}

async function executePush (entries, settings) {
    const format = settings.push_format || "url_only";

    if (format === "full_object") {
        const signed = settings.gpg_enabled && await isSigningAvailable ();
        return executeFullObjectPush (entries, settings, signed);
    }

    // url_only
    if (settings.gpg_enabled && await isSigningAvailable ()) {
        return executeUrlOnlySignedPush (entries, settings);
    }
    return executeUrlOnlyUnsignedPush (entries, settings);
}

// ════════════════════════════════════════════════════════════
// Public API
// ════════════════════════════════════════════════════════════

export async function pushQueue (opts = {}) {
    const settings = await loadSettings ();

    if (!settings.github_owner || !settings.github_repo || !settings.github_token) {
        return {ok: false, pushed: 0, error: "GitHub not configured — check Settings"};
    }

    const initialQueue = await loadQueue ();
    if (initialQueue.length === 0) {
        return {ok: false, pushed: 0, error: "Queue is empty"};
    }

    // Pre-push dedup (always on for data integrity, regardless of auto_dedup_queue setting)
    const preDedup = await dedupeQueueAgainstRemote ({forceRefresh: true, trigger: "pre_push"});
    if (!preDedup.ok && !preDedup.skipped) {
        await logWarn ("push", `Pre-push dedup error: ${preDedup.error || "unknown"}`);
        // proceed anyway — fail-open: don't block push due to dedup network issues
    }

    const queue = await loadQueue ();
    if (queue.length === 0) {
        return {
            ok: false,
            pushed: 0,
            deduped: preDedup.removed || 0,
            error: preDedup.removed > 0
                   ? `All ${preDedup.removed} entries already in remote — nothing to push`
                   : "Queue is empty",
        };
    }

    let toPush, toKeep;
    if (opts.urls && opts.urls.length > 0) {
        const pushSet = new Set (opts.urls);
        toPush = queue.filter ((g) => pushSet.has (extractGameId (g.url)));
        toKeep = queue.filter ((g) => !pushSet.has (extractGameId (g.url)));
    }
    else {
        toPush = [...queue];
        toKeep = [];
    }

    if (toPush.length === 0) {
        return {
            ok: false,
            pushed: 0,
            deduped: preDedup.removed || 0,
            error: preDedup.removed > 0
                   ? `Selected entries already in remote (${preDedup.removed} auto-removed)`
                   : "No matching entries found",
        };
    }

    await logInfo ("push", `Pushing ${toPush.length} game(s) to ${settings.github_owner}/${settings.github_repo}...`);

    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
        attempts++;
        try {
            const result = await executePush (toPush, settings);

            if (result.ok) {
                await saveQueue (toKeep);
                refreshDedupCache ()
                    .then (async () => {
                        // Post-push auto-dedup (cache just refreshed → no need forceRefresh again)
                        try {
                            const s = await loadSettings ();
                            if (s.auto_dedup_queue) {
                                await dedupeQueueAgainstRemote ({forceRefresh: false, trigger: "post_push"});
                            }
                        }
                        catch {/* fire-and-forget */}
                    })
                    .catch (() => {});

                const signedLabel = result.signed ? " (GPG signed)" : "";
                const format = settings.push_format || "url_only";
                const targetLabel = format === "full_object" ? "data_game/" : "temp_link.json";
                await logInfo ("push", `Successfully pushed ${toPush.length} game(s)${signedLabel} → ${targetLabel}`, {
                    commitSha: result.commitSha,
                    remaining: toKeep.length,
                    signed: !!result.signed,
                    target: targetLabel,
                    deduped: preDedup.removed || 0,
                });

                return {
                    ok: true,
                    pushed: toPush.length,
                    commitSha: result.commitSha,
                    remaining: toKeep.length,
                    signed: !!result.signed,
                    target: targetLabel,
                    files: result.files || [],
                    deduped: preDedup.removed || 0,
                };
            }
        }
        catch (err) {
            if (err.type === "conflict" && attempts < maxAttempts) {
                await logWarn ("push", "SHA conflict — retrying with fresh SHA...");
                continue;
            }

            if (err.type === "gpg_failed") {
                return {
                    ok: false, pushed: 0,
                    error: err.message || "GPG signing failed",
                    gpgFailed: true,
                };
            }

            await logError ("push", `Push failed: ${err.message || JSON.stringify (err)}`, {
                type: err.type, status: err.status, attempt: attempts,
            });

            return {
                ok: false, pushed: 0,
                error: err.message || "Push failed — check logs for details",
            };
        }
    }

    return {ok: false, pushed: 0, error: "Push failed after all retries"};
}

export async function pushQueueUnsigned (opts = {}) {
    const settings = await loadSettings ();
    const overridden = {...settings, gpg_enabled: false};

    const initialQueue = await loadQueue ();
    if (initialQueue.length === 0) {
        return {ok: false, pushed: 0, error: "Queue is empty"};
    }

    // Pre-push dedup (always on for data integrity)
    const preDedup = await dedupeQueueAgainstRemote ({forceRefresh: true, trigger: "pre_push"});
    if (!preDedup.ok && !preDedup.skipped) {
        await logWarn ("push", `Pre-push dedup error: ${preDedup.error || "unknown"}`);
    }

    const queue = await loadQueue ();
    if (queue.length === 0) {
        return {
            ok: false,
            pushed: 0,
            deduped: preDedup.removed || 0,
            error: preDedup.removed > 0
                   ? `All ${preDedup.removed} entries already in remote — nothing to push`
                   : "Queue is empty",
        };
    }

    let toPush, toKeep;
    if (opts.urls && opts.urls.length > 0) {
        const pushSet = new Set (opts.urls);
        toPush = queue.filter ((g) => pushSet.has (extractGameId (g.url)));
        toKeep = queue.filter ((g) => !pushSet.has (extractGameId (g.url)));
    }
    else {
        toPush = [...queue];
        toKeep = [];
    }

    if (toPush.length === 0) {
        return {
            ok: false,
            pushed: 0,
            deduped: preDedup.removed || 0,
            error: preDedup.removed > 0
                   ? `Selected entries already in remote (${preDedup.removed} auto-removed)`
                   : "No matching entries found",
        };
    }

    await logInfo ("push", `Pushing ${toPush.length} game(s) unsigned (GPG fallback)...`);

    try {
        const result = await executePush (toPush, overridden);
        if (result.ok) {
            await saveQueue (toKeep);
            refreshDedupCache ()
                .then (async () => {
                    try {
                        const s = await loadSettings ();
                        if (s.auto_dedup_queue) {
                            await dedupeQueueAgainstRemote ({forceRefresh: false, trigger: "post_push"});
                        }
                    }
                    catch {/* fire-and-forget */}
                })
                .catch (() => {});

            const format = overridden.push_format || "url_only";
            const targetLabel = format === "full_object" ? "data_game/" : "temp_link.json";
            await logInfo ("push", `Pushed ${toPush.length} game(s) unsigned → ${targetLabel}`, {
                commitSha: result.commitSha,
                target: targetLabel,
                deduped: preDedup.removed || 0,
            });

            return {
                ok: true,
                pushed: toPush.length,
                commitSha: result.commitSha,
                remaining: toKeep.length,
                signed: false,
                deduped: preDedup.removed || 0,
            };
        }
    }
    catch (err) {
        await logError ("push", `Unsigned push failed: ${err.message || err}`);
        return {ok: false, pushed: 0, error: err.message || "Push failed"};
    }

    return {ok: false, pushed: 0, error: "Push failed"};
}
