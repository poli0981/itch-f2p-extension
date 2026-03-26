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
 *     → Appends full game objects directly to scripts/game_info.json
 *     → Skips temp_link.json entirely — no backend re-scrape needed
 *     → Richer data in commit, immediate availability
 *
 * Both paths support unsigned (Contents API) and signed (Git Database API).
 * Merge strategy: JSON.parse existing → concat new → JSON.stringify
 */

import {REPO_DATA_PATH, REPO_TEMP_PATH} from "../shared/constants.js";
import {loadQueue, loadSettings, saveQueue} from "../shared/storage.js";
import {extractGameId} from "../shared/utils.js";
import {logError, logInfo, logWarn} from "../shared/logger.js";
import {
    createBlob,
    createSignedCommit,
    createTree,
    getFileContent,
    getHeadCommit,
    invalidatePath,
    putFileContent,
    updateRef,
} from "./github-api.js";
import {refreshDedupCache} from "./dedup-checker.js";
import {buildCommitPayload, getKeyMeta, isSigningAvailable, signCommitPayload} from "./gpg-signer.js";

// ════════════════════════════════════════════════════════════
// Entry serialization
// ════════════════════════════════════════════════════════════

/**
 * Convert a queue entry to a full game_info.json-compatible object.
 * Mirrors the shape produced by scraper.py scrape_game_info().
 * Fields with N/A or empty values are preserved (matches scraper output).
 *
 * @param {object} entry - Queue entry
 * @returns {object} Object matching game_info.json schema
 */
function toFullObject (entry) {
    const obj = {};
    if (entry.url) obj.url = entry.url;
    if (entry.name) obj.name = entry.name;
    if (entry.dev) obj.dev = entry.dev;
    if (entry.description) obj.description = entry.description;
    if (entry.genre) obj.genre = entry.genre;
    if (entry.tags) obj.tags = entry.tags;
    if (entry.status) obj.status = entry.status;
    if (entry.platforms) obj.platforms = entry.platforms;
    if (entry.publisher) obj.publisher = entry.publisher;
    if (entry.release_date) obj.release_date = entry.release_date;
    if (entry.made_with) obj.made_with = entry.made_with;
    if (entry.rating) obj.rating = entry.rating;
    if (entry.rating_count) obj.rating_count = entry.rating_count;
    if (entry.average_session) obj.average_session = entry.average_session;
    if (entry.languages) obj.languages = entry.languages;
    if (entry.inputs) obj.inputs = entry.inputs;
    if (entry.nsfw) obj.nsfw = entry.nsfw;
    if (entry.thumbnail) obj.thumbnail = entry.thumbnail;
    if (entry.safe_virus && entry.safe_virus !== "?") obj.safe_virus = entry.safe_virus;
    if (entry.notes && entry.notes.trim ()) obj.notes = entry.notes.trim ();
    return obj;
}

/**
 * Resolve target file path based on push format.
 *
 * @param {string} format - "url_only" | "full_object"
 * @returns {string} Repository file path
 */
function resolveTargetPath (format) {
    return format === "full_object" ? REPO_DATA_PATH : REPO_TEMP_PATH;
}

/**
 * Serialize queue entries for the target format.
 *
 * @param {object[]} entries - Queue entries
 * @param {string} format - "url_only" | "full_object"
 * @returns {Array} Array of URL strings or full objects
 */
function serializeEntries (entries, format) {
    if (format === "full_object") {
        return entries.map ((e) => toFullObject (e));
    }
    return entries.map ((e) => e.url);
}

/**
 * Build commit message with format-specific target info.
 */
function buildCommitMessage (count, prefix, format) {
    const date = new Date ().toISOString ()
                            .slice (0, 10);
    const target = format === "full_object" ? "game_info" : "temp_link";
    return `${prefix} add ${count} game(s) to ${target} [${date}]`;
}

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
// Push execution paths
// ════════════════════════════════════════════════════════════

async function executeUnsignedPush (entries, settings) {
    const format = settings.push_format || "url_only";
    const targetPath = resolveTargetPath (format);
    const newEntries = serializeEntries (entries, format);
    const commitMsg = buildCommitMessage (entries.length, settings.commit_prefix || "ext:", format);

    let existingContent = "";
    let existingSha = null;

    try {
        const file = await getFileContent (targetPath, {
            useCache: false,
            allowMissing: true,
        });
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

async function executeSignedPush (entries, settings) {
    const format = settings.push_format || "url_only";
    const targetPath = resolveTargetPath (format);
    const newEntries = serializeEntries (entries, format);
    const commitMsg = buildCommitMessage (entries.length, settings.commit_prefix || "ext:", format);

    const keyMeta = await getKeyMeta ();
    const keyEmail = keyMeta?.userIDs?.[0]?.match (/<(.+?)>/)?.[1] || "";

    const committerName = settings.committer_name || "itch-f2p-ext";
    const committerEmail = keyEmail || settings.committer_email || "noreply@github.com";
    const authorName = "itch-f2p-ext[bot]";
    const authorEmail = settings.committer_email || committerEmail;

    let existingContent = "";
    try {
        const file = await getFileContent (targetPath, {
            useCache: false,
            allowMissing: true,
        });
        if (file) {
            existingContent = file.content;
        }
    }
    catch (err) {
        if (err.type === "auth") throw err;
        await logWarn ("push", `Could not fetch ${targetPath} for signed push: ${err.message}`);
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

async function executePush (entries, settings) {
    if (settings.gpg_enabled && await isSigningAvailable ()) {
        return executeSignedPush (entries, settings);
    }
    return executeUnsignedPush (entries, settings);
}

// ════════════════════════════════════════════════════════════
// Public API
// ════════════════════════════════════════════════════════════

export async function pushQueue (opts = {}) {
    const settings = await loadSettings ();

    if (!settings.github_owner || !settings.github_repo || !settings.github_token) {
        return {ok: false, pushed: 0, error: "GitHub not configured \u2014 check Settings"};
    }

    const queue = await loadQueue ();
    if (queue.length === 0) {
        return {ok: false, pushed: 0, error: "Queue is empty"};
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
        return {ok: false, pushed: 0, error: "No matching entries found"};
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
                await invalidatePath (result.targetPath);
                refreshDedupCache ()
                    .catch (() => {});

                const signedLabel = result.signed ? " (GPG signed)" : "";
                const targetLabel = result.targetPath === REPO_DATA_PATH ? "game_info.json" : "temp_link.json";
                await logInfo ("push", `Successfully pushed ${toPush.length} game(s)${signedLabel} → ${targetLabel}`, {
                    commitSha: result.commitSha,
                    remaining: toKeep.length,
                    signed: !!result.signed,
                    target: targetLabel,
                });

                return {
                    ok: true,
                    pushed: toPush.length,
                    commitSha: result.commitSha,
                    remaining: toKeep.length,
                    signed: !!result.signed,
                    target: targetLabel,
                };
            }
        }
        catch (err) {
            if (err.type === "conflict" && attempts < maxAttempts) {
                await logWarn ("push", "SHA conflict \u2014 retrying with fresh SHA...");
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
                error: err.message || "Push failed \u2014 check logs for details",
            };
        }
    }

    return {ok: false, pushed: 0, error: "Push failed after all retries"};
}

export async function pushQueueUnsigned (opts = {}) {
    const settings = await loadSettings ();
    const overridden = {...settings, gpg_enabled: false};

    const queue = await loadQueue ();
    if (queue.length === 0) {
        return {ok: false, pushed: 0, error: "Queue is empty"};
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
        return {ok: false, pushed: 0, error: "No matching entries found"};
    }

    await logInfo ("push", `Pushing ${toPush.length} game(s) unsigned (GPG fallback)...`);

    try {
        const result = await executeUnsignedPush (toPush, overridden);
        if (result.ok) {
            await saveQueue (toKeep);
            await invalidatePath (result.targetPath);
            refreshDedupCache ()
                .catch (() => {});

            const targetLabel = result.targetPath === REPO_DATA_PATH ? "game_info.json" : "temp_link.json";
            await logInfo ("push", `Pushed ${toPush.length} game(s) unsigned → ${targetLabel}`, {
                commitSha: result.commitSha,
                target: targetLabel,
            });

            return {
                ok: true,
                pushed: toPush.length,
                commitSha: result.commitSha,
                remaining: toKeep.length,
                signed: false,
            };
        }
    }
    catch (err) {
        await logError ("push", `Unsigned push failed: ${err.message || err}`);
        return {ok: false, pushed: 0, error: err.message || "Push failed"};
    }

    return {ok: false, pushed: 0, error: "Push failed"};
}
