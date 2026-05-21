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
 *
 * Serialization helpers live in push-serialize.js; the concrete push
 * strategies + dispatcher (executePush) live in push-strategies.js.
 */

import {loadQueue, loadSettings, saveQueue} from "../shared/storage.js";
import {extractGameId} from "../shared/utils.js";
import {logError, logInfo, logWarn} from "../shared/logger.js";
import {refreshDedupCache} from "./dedup-checker.js";
import {dedupeQueueAgainstRemote} from "./queue-manager.js";
import {executePush} from "./push-strategies.js";

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
