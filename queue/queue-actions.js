// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Queue page actions — drag/drop reordering, bulk selection, push/remove
 * handlers, queue loading, and auto-dedup.
 *
 * Extracted from queue.js (v1.9.1 refactor).
 *
 * NOTE: imports renderQueue from queue-render.js, which in turn imports the
 * handlers below. This circular import is safe — renderQueue is only called
 * inside loadQueue() at runtime, never during module evaluation.
 */

import { MSG } from "../shared/constants.js";
import { sendMessage, showToast, showActionToast } from "../shared/ui.js";
import { dom, selection, state } from "./queue-state.js";
import { renderQueue } from "./queue-render.js";

/**
 * Format the target segment of a push-success toast.
 * Shows per-file breakdown when the push spanned multiple data files.
 */
export function formatPushTarget(resp) {
    if (Array.isArray(resp.files) && resp.files.length > 1) {
        const parts = resp.files.map((f) => `${f.name}${f.isNew ? " (new)" : ""} +${f.added}`);
        return ` → ${resp.files.length} files: ${parts.join(", ")}`;
    }
    if (Array.isArray(resp.files) && resp.files.length === 1) {
        return ` → ${resp.files[0].name}${resp.files[0].isNew ? " (new)" : ""}`;
    }
    return resp.target ? ` → ${resp.target}` : "";
}

// ── Drag & drop reordering ──

export function handleDragStart(e) {
    const card = e.currentTarget;
    state.dragSourceUrl = card.dataset.url;
    card.classList.add("dragging");
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", state.dragSourceUrl); } catch {}
    }
}

export function handleDragOver(e) {
    if (!state.dragSourceUrl) return;
    e.preventDefault();
    const card = e.currentTarget;
    if (card.dataset.url === state.dragSourceUrl) return;
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

    // Visual drop indicator (before/after based on mouse position)
    const rect = card.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const isBefore = e.clientY < midpoint;
    card.classList.toggle("drop-before", isBefore);
    card.classList.toggle("drop-after", !isBefore);
}

export function handleDragLeave(e) {
    const card = e.currentTarget;
    card.classList.remove("drop-before", "drop-after");
}

export async function handleDrop(e) {
    e.preventDefault();
    if (!state.dragSourceUrl) return;

    const targetCard = e.currentTarget;
    const targetUrl = targetCard.dataset.url;
    const rect = targetCard.getBoundingClientRect();
    const isBefore = e.clientY < rect.top + rect.height / 2;

    targetCard.classList.remove("drop-before", "drop-after");

    if (targetUrl === state.dragSourceUrl) return;

    // Compute new order from current DOM state, moving source relative to target
    const currentOrder = [...dom.queueGrid.querySelectorAll(".game-card")].map((c) => c.dataset.url);
    const srcIdx = currentOrder.indexOf(state.dragSourceUrl);
    if (srcIdx >= 0) currentOrder.splice(srcIdx, 1);
    let tgtIdx = currentOrder.indexOf(targetUrl);
    if (tgtIdx < 0) tgtIdx = currentOrder.length;
    if (!isBefore) tgtIdx++;
    currentOrder.splice(tgtIdx, 0, state.dragSourceUrl);

    // Merge with full queue (filtered view might only show a subset)
    const filteredSet = new Set(currentOrder);
    const fullOrder = [];
    // First pass: add all reordered filtered items in their new order
    fullOrder.push(...currentOrder);
    // Second pass: append any queue entries NOT in the filtered view, preserving original order
    for (const entry of state.currentQueue) {
        if (!filteredSet.has(entry.url)) fullOrder.push(entry.url);
    }

    const resp = await sendMessage(MSG.REORDER_QUEUE, { orderedUrls: fullOrder });
    if (!resp?.ok) {
        showToast(resp?.error || "Reorder failed", "error");
    }
    // Storage.onChanged listener will re-render
}

export function handleDragEnd(e) {
    e.currentTarget.classList.remove("dragging", "drag-ready");
    // Clear any lingering drop indicators
    for (const c of dom.queueGrid.querySelectorAll(".drop-before, .drop-after")) {
        c.classList.remove("drop-before", "drop-after");
    }
    state.dragSourceUrl = null;
}

// ── Bulk selection ──

export function toggleSelection(url, checked) {
    if (checked) selection.add(url);
    else selection.delete(url);
    applySelectionUI(url);
    updateBulkToolbar();
}

export function applyRangeSelection(fromUrl, toUrl, targetState) {
    const fromIdx = state.filteredUrls.indexOf(fromUrl);
    const toIdx = state.filteredUrls.indexOf(toUrl);
    if (fromIdx < 0 || toIdx < 0) {
        toggleSelection(toUrl, targetState);
        return;
    }
    const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
    for (let i = start; i <= end; i++) {
        const url = state.filteredUrls[i];
        if (targetState) selection.add(url);
        else selection.delete(url);
        applySelectionUI(url);
    }
    updateBulkToolbar();
}

function applySelectionUI(url) {
    const card = dom.queueGrid.querySelector(`.game-card[data-url="${CSS.escape(url)}"]`);
    if (!card) return;
    const checkbox = card.querySelector(".game-card-select");
    const selected = selection.has(url);
    card.classList.toggle("selected", selected);
    if (checkbox) checkbox.checked = selected;
}

export function selectAllVisible() {
    for (const url of state.filteredUrls) selection.add(url);
    for (const url of state.filteredUrls) applySelectionUI(url);
    updateBulkToolbar();
}

export function clearSelection() {
    const prev = [...selection];
    selection.clear();
    for (const url of prev) applySelectionUI(url);
    state.lastAnchorUrl = null;
    updateBulkToolbar();
}

export function updateBulkToolbar() {
    const n = selection.size;
    if (n === 0) {
        dom.bulkToolbar.style.display = "none";
        return;
    }
    dom.bulkToolbar.style.display = "flex";
    dom.bulkCount.textContent = String(n);
    dom.bulkRemoveCount.textContent = String(n);
    dom.bulkPushCount.textContent = String(n);
}

export async function handleBulkPush() {
    if (selection.size === 0) return;
    if (!confirm(`Push ${selection.size} selected game(s) to GitHub?`)) return;

    const urls = [...selection];
    dom.bulkPushBtn.disabled = true;
    const origHTML = dom.bulkPushBtn.innerHTML;
    dom.bulkPushBtn.innerHTML = `<span class="spinner"></span> Pushing ${urls.length}...`;

    const resp = await sendMessage(MSG.PUSH_QUEUE, { urls });

    if (resp?.ok) {
        const label = resp.signed ? " (GPG signed)" : "";
        const target = formatPushTarget(resp);
        const dedupedNote = resp.deduped > 0 ? ` (${resp.deduped} skipped — already in remote)` : "";
        showToast(`Pushed ${resp.pushed} game(s)${label}${target}${dedupedNote}`, "success", 3500);
        selection.clear();
        await loadQueue();
    } else if (resp?.gpgFailed) {
        const fallback = confirm(`GPG signing failed: ${resp.error}\n\nPush unsigned instead?`);
        if (fallback) {
            const unsignedResp = await sendMessage(MSG.PUSH_QUEUE_UNSIGNED, { urls });
            if (unsignedResp?.ok) {
                showToast(`Pushed ${unsignedResp.pushed} game(s) (unsigned)`, "success");
                selection.clear();
                await loadQueue();
            } else {
                showToast(unsignedResp?.error || "Unsigned push failed", "error");
            }
        }
    } else {
        showToast(resp?.error || "Push failed", "error");
    }

    dom.bulkPushBtn.disabled = false;
    dom.bulkPushBtn.innerHTML = origHTML;
}

export async function handleBulkRemove() {
    if (selection.size === 0) return;
    if (!confirm(`Remove ${selection.size} selected game(s) from queue?`)) return;

    const urls = [...selection];
    dom.bulkRemoveBtn.disabled = true;
    const origHTML = dom.bulkRemoveBtn.innerHTML;
    dom.bulkRemoveBtn.innerHTML = `<span class="spinner"></span> Removing...`;

    for (const url of urls) {
        await sendMessage(MSG.REMOVE_FROM_QUEUE, { url });
    }

    showToast(`Removed ${urls.length} game(s) from queue`, "info");
    selection.clear();
    await loadQueue();

    dom.bulkRemoveBtn.disabled = false;
    dom.bulkRemoveBtn.innerHTML = origHTML;
}

// ── Handlers ──

export async function handleRemove(gameUrl, name) {
    // Snapshot the full entry before deletion so we can restore via undo
    const snapshot = state.currentQueue.find((g) => g.url === gameUrl);
    const resp = await sendMessage(MSG.REMOVE_FROM_QUEUE, { url: gameUrl });
    if (resp?.ok) {
        if (snapshot) {
            showActionToast(
                `Removed: ${name || "Game"}`,
                { label: "Undo", onClick: () => restoreEntry(snapshot) },
                "info",
                5000,
            );
        } else {
            showToast(`Removed: ${name || "Game"}`, "info");
        }
        // Storage.onChanged listener will re-render the queue
    } else {
        showToast(resp?.error || "Failed to remove", "error");
    }
}

async function restoreEntry(entry) {
    if (!entry?.url) return;
    const resp = await sendMessage(MSG.ADD_TO_QUEUE, entry);
    if (resp?.ok) {
        showToast(`Restored: ${entry.name || "Game"}`, "success");
    } else {
        showToast(resp?.error || "Failed to restore", "error");
    }
}

export async function handleFieldUpdate(gameUrl, field, value) {
    const resp = await sendMessage(MSG.UPDATE_ENTRY, { url: gameUrl, fields: { [field]: value } });
    if (!resp?.ok) showToast(resp?.error || "Failed to update", "error");
}

export async function loadQueue() {
    const resp = await sendMessage(MSG.GET_QUEUE);
    const queue = resp?.ok ? resp.data : [];
    renderQueue(queue, dom.searchInput.value.trim());
}

export async function autoTriggerDedup(trigger) {
    const settingsResp = await sendMessage(MSG.GET_SETTINGS);
    const settings = settingsResp?.ok ? settingsResp.data : {};
    if (!settings.auto_dedup_queue) return;
    const resp = await sendMessage(MSG.DEDUP_QUEUE, { forceRefresh: false, trigger });
    if (resp?.ok && resp.removed > 0) {
        showToast(`Removed ${resp.removed} duplicate(s) already in remote`, "info", 3500);
        // storage.onChanged listener handles re-render
    }
}
