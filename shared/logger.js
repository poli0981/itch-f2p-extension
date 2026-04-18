// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Structured logger with chrome.storage persistence.
 * Supports levels, categories, auto-pruning, and JSON export.
 * [SHARED] Identical to Steam extension.
 */

import {LOG_LEVELS, LOG_MAX_DEFAULT, STORAGE_KEYS} from "./constants.js";
import {loadSettings, storageGet, storageSet} from "./storage.js";

function shouldLog (level, minLevel) {
    return LOG_LEVELS.indexOf (level) >= LOG_LEVELS.indexOf (minLevel);
}

export async function log (level, category, message, data = undefined) {
    try {
        const settings = await loadSettings ();
        const minLevel = settings.log_level || "info";
        const maxEntries = settings.log_max_entries || LOG_MAX_DEFAULT;

        if (!shouldLog (level, minLevel)) return;

        const entry = {
            timestamp: new Date ().toISOString ()
                                  .replace (/\.\d{3}Z$/, "Z"),
            level,
            category,
            message,
        };
        if (data !== undefined) {
            entry.data = data;
        }

        const logs = await storageGet (STORAGE_KEYS.LOGS, []);
        logs.push (entry);

        if (logs.length > maxEntries) {
            logs.splice (0, logs.length - maxEntries);
        }

        await storageSet (STORAGE_KEYS.LOGS, logs);
    }
    catch (err) {
        console.error ("[logger] Failed to persist log:", err);
        console.log (`[${level}][${category}] ${message}`, data);
    }
}

export const logDebug = (cat, msg, data) => log ("debug", cat, msg, data);
export const logInfo = (cat, msg, data) => log ("info", cat, msg, data);
export const logWarn = (cat, msg, data) => log ("warn", cat, msg, data);
export const logError = (cat, msg, data) => log ("error", cat, msg, data);

export async function getLogs (filter = {}) {
    const logs = await storageGet (STORAGE_KEYS.LOGS, []);
    if (!filter.level && !filter.category) return logs;
    return logs.filter ((entry) => {
        if (filter.level && !shouldLog (entry.level, filter.level)) return false;
        if (filter.category && entry.category !== filter.category) return false;
        return true;
    });
}

export async function clearLogs () {
    await storageSet (STORAGE_KEYS.LOGS, []);
}

export async function exportLogsJSON () {
    const logs = await storageGet (STORAGE_KEYS.LOGS, []);
    return JSON.stringify (logs, null, 2);
}
