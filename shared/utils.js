// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Shared utility functions.
 * URL normalization, identity extraction, time formatting.
 *
 * Key difference from Steam extension:
 *   - Steam uses numeric appid as identity key
 *   - itch.io uses normalized URL: https://{creator}.itch.io/{slug}
 */

import {ITCH_URL_EXTRACT_RE} from "./constants.js";

/**
 * Normalize an itch.io game URL to canonical form.
 * - Lowercase
 * - Strip trailing slash
 * - Remove query parameters and hash
 *
 * @param {string} url
 * @returns {string|null} Canonical URL or null
 */
export function normalizeUrl (url) {
    if (!url) return null;

    try {
        const parsed = new URL (url.trim ());
        // Must be *.itch.io
        if (!parsed.hostname.endsWith (".itch.io")) return null;

        // Extract creator.itch.io/slug
        const match = parsed.href.match (ITCH_URL_EXTRACT_RE);
        if (!match) return null;

        const creator = match[1].toLowerCase ();
        const slug = match[2].toLowerCase ();

        return `https://${creator}.itch.io/${slug}`;
    }
    catch {
        // Try regex-only extraction for malformed URLs
        const match = url.match (ITCH_URL_EXTRACT_RE);
        if (!match) return null;

        return `https://${match[1].toLowerCase ()}.itch.io/${match[2].toLowerCase ()}`;
    }
}

/**
 * Extract the identity key from a game URL.
 * For itch.io, the identity IS the normalized URL.
 *
 * @param {string} url
 * @returns {string|null}
 */
export function extractGameId (url) {
    return normalizeUrl (url);
}

/**
 * Extract creator name from an itch.io URL.
 * @param {string} url
 * @returns {string|null}
 */
export function extractCreator (url) {
    if (!url) return null;
    const match = url.match (ITCH_URL_EXTRACT_RE);
    return match ? match[1] : null;
}

/**
 * Extract game slug from an itch.io URL.
 * @param {string} url
 * @returns {string|null}
 */
export function extractSlug (url) {
    if (!url) return null;
    const match = url.match (ITCH_URL_EXTRACT_RE);
    return match ? match[2] : null;
}

/**
 * Get current UTC timestamp in ISO format.
 * @returns {string}
 */
export function nowISO () {
    return new Date ().toISOString ()
                      .replace (/\.\d{3}Z$/, "Z");
}

/**
 * Format a timestamp for display (short form).
 * @param {string} iso
 * @returns {string}
 */
export function formatTime (iso) {
    if (!iso) return "\u2014";
    try {
        const d = new Date (iso);
        const pad = (n) => String (n)
            .padStart (2, "0");
        return `${d.getFullYear ()}-${pad (d.getMonth () + 1)}-${pad (d.getDate ())} ${pad (d.getHours ())}:${pad (d.getMinutes ())}`;
    }
    catch {
        return iso;
    }
}

/**
 * Truncate a string with ellipsis.
 * @param {string} str
 * @param {number} max
 * @returns {string}
 */
export function truncate (str, max = 50) {
    if (!str || str.length <= max) return str || "";
    return str.slice (0, max - 3) + "...";
}

/**
 * Sanitize a string for safe DOM insertion.
 * @param {string} str
 * @returns {string}
 */
export function sanitize (str) {
    if (!str) return "";
    const div = document.createElement ("div");
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Simple debounce.
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
export function debounce (fn, ms = 300) {
    let timer;
    return (...args) => {
        clearTimeout (timer);
        timer = setTimeout (() => fn (...args), ms);
    };
}

/**
 * Create a game entry skeleton from detected data.
 *
 * @param {object} detected - Data from content script
 * @returns {object}
 */
export function makeQueueEntry (detected) {
    return {
        // ── Identity ──
        url: normalizeUrl (detected.url || ""),
        name: detected.name || "",
        thumbnail: detected.thumbnail || "",

        // ── Auto-detected fields (read-only) ──
        dev: detected.dev || "",
        description: detected.description || "",
        genre: detected.genre || "",
        tags: detected.tags || "",
        status: detected.status || "",
        platforms: detected.platforms || "",
        publisher: detected.publisher || "",
        release_date: detected.release_date || "",
        made_with: detected.made_with || "",
        rating: detected.rating || "",
        rating_count: detected.rating_count || "",
        average_session: detected.average_session || "",
        languages: detected.languages || "",
        inputs: detected.inputs || "",
        nsfw: detected.nsfw || "No",

        // ── User-editable fields ──
        safe_virus: "?",
        notes: "",

        // ── Metadata ──
        added_at: nowISO (),
    };
}
