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
import { extractGameId, formatTime, truncate } from "../shared/utils.js";

const $ = (s) => document.querySelector(s);
const queueCountEl = $("#queueCount");
const queueGrid    = $("#queueGrid");
const emptyState   = $("#emptyState");
const searchInput  = $("#searchInput");
const refreshBtn   = $("#refreshBtn");
const pushAllBtn   = $("#pushAllBtn");
const clearAllBtn  = $("#clearAllBtn");

let currentQueue = [];

function sendMessage(type, data = null) {
    return chrome.runtime.sendMessage({ type, data });
}

function showToast(text, type = "info") {
    document.querySelectorAll(".toast").forEach((t) => t.remove());
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 300);
    }, 2500);
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
    const gameId = extractGameId(game.url) || game.url;
    const card = document.createElement("div");
    card.className = "game-card";
    card.dataset.url = game.url;

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
    }

    const removeBtn = document.createElement("button");
    removeBtn.className = "game-card-remove";
    removeBtn.title = "Remove from queue";
    removeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
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

    // Build options from detected tags (now an array) + presets
    const detectedTags = Array.isArray(game.tags) ? game.tags : [];
    const allOptions = buildGenreOptions(detectedTags, game.genre);

    const select = document.createElement("select");
    select.className = "select genre-select";

    for (const opt of allOptions) {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.selected) option.selected = true;
        if (opt.disabled) option.disabled = true;
        if (opt.className) option.className = opt.className;
        select.appendChild(option);
    }

    const customInput = document.createElement("input");
    customInput.type = "text";
    customInput.className = "input genre-custom-input";
    customInput.placeholder = "Type custom genre...";
    customInput.style.display = "none";

    const isCustom = game.genre && game.genre !== "N/A" &&
        !detectedTags.includes(game.genre) && !GENRE_PRESETS.includes(game.genre);
    if (isCustom) {
        select.value = "__other__";
        customInput.style.display = "block";
        customInput.value = game.genre;
    }

    select.addEventListener("change", () => {
        if (select.value === "__other__") {
            customInput.style.display = "block";
            customInput.focus();
        } else {
            customInput.style.display = "none";
            customInput.value = "";
            handleFieldUpdate(game.url, "genre", select.value);
        }
    });

    customInput.addEventListener("change", () => {
        const val = customInput.value.trim();
        if (val) handleFieldUpdate(game.url, "genre", val);
    });

    inputWrap.append(select, customInput);
    row.append(label, inputWrap);
    return row;
}

function buildGenreOptions(detectedTags, currentGenre) {
    const options = [];
    const seen = new Set();

    options.push({ value: "", label: "\u2014 Select genre \u2014", disabled: true, selected: !currentGenre });

    if (detectedTags.length > 0) {
        options.push({ value: "", label: "\u2500\u2500 From this game \u2500\u2500", disabled: true, className: "optgroup-label" });
        for (const tag of detectedTags) {
            if (seen.has(tag.toLowerCase())) continue;
            seen.add(tag.toLowerCase());
            options.push({ value: tag, label: tag, selected: currentGenre === tag });
        }
    }

    const unseen = GENRE_PRESETS.filter((p) => !seen.has(p.toLowerCase()));
    if (unseen.length > 0) {
        options.push({ value: "", label: "\u2500\u2500 Common genres \u2500\u2500", disabled: true, className: "optgroup-label" });
        for (const preset of unseen) {
            options.push({ value: preset, label: preset, selected: currentGenre === preset });
        }
    }

    options.push({ value: "", label: "\u2500\u2500\u2500\u2500\u2500\u2500", disabled: true });
    options.push({ value: "__other__", label: "Other (type custom)..." });

    return options;
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

// ── Handlers ──

async function handleRemove(gameUrl, name) {
    const resp = await sendMessage(MSG.REMOVE_FROM_QUEUE, { url: gameUrl });
    if (resp?.ok) {
        showToast(`Removed: ${name || "Game"}`, "info");
        await loadQueue();
    } else {
        showToast(resp?.error || "Failed to remove", "error");
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
        const target = resp.target ? ` \u2192 ${resp.target}` : "";
        showToast(`Pushed ${resp.pushed} game(s)${label}${target}`, "success");
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
    pushAllBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg> Push All`;
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
    clearAllBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Clear`;
});

// ── Keyboard shortcuts ──
document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey && e.key === "f") || (e.key === "/" && document.activeElement !== searchInput)) {
        e.preventDefault();
        searchInput.focus();
    }
    if (e.key === "Escape" && document.activeElement === searchInput) {
        searchInput.value = "";
        renderQueue(currentQueue, "");
        searchInput.blur();
    }
});

document.addEventListener("DOMContentLoaded", loadQueue);
