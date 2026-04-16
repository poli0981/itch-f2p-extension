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

// ── Settings ──

export async function loadSettings () {
    const stored = await storageGet (STORAGE_KEYS.SETTINGS, {});
    return {...DEFAULT_SETTINGS, ...stored};
}

export async function saveSettings (settings) {
    await storageSet (STORAGE_KEYS.SETTINGS, settings);
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
