// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Service worker entry point.
 * Routes messages to handlers. All imports are static (MV3).
 *
 * Key differences from Steam extension:
 *   - Identity: uses normalized URL instead of appid
 *   - Remove/update: passes gameUrl instead of appid
 *   - No anti-cheat related handlers
 */

import {ITCH_GAME_URL_RE, MSG, QUEUE_MAX} from "../shared/constants.js";
import {invalidateSettingsCache, loadQueue, loadSettings, saveSettings, storageClearAll} from "../shared/storage.js";
import {clearLogs, exportLogsJSON, getLogs, logError, logInfo, logWarn} from "../shared/logger.js";
import {extractGameId} from "../shared/utils.js";
import {
    addToQueue,
    dedupeQueueAgainstRemote,
    getQueueSize,
    removeFromQueue,
    reorderQueue,
    updateEntry,
} from "./queue-manager.js";
import {checkDuplicate, clearDedupCache, refreshDedupCache} from "./dedup-checker.js";
import {pushQueue, pushQueueUnsigned} from "./push-handler.js";
import {clearCache as clearGitHubCache} from "./github-api.js";
import {getKeyMeta, importKey, removeKey, validateKey} from "./gpg-signer.js";

// ── Installation ──

chrome.runtime.onInstalled.addListener (async (details) => {
    if (details.reason === "install") {
        await logInfo ("settings", "Extension installed \u2014 ready for configuration");
    }
    else if (details.reason === "update") {
        await logInfo ("settings", `Extension updated to v${chrome.runtime.getManifest ().version}`);
    }
});

// ── Tab-level detected game cache ──
const detectedGames = new Map ();

chrome.tabs.onRemoved.addListener ((tabId) => {
    detectedGames.delete (tabId);
});

// ── Auto-collect serialization ──
// Chain promises so addToQueue calls from concurrent tabs don't race
// (load → push → save needs to be atomic per-extension).
let _autoCollectChain = Promise.resolve ();

function serializeAutoCollect (fn) {
    const next = _autoCollectChain.then (fn, fn);
    _autoCollectChain = next.catch (() => {}); // swallow so chain survives
    return next;
}

// ── Badge ──

async function updateBadge () {
    const size = await getQueueSize ();
    const text = size > 0 ? String (size) : "";
    chrome.action.setBadgeText ({text});
    chrome.action.setBadgeBackgroundColor ({color: size >= 150 ? "#E74C3C" : "#FA5C5C"});
}

// ── Auto-push ──

async function checkAutoPush () {
    try {
        const settings = await loadSettings ();
        const threshold = settings.auto_push_threshold || 0;
        if (threshold <= 0) return;

        const size = await getQueueSize ();
        if (size >= threshold) {
            await logInfo ("push", `Auto-push triggered: queue (${size}) reached threshold (${threshold})`);
            const result = await pushQueue ();
            if (result.ok) await updateBadge ();
        }
    }
    catch (err) {
        await logError ("push", `Auto-push check failed: ${err.message || err}`);
    }
}

// ── Message router ──

chrome.runtime.onMessage.addListener ((message, sender, sendResponse) => {
    handleMessage (message, sender)
        .then (sendResponse)
        .catch ((err) => {
            logError ("sw", `Message handler error: ${err.message}`, {type: message.type});
            sendResponse ({ok: false, error: err.message});
        });
    return true;
});

async function handleMessage (message, sender) {
    const {type, data} = message;

    switch (type) {
        // ── Content script: game detected ──
        case MSG.GAME_DETECTED: {
            const tabId = sender.tab?.id;
            if (tabId && data) detectedGames.set (tabId, data);
            return {ok: true};
        }

        // ── Content script: request auto-collect ──
        case MSG.REQUEST_AUTO_COLLECT: {
            return await handleAutoCollect (data);
        }

        // ── Popup: get detected game ──
        case "GET_DETECTED_GAME": {
            const tabId = data?.tabId;
            const game = tabId ? detectedGames.get (tabId) : null;
            return {ok: true, data: game || null};
        }

        // ── Queue operations ──
        case MSG.ADD_TO_QUEUE: {
            const result = await addToQueue (data);
            await updateBadge ();
            if (result.ok) checkAutoPush ();
            return result;
        }

        case MSG.REMOVE_FROM_QUEUE: {
            const result = await removeFromQueue (data?.url);
            await updateBadge ();
            return result;
        }

        case MSG.UPDATE_ENTRY: {
            return await updateEntry (data?.url, data?.fields);
        }

        case MSG.REORDER_QUEUE: {
            return await reorderQueue (data?.orderedUrls);
        }

        case MSG.GET_QUEUE: {
            const queue = await loadQueue ();
            return {ok: true, data: queue};
        }

        case MSG.GET_QUEUE_SIZE: {
            const size = await getQueueSize ();
            return {ok: true, data: size};
        }

        // ── Push ──
        case MSG.PUSH_QUEUE: {
            const result = await pushQueue (data || {});
            await updateBadge ();
            return result;
        }

        case MSG.PUSH_QUEUE_UNSIGNED: {
            const result = await pushQueueUnsigned (data || {});
            await updateBadge ();
            return result;
        }

        // ── GPG ──
        case MSG.GPG_VALIDATE_KEY: {
            const result = await validateKey (data?.armoredKey);
            return {ok: true, data: result};
        }

        case MSG.GPG_IMPORT_KEY: {
            return await importKey (data?.armoredKey, data?.passphrase);
        }

        case MSG.GPG_GET_KEY_META: {
            const meta = await getKeyMeta ();
            return {ok: true, data: meta};
        }

        case MSG.GPG_REMOVE_KEY: {
            await removeKey ();
            return {ok: true};
        }

        // ── Duplicate check ──
        case MSG.CHECK_DUPLICATE: {
            const gameUrl = data?.url;
            if (!gameUrl) return {ok: true, data: {isDuplicate: false, source: null}};
            try {
                const dup = await checkDuplicate (gameUrl);
                return {ok: true, data: dup};
            }
            catch {
                const queue = await loadQueue ();
                const gameId = extractGameId (gameUrl);
                const inQueue = queue.some ((g) => extractGameId (g.url) === gameId);
                return {
                    ok: true,
                    data: {
                        isDuplicate: inQueue,
                        source: inQueue ? "queue" : null,
                        warning: "Remote check failed \u2014 local only",
                    },
                };
            }
        }

        // ── Cache ──
        case MSG.REFRESH_CACHE: {
            try {
                clearGitHubCache ();
                const count = await refreshDedupCache ();
                // Auto-dedup queue if setting enabled (cache just refreshed -> no need to forceRefresh again)
                try {
                    const settings = await loadSettings ();
                    if (settings.auto_dedup_queue) {
                        const dedup = await dedupeQueueAgainstRemote ({
                            forceRefresh: false,
                            trigger: "cache_refresh",
                        });
                        if (dedup.ok && dedup.removed > 0) await updateBadge ();
                    }
                }
                catch (err) {
                    await logWarn ("dedup", `Auto-dedup after cache refresh failed: ${err.message || err}`);
                }
                return {ok: true, data: {urlCount: count}};
            }
            catch (err) {
                return {ok: false, error: err.message || "Cache refresh failed"};
            }
        }

        // ── Dedup queue against remote ──
        case MSG.DEDUP_QUEUE: {
            const result = await dedupeQueueAgainstRemote ({
                forceRefresh: data?.forceRefresh ?? false,
                trigger: data?.trigger || "manual",
            });
            if (result.ok && result.removed > 0) await updateBadge ();
            return result;
        }

        // ── Settings ──
        case MSG.GET_SETTINGS: {
            const settings = await loadSettings ();
            return {ok: true, data: settings};
        }

        case MSG.SAVE_SETTINGS: {
            await saveSettings (data);
            await logInfo ("settings", "Settings saved");
            return {ok: true};
        }

        // ── Logging ──
        case MSG.GET_LOGS: {
            const logs = await getLogs (data || {});
            return {ok: true, data: logs};
        }

        case MSG.EXPORT_LOGS: {
            const json = await exportLogsJSON ();
            return {ok: true, data: json};
        }

        case MSG.CLEAR_LOGS: {
            await clearLogs ();
            await logInfo ("settings", "Logs cleared");
            return {ok: true};
        }

        // ── Reset ──
        case MSG.RESET_EXTENSION: {
            await logWarn ("settings", "Extension reset initiated");
            await storageClearAll ();
            detectedGames.clear ();
            clearDedupCache ();
            clearGitHubCache ();
            invalidateSettingsCache ();
            await updateBadge ();
            return {ok: true};
        }

        default:
            logWarn ("sw", `Unknown message type: ${type}`);
            return {ok: false, error: `Unknown message type: ${type}`};
    }
}

// ────────────────────────────────────────────────────────────────────
// Auto-collect handler
// ────────────────────────────────────────────────────────────────────

/**
 * Decide what to do with a detected game and (if appropriate) add it.
 * Returns a reply describing the outcome for the content script to toast.
 *
 * Possible replies:
 *   {ok:true, skip:true, reason}                                  → no toast
 *   {ok:true, kind:"paid"|"dup"|"queue_full"|"error", name}       → info toast
 *   {ok:true, kind:"added", name, url}                            → success toast with Undo
 */
async function handleAutoCollect (data) {
    if (!data || !data.url) return {ok: true, skip: true, reason: "no_data"};

    const settings = await loadSettings ();
    if (!settings.auto_collect) return {ok: true, skip: true, reason: "disabled"};

    // Strict URL gate: only canonical itch.io game URLs (creator.itch.io/slug).
    // Detector also runs a DOM-based isGamePage() check; this regex is a
    // belt-and-suspenders check against future detector heuristic changes.
    if (!ITCH_GAME_URL_RE.test (data.url)) {
        return {ok: true, skip: true, reason: "not_game_page"};
    }

    const name = data.name || "";

    // Paid game → no add, optional toast
    if (data.is_free === false) {
        return settings.auto_collect_show_paid_toast
               ? {ok: true, kind: "paid", name}
               : {ok: true, skip: true, reason: "paid_toast_disabled"};
    }

    return serializeAutoCollect (async () => {
        // Duplicate check — refuse to add if verification fails (don't risk duplicates).
        let dup;
        try {
            dup = await checkDuplicate (data.url);
        }
        catch (err) {
            await logWarn ("queue", `Auto-collect dedup check failed: ${err.message || err}`, {url: data.url});
            return {ok: true, kind: "error", name, reason: "verify_failed"};
        }

        if (dup && dup.isDuplicate) {
            return settings.auto_collect_show_dup_toast
                   ? {ok: true, kind: "dup", name, source: dup.source}
                   : {ok: true, skip: true, reason: "dup_toast_disabled"};
        }

        const size = await getQueueSize ();
        if (size >= QUEUE_MAX) {
            return {ok: true, kind: "queue_full", name};
        }

        const result = await addToQueue (data);
        if (!result.ok) {
            // Could be a local-dup race (another tab added moments ago)
            if ((result.error || "").toLowerCase ().includes ("already")) {
                return settings.auto_collect_show_dup_toast
                       ? {ok: true, kind: "dup", name, source: "queue"}
                       : {ok: true, skip: true, reason: "dup_toast_disabled"};
            }
            return {ok: true, kind: "error", name, reason: result.error || "add_failed"};
        }

        await updateBadge ();
        checkAutoPush ();
        await logInfo ("queue", `Auto-collected: ${name || data.url}`, {url: data.url, trigger: "auto"});

        return {ok: true, kind: "added", name, url: result.data?.entry?.url || data.url};
    });
}

updateBadge ();
