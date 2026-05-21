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

import { ITCH_URL_EXTRACT_RE } from "./constants.js";

/**
 * Normalize an itch.io game URL to canonical form.
 * - Lowercase
 * - Strip trailing slash
 * - Remove query parameters and hash
 *
 * @param {string} url
 * @returns {string|null} Canonical URL or null
 */
export function normalizeUrl(url) {
    if (!url) return null;

    try {
        const parsed = new URL(url.trim());
        // Must be *.itch.io
        if (!parsed.hostname.endsWith(".itch.io")) return null;

        // Extract creator.itch.io/slug
        const match = parsed.href.match(ITCH_URL_EXTRACT_RE);
        if (!match) return null;

        const creator = match[1].toLowerCase();
        const slug = match[2].toLowerCase();

        return `https://${creator}.itch.io/${slug}`;
    } catch {
        // Try regex-only extraction for malformed URLs
        const match = url.match(ITCH_URL_EXTRACT_RE);
        if (!match) return null;

        return `https://${match[1].toLowerCase()}.itch.io/${match[2].toLowerCase()}`;
    }
}

/**
 * Extract the identity key from a game URL.
 * For itch.io, the identity IS the normalized URL.
 *
 * @param {string} url
 * @returns {string|null}
 */
export function extractGameId(url) {
    return normalizeUrl(url);
}

/**
 * Get current UTC timestamp in ISO format.
 * @returns {string}
 */
function nowISO() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Format a timestamp for display (short form).
 * @param {string} iso
 * @returns {string}
 */
export function formatTime(iso) {
    if (!iso) return "\u2014";
    try {
        const d = new Date(iso);
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
        return iso;
    }
}

/**
 * Truncate a string with ellipsis.
 * @param {string} str
 * @param {number} max
 * @returns {string}
 */
export function truncate(str, max = 50) {
    if (!str || str.length <= max) return str || "";
    return str.slice(0, max - 3) + "...";
}

/**
 * Create a game entry skeleton from detected data.
 *
 * Multi-value fields (tags, platforms, languages, inputs, made_with)
 * are stored as arrays. Single-value fields remain strings.
 *
 * @param {object} detected - Data from content script
 * @returns {object}
 */
export function makeQueueEntry(detected) {
    return {
        // ── Identity ──
        url: normalizeUrl(detected.url || ""),
        name: detected.name || "",
        thumbnail: detected.thumbnail || "",

        // ── Auto-detected fields (read-only) ──
        // Single-value (strings)
        dev: detected.dev || "",
        description: detected.description || "",
        genre: detected.genre || "",
        status: detected.status || "",
        publisher: detected.publisher || "",
        release_date: detected.release_date || "",
        rating: detected.rating || "",
        rating_count: detected.rating_count || "",
        average_session: detected.average_session || "",
        nsfw: detected.nsfw || "No",

        // Multi-value (arrays)
        tags: Array.isArray(detected.tags) ? detected.tags : [],
        platforms: Array.isArray(detected.platforms) ? detected.platforms : [],
        languages: Array.isArray(detected.languages) ? detected.languages : [],
        inputs: Array.isArray(detected.inputs) ? detected.inputs : [],
        made_with: Array.isArray(detected.made_with) ? detected.made_with : [],

        // ── User-editable fields ──
        safe_virus: "?",
        notes: "",

        // ── Metadata ──
        added_at: nowISO(),
    };
}
