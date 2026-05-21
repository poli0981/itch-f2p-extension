// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Queue page bootstrap — wires DOM event listeners and kicks off the
 * initial load. Rendering lives in queue-render.js, actions/handlers in
 * queue-actions.js, shared state in queue-state.js.
 *
 * Key differences from Steam extension:
 *   - URL-based identity (extractGameId returns normalized URL)
 *   - Auto fields: dev (string), status, made_with, rating, nsfw, avg_session, inputs
 *   - Editable fields: genre (tag-select), safe_virus, notes (no type_game/anti_cheat)
 *   - NSFW badge overlay on thumbnail
 *   - Tags are comma-separated string (not array)
 */

import { MSG } from "../shared/constants.js";
import { sendMessage, showToast, initTheme } from "../shared/ui.js";
import { icon } from "../shared/icons.js";
import { dom, selection, state } from "./queue-state.js";
import { renderQueue } from "./queue-render.js";
import {
    autoTriggerDedup,
    clearSelection,
    formatPushTarget,
    handleBulkPush,
    handleBulkRemove,
    loadQueue,
    selectAllVisible,
} from "./queue-actions.js";

// Apply theme as early as possible to avoid flash
initTheme();

// ── Events ──

dom.searchInput.addEventListener("input", () => renderQueue(state.currentQueue, dom.searchInput.value.trim()));

dom.refreshBtn.addEventListener("click", async () => {
    dom.refreshBtn.disabled = true;
    await loadQueue();
    dom.refreshBtn.disabled = false;
    showToast("Queue refreshed", "info");
});

dom.dedupBtn.addEventListener("click", async () => {
    const orig = dom.dedupBtn.innerHTML;
    dom.dedupBtn.disabled = true;
    dom.dedupBtn.innerHTML = `<span class="spinner"></span> Checking...`;
    const resp = await sendMessage(MSG.DEDUP_QUEUE, { forceRefresh: true, trigger: "manual" });
    if (resp?.ok) {
        if (resp.removed > 0) {
            showToast(`Removed ${resp.removed} duplicate(s) already in remote`, "success", 3500);
        } else {
            const n = resp.remoteCount || 0;
            showToast(`No duplicates found (${n} remote URL${n === 1 ? "" : "s"} checked)`, "info");
        }
    } else if (resp?.skipped) {
        showToast(`Remote unreachable — dedup skipped`, "warning");
    } else {
        showToast(resp?.error || "Dedup failed", "error");
    }
    dom.dedupBtn.disabled = false;
    dom.dedupBtn.innerHTML = orig;
});

dom.pushAllBtn.addEventListener("click", async () => {
    if (state.currentQueue.length === 0) return;
    if (!confirm(`Push ${state.currentQueue.length} game(s) to GitHub?`)) return;

    dom.pushAllBtn.disabled = true;
    dom.pushAllBtn.innerHTML = `<span class="spinner"></span> Pushing...`;

    const resp = await sendMessage(MSG.PUSH_QUEUE);

    if (resp?.ok) {
        const label = resp.signed ? " (GPG signed)" : "";
        const target = formatPushTarget(resp);
        const dedupedNote = resp.deduped > 0 ? ` (${resp.deduped} skipped — already in remote)` : "";
        showToast(`Pushed ${resp.pushed} game(s)${label}${target}${dedupedNote}`, "success", 3500);
        await loadQueue();
    } else if (resp?.gpgFailed) {
        const fallback = confirm(`GPG signing failed: ${resp.error}\n\nPush unsigned instead?`);
        if (fallback) {
            dom.pushAllBtn.innerHTML = `<span class="spinner"></span> Unsigned...`;
            const unsignedResp = await sendMessage(MSG.PUSH_QUEUE_UNSIGNED);
            if (unsignedResp?.ok) {
                showToast(`Pushed ${unsignedResp.pushed} game(s) (unsigned)`, "success");
                await loadQueue();
            } else {
                showToast(unsignedResp?.error || "Unsigned push failed", "error");
            }
        }
    } else {
        showToast(resp?.error || "Push failed", "error");
    }

    dom.pushAllBtn.disabled = false;
    dom.pushAllBtn.innerHTML = `${icon("arrow-up", { strokeWidth: 2.5 })} Push All`;
});

dom.clearAllBtn.addEventListener("click", async () => {
    if (state.currentQueue.length === 0) return;
    if (!confirm(`Remove all ${state.currentQueue.length} game(s) from queue?\nThis cannot be undone.`)) return;

    dom.clearAllBtn.disabled = true;
    dom.clearAllBtn.textContent = "Clearing...";

    for (const game of state.currentQueue) {
        if (game.url) await sendMessage(MSG.REMOVE_FROM_QUEUE, { url: game.url });
    }

    showToast(`Cleared ${state.currentQueue.length} game(s) from queue`, "info");
    await loadQueue();

    dom.clearAllBtn.disabled = false;
    dom.clearAllBtn.innerHTML = `${icon("trash")} Clear`;
});

// ── Bulk toolbar button bindings ──
dom.bulkSelectAllBtn.addEventListener("click", selectAllVisible);
dom.bulkClearBtn.addEventListener("click", clearSelection);
dom.bulkPushBtn.addEventListener("click", handleBulkPush);
dom.bulkRemoveBtn.addEventListener("click", handleBulkRemove);

// ── Keyboard shortcuts ──
document.addEventListener("keydown", (e) => {
    const isInputFocus = document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA";

    // Ctrl+A: select all visible (when not in input)
    if (e.ctrlKey && e.key === "a" && !isInputFocus) {
        e.preventDefault();
        selectAllVisible();
        return;
    }

    // Focus search: Ctrl+F or "/"
    if ((e.ctrlKey && e.key === "f") || (e.key === "/" && document.activeElement !== dom.searchInput)) {
        e.preventDefault();
        dom.searchInput.focus();
        return;
    }

    // Escape: clear search first, then selection
    if (e.key === "Escape") {
        if (document.activeElement === dom.searchInput) {
            dom.searchInput.value = "";
            renderQueue(state.currentQueue, "");
            dom.searchInput.blur();
        } else if (selection.size > 0) {
            clearSelection();
        }
    }
});

// ── Auto-refresh when queue changes (add from popup, push elsewhere, etc.) ──
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.queue) return;
    const newQueue = Array.isArray(changes.queue.newValue) ? changes.queue.newValue : [];
    renderQueue(newQueue, dom.searchInput.value.trim());
});

document.addEventListener("DOMContentLoaded", async () => {
    await loadQueue();
    autoTriggerDedup("queue_open").catch(() => {});
});
