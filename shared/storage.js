// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Chrome storage wrapper.
 * Identical to Steam extension + URL cache helpers instead of appid cache.
 */

import {DEFAULT_SETTINGS, STORAGE_KEYS} from "./constants.js";

export async function storageGet (key, fallback = null) {
    try {
        const result = await chrome.storage.local.get (key);
        return result[key] !== undefined ? result[key] : fallback;
    }
    catch (err) {
        console.error (`[storage] get("${key}") failed:`, err);
        return fallback;
    }
}

export async function storageSet (key, value) {
    try {
        await chrome.storage.local.set ({[key]: value});
    }
    catch (err) {
        console.error (`[storage] set("${key}") failed:`, err);
        throw err;
    }
}

export async function storageRemove (key) {
    try {
        await chrome.storage.local.remove (key);
    }
    catch (err) {
        console.error (`[storage] remove("${key}") failed:`, err);
    }
}

export async function storageClearAll () {
    try {
        await chrome.storage.local.clear ();
    }
    catch (err) {
        console.error ("[storage] clearAll failed:", err);
        throw err;
    }
}

// ── Settings (with in-memory cache to reduce chrome.storage reads) ──

let _settingsCache = null;
let _settingsCachedAt = 0;
const SETTINGS_TTL_MS = 30_000;  // 30s — short TTL because settings rarely change mid-session

export async function loadSettings () {
    if (_settingsCache && Date.now () - _settingsCachedAt < SETTINGS_TTL_MS) {
        return _settingsCache;
    }
    const stored = await storageGet (STORAGE_KEYS.SETTINGS, {});
    _settingsCache = {...DEFAULT_SETTINGS, ...stored};
    _settingsCachedAt = Date.now ();
    return _settingsCache;
}

export async function saveSettings (settings) {
    await storageSet (STORAGE_KEYS.SETTINGS, settings);
    // Update cache immediately so subsequent loadSettings() reflects the new values
    _settingsCache = {...DEFAULT_SETTINGS, ...settings};
    _settingsCachedAt = Date.now ();
}

/**
 * Invalidate settings cache — call after external changes (e.g. RESET_EXTENSION).
 */
export function invalidateSettingsCache () {
    _settingsCache = null;
    _settingsCachedAt = 0;
}

// ── Queue ──

export async function loadQueue () {
    return storageGet (STORAGE_KEYS.QUEUE, []);
}

export async function saveQueue (queue) {
    await storageSet (STORAGE_KEYS.QUEUE, queue);
}

// ── URL Cache (itch.io uses URLs instead of Steam appids) ──

export async function loadCachedUrls () {
    return storageGet (STORAGE_KEYS.CACHE_URLS, null);
}

export async function saveCachedUrls (urls) {
    await storageSet (STORAGE_KEYS.CACHE_URLS, {
        urls,
        fetched_at: new Date ().toISOString (),
    });
}
