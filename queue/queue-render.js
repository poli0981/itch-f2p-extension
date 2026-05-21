// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Queue page rendering — builds the queue grid and game cards.
 *
 * Extracted from queue.js (v1.9.1 refactor).
 *
 * NOTE: imports event handlers from queue-actions.js, which in turn imports
 * renderQueue from here. This circular import is safe — every cross-module
 * reference is used only inside a function body at runtime, never during
 * module evaluation.
 */

import { EDITABLE_FIELDS, GENRE_PRESETS } from "../shared/constants.js";
import { formatTime, truncate } from "../shared/utils.js";
import { createCombobox } from "../shared/ui.js";
import { icon } from "../shared/icons.js";
import { dom, selection, state } from "./queue-state.js";
import {
    applyRangeSelection,
    handleDragEnd,
    handleDragLeave,
    handleDragOver,
    handleDragStart,
    handleDrop,
    handleFieldUpdate,
    handleRemove,
    toggleSelection,
    updateBulkToolbar,
} from "./queue-actions.js";

// ── Render ──

export function renderQueue(queue, filter = "") {
    state.currentQueue = queue;
    dom.queueCount.textContent = queue.length;
    dom.pushAllBtn.disabled = queue.length === 0;
    dom.clearAllBtn.disabled = queue.length === 0;

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

    state.filteredUrls = filtered.map((g) => g.url);

    // Prune selection to only include URLs still present in queue
    for (const url of [...selection]) {
        if (!queue.some((g) => g.url === url)) {
            selection.delete(url);
        }
    }
    updateBulkToolbar();

    if (filtered.length === 0) {
        dom.queueGrid.innerHTML = "";
        dom.queueGrid.style.display = "none";
        dom.emptyState.style.display = "flex";
        if (filter && queue.length > 0) {
            dom.emptyState.querySelector("p").textContent = "No matches found";
            dom.emptyState.querySelector(".text-sm").textContent =
                `${queue.length} game(s) in queue, but none match "${filter}".`;
        } else {
            dom.emptyState.querySelector("p").textContent = "Queue is empty";
            dom.emptyState.querySelector(".text-sm").textContent =
                'Browse itch.io game pages and click "Add to Queue" to get started.';
        }
        return;
    }

    dom.emptyState.style.display = "none";
    dom.queueGrid.style.display = "grid";
    dom.queueGrid.innerHTML = "";

    for (let i = 0; i < filtered.length; i++) {
        const card = createCard(filtered[i]);
        card.classList.add("slide-in");
        card.style.animationDelay = `${Math.min(i * 40, 400)}ms`;
        dom.queueGrid.appendChild(card);
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
        if (e.shiftKey && state.lastAnchorUrl && state.lastAnchorUrl !== game.url) {
            applyRangeSelection(state.lastAnchorUrl, game.url, selectBox.checked);
        } else {
            toggleSelection(game.url, selectBox.checked);
        }
        state.lastAnchorUrl = game.url;
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
    const platformsStr = Array.isArray(game.platforms) ? game.platforms.join(" · ") : (game.platforms || "");
    if (platformsStr && platformsStr !== "N/A") meta.appendChild(makeMetaTag(truncate(platformsStr, 20)));
    meta.appendChild(makeMetaTag(formatTime(game.added_at)));

    body.append(nameEl, meta);

    // ── Auto-detected info panel ──
    const autoToggle = document.createElement("button");
    autoToggle.className = "game-card-toggle auto-toggle";
    autoToggle.textContent = "▾ Game Info (auto-detected)";
    autoToggle.addEventListener("click", () => {
        const panel = card.querySelector(".game-card-auto");
        const isOpen = panel.classList.toggle("open");
        autoToggle.textContent = isOpen ? "▴ Hide Game Info" : "▾ Game Info (auto-detected)";
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
    editToggle.textContent = "▾ Edit fields";
    editToggle.addEventListener("click", () => {
        const panel = card.querySelector(".game-card-fields");
        const isOpen = panel.classList.toggle("open");
        editToggle.textContent = isOpen ? "▴ Hide fields" : "▾ Edit fields";
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
