// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Queue page shared state — DOM element references, mutable view state,
 * and the bulk-selection set.
 *
 * Extracted from queue.js (v1.9.1 refactor). Imported by queue-render.js,
 * queue-actions.js, and the queue.js bootstrap.
 *
 * NOTE: the four reassigned values live as PROPERTIES of `state` (not as
 * separate `let` exports) so a mutation in one module is visible in all.
 */

import { $ } from "../shared/ui.js";

/** Cached DOM element references (resolved once at module load). */
export const dom = {
    queueCount:       $("#queueCount"),
    queueGrid:        $("#queueGrid"),
    emptyState:       $("#emptyState"),
    searchInput:      $("#searchInput"),
    refreshBtn:       $("#refreshBtn"),
    dedupBtn:         $("#dedupBtn"),
    pushAllBtn:       $("#pushAllBtn"),
    clearAllBtn:      $("#clearAllBtn"),
    bulkToolbar:      $("#bulkToolbar"),
    bulkCount:        $("#bulkCount"),
    bulkSelectAllBtn: $("#bulkSelectAllBtn"),
    bulkClearBtn:     $("#bulkClearBtn"),
    bulkRemoveBtn:    $("#bulkRemoveBtn"),
    bulkPushBtn:      $("#bulkPushBtn"),
    bulkRemoveCount:  $("#bulkRemoveCount"),
    bulkPushCount:    $("#bulkPushCount"),
};

/** Mutable view state. Mutate properties — never reassign `state` itself. */
export const state = {
    currentQueue:  [],     // Full queue as last rendered
    filteredUrls:  [],     // URLs visible after the search filter (preserves order)
    lastAnchorUrl: null,   // Last checkbox toggled, for Shift+click range select
    dragSourceUrl: null,   // Card being dragged, for drop reordering
};

/** Selected URLs for bulk actions (mutated in place, never reassigned). */
export const selection = new Set();
