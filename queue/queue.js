// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Queue page logic – itch.io version.
 *
 * Key differences from Steam extension:
 *   - URL-based identity (extractGameId returns normalized URL)
 *   - Auto fields: dev (string), status, made_with, rating, nsfw, avg_session, inputs
 *   - Editable fields: genre (tag-select), safe_virus, notes (no type_game/anti_cheat)
 *   - NSFW badge overlay on thumbnail
 *   - Tags are comma-separated string (not array)
 */

import { MSG, EDITABLE_FIELDS, GENRE_PRESETS } from "../shared/constants.js";
import { formatTime, truncate } from "../shared/utils.js";
import { $, sendMessage, showToast, showActionToast, initTheme, createCombobox } from "../shared/ui.js";
import { icon } from "../shared/icons.js";

// Apply theme as early as possible to avoid flash
initTheme();

const queueCountEl = $("#queueCount");
const queueGrid    = $("#queueGrid");
const emptyState   = $("#emptyState");
const searchInput  = $("#searchInput");
const refreshBtn   = $("#refreshBtn");
const pushAllBtn   = $("#pushAllBtn");
const clearAllBtn  = $("#clearAllBtn");

// ── Bulk selection toolbar ──
const bulkToolbar       = $("#bulkToolbar");
const bulkCount         = $("#bulkCount");
const bulkSelectAllBtn  = $("#bulkSelectAllBtn");
const bulkClearBtn      = $("#bulkClearBtn");
const bulkRemoveBtn     = $("#bulkRemoveBtn");
const bulkPushBtn       = $("#bulkPushBtn");
const bulkRemoveCount   = $("#bulkRemoveCount");
const bulkPushCount     = $("#bulkPushCount");

let currentQueue = [];
let filteredUrls = [];  // URLs currently visible after search filter (preserves order)
const selection = new Set();  // Selected URLs
let lastAnchorUrl = null;  // Last checkbox toggled, for Shift+click range select

/**
 * Format the target segment of a push-success toast.
 * Shows per-file breakdown when the push spanned multiple data files.
 */
function formatPushTarget(resp) {
    if (Array.isArray(resp.files) && resp.files.length > 1) {
        const parts = resp.files.map((f) => `${f.name}${f.isNew ? " (new)" : ""} +${f.added}`);
        return ` \u2192 ${resp.files.length} files: ${parts.join(", ")}`;
    }
    if (Array.isArray(resp.files) && resp.files.length === 1) {
        return ` \u2192 ${resp.files[0].name}${resp.files[0].isNew ? " (new)" : ""}`;
    }
    return resp.target ? ` \u2192 ${resp.target}` : "";
}

// ── Render ──

function renderQueue(queue, filter = "") {
    currentQueue = queue;
    queueCountEl.textContent = queue.length;
    pushAllBtn.disabled = queue.length === 0;
    clearAllBtn.disabled = queue.length === 0;

    let filtered = queue;
    if (filter) {
        const q = filter.toLowerCase();
        filtered = queue.filter((g) => {
            const tagsStr = Array.isArray(g.tags) ? g.tags.join(" ") : (g.tags || "");
            const madeStr = Array.isArray(g.made_with) ? g.made_with.join(" ") : (g.made_with || "");
            return (g.name || "").toLowerCase().includes(q) ||
                   (g.genre || "").toLowerCase().includes(q) ||
                   (g.dev || "").toLowerCase().includes(q) ||
                   (g.url || "").toLowerCase().includes(q) ||
                   tagsStr.toLowerCase().includes(q) ||
                   madeStr.toLowerCase().includes(q);
        });
    }

    filteredUrls = filtered.map((g) => g.url);

    // Prune selection to only include URLs still present in queue
    for (const url of [...selection]) {
        if (!queue.some((g) => g.url === url)) {
            selection.delete(url);
        }
    }
    updateBulkToolbar();

    if (filtered.length === 0) {
        queueGrid.innerHTML = "";
        queueGrid.style.display = "none";
        emptyState.style.display = "flex";
        if (filter && queue.length > 0) {
            emptyState.querySelector("p").textContent = "No matches found";
            emptyState.querySelector(".text-sm").textContent =
                `${queue.length} game(s) in queue, but none match "${filter}".`;
        } else {
            emptyState.querySelector("p").textContent = "Queue is empty";
            emptyState.querySelector(".text-sm").textContent =
                'Browse itch.io game pages and click "Add to Queue" to get started.';
        }
        return;
    }

    emptyState.style.display = "none";
    queueGrid.style.display = "grid";
    queueGrid.innerHTML = "";

    for (let i = 0; i < filtered.length; i++) {
        const card = createCard(filtered[i]);
        card.classList.add("slide-in");
        card.style.animationDelay = `${Math.min(i * 40, 400)}ms`;
        queueGrid.appendChild(card);
    }
}

function createCard(game) {
    const card = document.createElement("div");
    card.className = "game-card";
    card.dataset.url = game.url;
    card.draggable = true;
    if (selection.has(game.url)) card.classList.add("selected");

    // Drag & drop for manual reordering
    card.addEventListener("dragstart", handleDragStart);
    card.addEventListener("dragover", handleDragOver);
    card.addEventListener("dragleave", handleDragLeave);
    card.addEventListener("drop", handleDrop);
    card.addEventListener("dragend", handleDragEnd);

    // ── Header with thumbnail ──
    const header = document.createElement("div");
    header.className = "game-card-header";

    const thumb = document.createElement("img");
    thumb.className = "game-card-thumb";
    thumb.src = game.thumbnail || "";
    thumb.alt = game.name || "";
    thumb.loading = "lazy";
    thumb.onerror = () => { thumb.src = ""; };

    // NSFW badge overlay
    if (game.nsfw === "Yes") {
        const nsfwBadge = document.createElement("span");
        nsfwBadge.className = "game-card-nsfw-badge";
        nsfwBadge.textContent = "NSFW";
        header.appendChild(nsfwBadge);
        card.classList.add("has-nsfw");
    }

    // Drag handle (visible on hover)
    const dragHandle = document.createElement("span");
    dragHandle.className = "game-card-drag-handle";
    dragHandle.title = "Drag to reorder";
    dragHandle.innerHTML = icon("grip-vertical", { size: 16, strokeWidth: 2 });
    dragHandle.addEventListener("mousedown", () => { card.classList.add("drag-ready"); });
    dragHandle.addEventListener("mouseup", () => { card.classList.remove("drag-ready"); });
    header.appendChild(dragHandle);

    // Bulk-select checkbox
    const selectBox = document.createElement("input");
    selectBox.type = "checkbox";
    selectBox.className = "game-card-select";
    selectBox.title = "Select for bulk action (Shift+click for range)";
    selectBox.checked = selection.has(game.url);
    selectBox.addEventListener("click", (e) => {
        e.stopPropagation();
        if (e.shiftKey && lastAnchorUrl && lastAnchorUrl !== game.url) {
            applyRangeSelection(lastAnchorUrl, game.url, selectBox.checked);
        } else {
            toggleSelection(game.url, selectBox.checked);
        }
        lastAnchorUrl = game.url;
    });
    header.appendChild(selectBox);

    const removeBtn = document.createElement("button");
    removeBtn.className = "game-card-remove";
    removeBtn.title = "Remove from queue";
    removeBtn.innerHTML = icon("x", { strokeWidth: 2.5 });
    removeBtn.addEventListener("click", () => handleRemove(game.url, game.name));

    header.append(thumb, removeBtn);

    // ── Body ──
    const body = document.createElement("div");
    body.className = "game-card-body";

    const nameEl = document.createElement("div");
    nameEl.className = "game-card-name truncate";
    nameEl.textContent = game.name || "Unknown Game";
    nameEl.title = game.name || "";

    const meta = document.createElement("div");
    meta.className = "game-card-meta";

    if (game.genre && game.genre !== "N/A") meta.appendChild(makeMetaTag(game.genre));
    if (game.dev && game.dev !== "N/A") meta.appendChild(makeMetaTag(truncate(game.dev, 25)));
    const platformsStr = Array.isArray(game.platforms) ? game.platforms.join(" \u00B7 ") : (game.platforms || "");
    if (platformsStr && platformsStr !== "N/A") meta.appendChild(makeMetaTag(truncate(platformsStr, 20)));
    meta.appendChild(makeMetaTag(formatTime(game.added_at)));

    body.append(nameEl, meta);

    // ── Auto-detected info panel ──
    const autoToggle = document.createElement("button");
    autoToggle.className = "game-card-toggle auto-toggle";
    autoToggle.textContent = "\u25BE Game Info (auto-detected)";
    autoToggle.addEventListener("click", () => {
        const panel = card.querySelector(".game-card-auto");
        const isOpen = panel.classList.toggle("open");
        autoToggle.textContent = isOpen ? "\u25B4 Hide Game Info" : "\u25BE Game Info (auto-detected)";
    });

    const autoPanel = document.createElement("div");
    autoPanel.className = "game-card-auto";

    // Description
    if (game.description && game.description !== "N/A") {
        autoPanel.appendChild(makeAutoRow("Description", truncate(game.description, 200), game.description));
    }

    // Core info
    // Core info — handle both strings and arrays
    const autoFields = [
        ["Developer", game.dev],
        ["Status", game.status],
        ["Release", game.release_date],
        ["Publisher", game.publisher],
        ["Platforms", Array.isArray(game.platforms) ? game.platforms.join(", ") : game.platforms],
        ["Made With", Array.isArray(game.made_with) ? game.made_with.join(", ") : game.made_with],
        ["Languages", Array.isArray(game.languages) ? game.languages.join(", ") : game.languages],
        ["Avg Session", game.average_session],
        ["Inputs", Array.isArray(game.inputs) ? game.inputs.join(", ") : game.inputs],
        ["NSFW", game.nsfw],
    ];

    for (const [label, value] of autoFields) {
        if (value && value !== "N/A" && value !== "" && value !== "No") {
            autoPanel.appendChild(makeAutoRow(label, value));
        }
    }

    // Rating
    if (game.rating && game.rating !== "N/A") {
        const ratingText = game.rating_count && game.rating_count !== "N/A"
            ? `${game.rating} (${game.rating_count} ratings)`
            : game.rating;
        autoPanel.appendChild(makeAutoRow("Rating", ratingText));
    }

    // Tags (now an array, not comma-separated string)
    const tagList = Array.isArray(game.tags) ? game.tags : [];
    if (tagList.length > 0) {
        const tagRow = document.createElement("div");
        tagRow.className = "auto-row";

        const tagLabel = document.createElement("span");
        tagLabel.className = "auto-label";
        tagLabel.textContent = "Tags";

        const tagContainer = document.createElement("div");
        tagContainer.className = "auto-tags";
        for (const t of tagList) {
            const chip = document.createElement("span");
            chip.className = "tag-chip";
            chip.textContent = t;
            tagContainer.appendChild(chip);
        }

        tagRow.append(tagLabel, tagContainer);
        autoPanel.appendChild(tagRow);
    }

    // ── Editable fields panel ──
    const editToggle = document.createElement("button");
    editToggle.className = "game-card-toggle edit-toggle";
    editToggle.textContent = "\u25BE Edit fields";
    editToggle.addEventListener("click", () => {
        const panel = card.querySelector(".game-card-fields");
        const isOpen = panel.classList.toggle("open");
        editToggle.textContent = isOpen ? "\u25B4 Hide fields" : "\u25BE Edit fields";
    });

    const fieldsPanel = document.createElement("div");
    fieldsPanel.className = "game-card-fields";

    // Genre: tag-select
    fieldsPanel.appendChild(createGenreField(game));

    // Other editable fields
    for (const [key, def] of Object.entries(EDITABLE_FIELDS)) {
        if (key === "genre") continue;

        const row = document.createElement("div");
        row.className = "field-row";

        const label = document.createElement("span");
        label.className = "field-label";
        label.textContent = def.label;

        const inputWrap = document.createElement("div");
        inputWrap.className = "field-input";

        let input;
        if (def.type === "select") {
            input = document.createElement("select");
            input.className = "select";
            for (const opt of def.options) {
                const option = document.createElement("option");
                option.value = opt;
                option.textContent = opt;
                if (game[key] === opt) option.selected = true;
                input.appendChild(option);
            }
        } else {
            input = document.createElement("input");
            input.type = "text";
            input.className = "input";
            input.placeholder = def.placeholder || "";
            input.value = game[key] || "";
        }

        input.dataset.field = key;
        input.addEventListener("change", () => handleFieldUpdate(game.url, key, input.value));

        inputWrap.appendChild(input);
        row.append(label, inputWrap);
        fieldsPanel.appendChild(row);
    }

    card.append(header, body, autoToggle, autoPanel, editToggle, fieldsPanel);
    return card;
}

// ── Genre tag-select ──

function createGenreField(game) {
    const row = document.createElement("div");
    row.className = "field-row genre-field";

    const label = document.createElement("span");
    label.className = "field-label";
    label.textContent = "Genre";

    const inputWrap = document.createElement("div");
    inputWrap.className = "field-input genre-select-wrap";

    // Build option groups from detected tags + presets (deduplicated)
    const detectedTags = Array.isArray(game.tags) ? game.tags : [];
    const seenLower = new Set();
    const dedupedDetected = [];
    for (const t of detectedTags) {
        const k = t.toLowerCase();
        if (!seenLower.has(k)) { seenLower.add(k); dedupedDetected.push(t); }
    }
    const unseenPresets = GENRE_PRESETS.filter((p) => !seenLower.has(p.toLowerCase()));

    const groups = [];
    if (dedupedDetected.length > 0) {
        groups.push({ label: "From this game", items: dedupedDetected });
    }
    if (unseenPresets.length > 0) {
        groups.push({ label: "Common genres", items: unseenPresets });
    }

    const combo = createCombobox({
        value: game.genre && game.genre !== "N/A" ? game.genre : "",
        placeholder: "Select or type genre...",
        groups,
        allowFreeText: true,
        onCommit: (v) => handleFieldUpdate(game.url, "genre", v),
    });
    combo.root.classList.add("genre-combo");

    inputWrap.appendChild(combo.root);
    row.append(label, inputWrap);
    return row;
}

// ── Helpers ──

function makeAutoRow(labelText, value, fullText) {
    const row = document.createElement("div");
    row.className = "auto-row";
    const label = document.createElement("span");
    label.className = "auto-label";
    label.textContent = labelText;
    const val = document.createElement("span");
    val.className = "auto-value";
    val.textContent = value;
    if (fullText && fullText !== value) val.title = fullText;
    row.append(label, val);
    return row;
}

function makeMetaTag(text) {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
}

// ── Drag & drop reordering ──

let dragSourceUrl = null;

function handleDragStart(e) {
    const card = e.currentTarget;
    dragSourceUrl = card.dataset.url;
    card.classList.add("dragging");
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", dragSourceUrl); } catch {}
    }
}

function handleDragOver(e) {
    if (!dragSourceUrl) return;
    e.preventDefault();
    const card = e.currentTarget;
    if (card.dataset.url === dragSourceUrl) return;
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

    // Visual drop indicator (before/after based on mouse position)
    const rect = card.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const isBefore = e.clientY < midpoint;
    card.classList.toggle("drop-before", isBefore);
    card.classList.toggle("drop-after", !isBefore);
}

function handleDragLeave(e) {
    const card = e.currentTarget;
    card.classList.remove("drop-before", "drop-after");
}

async function handleDrop(e) {
    e.preventDefault();
    if (!dragSourceUrl) return;

    const targetCard = e.currentTarget;
    const targetUrl = targetCard.dataset.url;
    const rect = targetCard.getBoundingClientRect();
    const isBefore = e.clientY < rect.top + rect.height / 2;

    targetCard.classList.remove("drop-before", "drop-after");

    if (targetUrl === dragSourceUrl) return;

    // Compute new order from current DOM state, moving source relative to target
    const currentOrder = [...queueGrid.querySelectorAll(".game-card")].map((c) => c.dataset.url);
    const srcIdx = currentOrder.indexOf(dragSourceUrl);
    if (srcIdx >= 0) currentOrder.splice(srcIdx, 1);
    let tgtIdx = currentOrder.indexOf(targetUrl);
    if (tgtIdx < 0) tgtIdx = currentOrder.length;
    if (!isBefore) tgtIdx++;
    currentOrder.splice(tgtIdx, 0, dragSourceUrl);

    // Merge with full queue (filtered view might only show a subset)
    const filteredSet = new Set(currentOrder);
    const fullOrder = [];
    // First pass: add all reordered filtered items in their new order
    fullOrder.push(...currentOrder);
    // Second pass: append any queue entries NOT in the filtered view, preserving original order
    for (const entry of currentQueue) {
        if (!filteredSet.has(entry.url)) fullOrder.push(entry.url);
    }

    const resp = await sendMessage(MSG.REORDER_QUEUE, { orderedUrls: fullOrder });
    if (!resp?.ok) {
        showToast(resp?.error || "Reorder failed", "error");
    }
    // Storage.onChanged listener will re-render
}

function handleDragEnd(e) {
    e.currentTarget.classList.remove("dragging", "drag-ready");
    // Clear any lingering drop indicators
    for (const c of queueGrid.querySelectorAll(".drop-before, .drop-after")) {
        c.classList.remove("drop-before", "drop-after");
    }
    dragSourceUrl = null;
}

// ── Bulk selection ──

function toggleSelection(url, checked) {
    if (checked) selection.add(url);
    else selection.delete(url);
    applySelectionUI(url);
    updateBulkToolbar();
}

function applyRangeSelection(fromUrl, toUrl, targetState) {
    const fromIdx = filteredUrls.indexOf(fromUrl);
    const toIdx = filteredUrls.indexOf(toUrl);
    if (fromIdx < 0 || toIdx < 0) {
        toggleSelection(toUrl, targetState);
        return;
    }
    const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
    for (let i = start; i <= end; i++) {
        const url = filteredUrls[i];
        if (targetState) selection.add(url);
        else selection.delete(url);
        applySelectionUI(url);
    }
    updateBulkToolbar();
}

function applySelectionUI(url) {
    const card = queueGrid.querySelector(`.game-card[data-url="${CSS.escape(url)}"]`);
    if (!card) return;
    const checkbox = card.querySelector(".game-card-select");
    const selected = selection.has(url);
    card.classList.toggle("selected", selected);
    if (checkbox) checkbox.checked = selected;
}

function selectAllVisible() {
    for (const url of filteredUrls) selection.add(url);
    for (const url of filteredUrls) applySelectionUI(url);
    updateBulkToolbar();
}

function clearSelection() {
    const prev = [...selection];
    selection.clear();
    for (const url of prev) applySelectionUI(url);
    lastAnchorUrl = null;
    updateBulkToolbar();
}

function updateBulkToolbar() {
    const n = selection.size;
    if (n === 0) {
        bulkToolbar.style.display = "none";
        return;
    }
    bulkToolbar.style.display = "flex";
    bulkCount.textContent = String(n);
    bulkRemoveCount.textContent = String(n);
    bulkPushCount.textContent = String(n);
}

async function handleBulkPush() {
    if (selection.size === 0) return;
    if (!confirm(`Push ${selection.size} selected game(s) to GitHub?`)) return;

    const urls = [...selection];
    bulkPushBtn.disabled = true;
    const origHTML = bulkPushBtn.innerHTML;
    bulkPushBtn.innerHTML = `<span class="spinner"></span> Pushing ${urls.length}...`;

    const resp = await sendMessage(MSG.PUSH_QUEUE, { urls });

    if (resp?.ok) {
        const label = resp.signed ? " (GPG signed)" : "";
        const target = formatPushTarget(resp);
        showToast(`Pushed ${resp.pushed} game(s)${label}${target}`, "success", 3200);
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

    bulkPushBtn.disabled = false;
    bulkPushBtn.innerHTML = origHTML;
}

async function handleBulkRemove() {
    if (selection.size === 0) return;
    if (!confirm(`Remove ${selection.size} selected game(s) from queue?`)) return;

    const urls = [...selection];
    bulkRemoveBtn.disabled = true;
    const origHTML = bulkRemoveBtn.innerHTML;
    bulkRemoveBtn.innerHTML = `<span class="spinner"></span> Removing...`;

    for (const url of urls) {
        await sendMessage(MSG.REMOVE_FROM_QUEUE, { url });
    }

    showToast(`Removed ${urls.length} game(s) from queue`, "info");
    selection.clear();
    await loadQueue();

    bulkRemoveBtn.disabled = false;
    bulkRemoveBtn.innerHTML = origHTML;
}

// ── Handlers ──

async function handleRemove(gameUrl, name) {
    // Snapshot the full entry before deletion so we can restore via undo
    const snapshot = currentQueue.find((g) => g.url === gameUrl);
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

async function handleFieldUpdate(gameUrl, field, value) {
    const resp = await sendMessage(MSG.UPDATE_ENTRY, { url: gameUrl, fields: { [field]: value } });
    if (!resp?.ok) showToast(resp?.error || "Failed to update", "error");
}

async function loadQueue() {
    const resp = await sendMessage(MSG.GET_QUEUE);
    const queue = resp?.ok ? resp.data : [];
    renderQueue(queue, searchInput.value.trim());
}

// ── Events ──

searchInput.addEventListener("input", () => renderQueue(currentQueue, searchInput.value.trim()));

refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    await loadQueue();
    refreshBtn.disabled = false;
    showToast("Queue refreshed", "info");
});

pushAllBtn.addEventListener("click", async () => {
    if (currentQueue.length === 0) return;
    if (!confirm(`Push ${currentQueue.length} game(s) to GitHub?`)) return;

    pushAllBtn.disabled = true;
    pushAllBtn.innerHTML = `<span class="spinner"></span> Pushing...`;

    const resp = await sendMessage(MSG.PUSH_QUEUE);

    if (resp?.ok) {
        const label = resp.signed ? " (GPG signed)" : "";
        const target = formatPushTarget(resp);
        showToast(`Pushed ${resp.pushed} game(s)${label}${target}`, "success", 3200);
        await loadQueue();
    } else if (resp?.gpgFailed) {
        const fallback = confirm(`GPG signing failed: ${resp.error}\n\nPush unsigned instead?`);
        if (fallback) {
            pushAllBtn.innerHTML = `<span class="spinner"></span> Unsigned...`;
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

    pushAllBtn.disabled = false;
    pushAllBtn.innerHTML = `${icon("arrow-up", { strokeWidth: 2.5 })} Push All`;
});

clearAllBtn.addEventListener("click", async () => {
    if (currentQueue.length === 0) return;
    if (!confirm(`Remove all ${currentQueue.length} game(s) from queue?\nThis cannot be undone.`)) return;

    clearAllBtn.disabled = true;
    clearAllBtn.textContent = "Clearing...";

    for (const game of currentQueue) {
        if (game.url) await sendMessage(MSG.REMOVE_FROM_QUEUE, { url: game.url });
    }

    showToast(`Cleared ${currentQueue.length} game(s) from queue`, "info");
    await loadQueue();

    clearAllBtn.disabled = false;
    clearAllBtn.innerHTML = `${icon("trash")} Clear`;
});

// ── Bulk toolbar button bindings ──
bulkSelectAllBtn.addEventListener("click", selectAllVisible);
bulkClearBtn.addEventListener("click", clearSelection);
bulkPushBtn.addEventListener("click", handleBulkPush);
bulkRemoveBtn.addEventListener("click", handleBulkRemove);

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
    if ((e.ctrlKey && e.key === "f") || (e.key === "/" && document.activeElement !== searchInput)) {
        e.preventDefault();
        searchInput.focus();
        return;
    }

    // Escape: clear search first, then selection
    if (e.key === "Escape") {
        if (document.activeElement === searchInput) {
            searchInput.value = "";
            renderQueue(currentQueue, "");
            searchInput.blur();
        } else if (selection.size > 0) {
            clearSelection();
        }
    }
});

// ── Auto-refresh when queue changes (add from popup, push elsewhere, etc.) ──
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.queue) return;
    const newQueue = Array.isArray(changes.queue.newValue) ? changes.queue.newValue : [];
    renderQueue(newQueue, searchInput.value.trim());
});

document.addEventListener("DOMContentLoaded", loadQueue);
