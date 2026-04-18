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

import {MSG} from "../shared/constants.js";
import {invalidateSettingsCache, loadQueue, loadSettings, saveSettings, storageClearAll} from "../shared/storage.js";
import {clearLogs, exportLogsJSON, getLogs, logError, logInfo, logWarn} from "../shared/logger.js";
import {extractGameId} from "../shared/utils.js";
import {addToQueue, getQueueSize, removeFromQueue, updateEntry} from "./queue-manager.js";
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
            catch (err) {
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
                return {ok: true, data: {urlCount: count}};
            }
            catch (err) {
                return {ok: false, error: err.message || "Cache refresh failed"};
            }
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

updateBadge ();
