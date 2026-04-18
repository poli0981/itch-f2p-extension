// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Queue manager – CRUD operations for the pending game queue.
 *
 * Key differences from Steam extension:
 *   - Identity key: normalized URL (not appid)
 *   - Field set: itch.io-specific (no anti_cheat, has nsfw/made_with/rating)
 *   - Editable fields: genre, safe_virus, notes
 */

import {QUEUE_MAX} from "../shared/constants.js";
import {loadQueue, saveQueue} from "../shared/storage.js";
import {extractGameId, makeQueueEntry} from "../shared/utils.js";
import {logInfo, logWarn} from "../shared/logger.js";

// Fields the user cannot edit
const AUTO_LOCKED_FIELDS = new Set ([
                                        "url", "name", "thumbnail", "added_at",
                                        "dev", "description", "release_date", "publisher",
                                        "platforms", "languages", "tags", "status",
                                        "made_with", "rating", "rating_count", "average_session",
                                        "inputs", "nsfw",
                                    ]);

// Fields the user CAN edit
const EDITABLE_FIELD_KEYS = new Set ([
                                         "genre", "safe_virus", "notes",
                                     ]);

/**
 * Add a game to the queue.
 */
export async function addToQueue (gameData) {
    if (!gameData || !gameData.url) {
        return {ok: false, error: "No game data or URL provided"};
    }

    const queue = await loadQueue ();

    if (queue.length >= QUEUE_MAX) {
        await logWarn ("queue", `Queue full (${QUEUE_MAX}/${QUEUE_MAX}). Push or remove entries.`);
        return {
            ok: false,
            error: `Queue is full (${QUEUE_MAX}/${QUEUE_MAX}). Push or remove entries first.`,
        };
    }

    const entry = makeQueueEntry (gameData);
    if (!entry.url) {
        return {ok: false, error: "Invalid URL format"};
    }

    const gameId = extractGameId (entry.url);
    if (!gameId) {
        return {ok: false, error: "Could not parse itch.io URL"};
    }

    // Local duplicate check
    const exists = queue.some ((g) => extractGameId (g.url) === gameId);
    if (exists) {
        return {ok: false, error: "Game already in queue"};
    }

    // Use detector's genre if available
    if (gameData.genre && gameData.genre !== "N/A") {
        entry.genre = gameData.genre;
    }

    queue.push (entry);
    await saveQueue (queue);

    await logInfo ("queue", `Added to queue: ${entry.name || gameId}`, {
        url: entry.url,
        genre: entry.genre,
        dev: entry.dev,
        nsfw: entry.nsfw,
    });

    return {ok: true, data: {entry, queueSize: queue.length}};
}

/**
 * Remove a game from the queue by URL.
 */
export async function removeFromQueue (gameUrl) {
    if (!gameUrl) {
        return {ok: false, error: "No URL provided"};
    }

    const gameId = extractGameId (gameUrl);
    if (!gameId) {
        return {ok: false, error: "Invalid URL"};
    }

    const queue = await loadQueue ();
    const before = queue.length;
    const filtered = queue.filter ((g) => extractGameId (g.url) !== gameId);

    if (filtered.length === before) {
        return {ok: false, error: "Game not found in queue"};
    }

    await saveQueue (filtered);
    await logInfo ("queue", `Removed from queue: ${gameUrl}`, {url: gameUrl});

    return {ok: true, data: {queueSize: filtered.length}};
}

/**
 * Update editable fields on a queued game entry.
 */
export async function updateEntry (gameUrl, fields) {
    if (!gameUrl || !fields) {
        return {ok: false, error: "Missing URL or fields"};
    }

    const gameId = extractGameId (gameUrl);
    if (!gameId) {
        return {ok: false, error: "Invalid URL"};
    }

    const queue = await loadQueue ();
    const index = queue.findIndex ((g) => extractGameId (g.url) === gameId);

    if (index === -1) {
        return {ok: false, error: "Game not found in queue"};
    }

    const applied = {};
    const rejected = [];

    for (const [key, value] of Object.entries (fields)) {
        if (AUTO_LOCKED_FIELDS.has (key)) {
            rejected.push (key);
            continue;
        }
        if (EDITABLE_FIELD_KEYS.has (key)) {
            queue[index][key] = typeof value === "string" ? value.trim () : value;
            applied[key] = queue[index][key];
        }
        else {
            rejected.push (key);
        }
    }

    if (Object.keys (applied).length === 0) {
        const reason = rejected.length > 0
                       ? `Fields not editable: ${rejected.join (", ")}`
                       : "No valid fields to update";
        return {ok: false, error: reason};
    }

    await saveQueue (queue);

    if (rejected.length > 0) {
        await logWarn ("queue", `Update entry: applied ${Object.keys (applied)
                                                               .join (", ")}, rejected ${rejected.join (", ")}`, {
                           url: gameUrl, applied, rejected,
                       });
    }
    else {
        await logInfo ("queue", `Updated entry: ${gameUrl}`, {url: gameUrl, fields: applied});
    }

    return {ok: true, data: {entry: queue[index], applied, rejected}};
}

export async function getQueueSize () {
    const queue = await loadQueue ();
    return queue.length;
}
