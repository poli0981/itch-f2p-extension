// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Popup logic – adapted from Steam extension for itch.io fields.
 *
 * Key differences:
 *   - URL-based identity (no appid)
 *   - itch.io-specific badges: NSFW, Made With, Status
 *   - No anti-cheat display
 *   - Tab detection uses *.itch.io pattern
 */

import { MSG, QUEUE_MAX } from "../shared/constants.js";
import { truncate } from "../shared/utils.js";
import { $, sendMessage, showToast, openOrFocusTab, initTheme } from "../shared/ui.js";
import { icon } from "../shared/icons.js";

// Apply theme as early as possible to avoid flash of wrong theme
initTheme();

const versionEl        = $("#version");
const statusDot        = $("#statusDot");
const detectedLoading  = $("#detectedLoading");
const detectedContent  = $("#detectedContent");
const detectedNone     = $("#detectedNone");
const detectedDuplicate = $("#detectedDuplicate");
const detectedThumb    = $("#detectedThumb");
const detectedName     = $("#detectedName");
const detectedGenre    = $("#detectedGenre");
const detectedDev      = $("#detectedDev");
const detectedBadges   = $("#detectedBadges");
const addBtn           = $("#addBtn");
const queueCount       = $("#queueCount");
const queueBar         = $("#queueBar");
const pushBtn          = $("#pushBtn");
const openQueueBtn     = $("#openQueueBtn");
const openSettingsBtn  = $("#openSettingsBtn");
const activityList     = $("#activityList");
const rescanBtn        = $("#rescanBtn");

// Module state: track current queue size + last detected game so the
// addBtn can reactively reflect queue-full when storage changes.
let currentQueueSize = 0;
let _lastDetected = null;  // {game, dupData} — null after add or in non-actionable branches

/**
 * Format the target segment of a push-success toast.
 * Shows per-file breakdown when the push spanned multiple data files.
 */
function formatPushTarget(resp) {
    if (Array.isArray(resp.files) && resp.files.length > 1) {
        const parts = resp.files.map((f) => `${f.name}${f.isNew ? " (new)" : ""} +${f.added}`);
        return ` → ${resp.files.length} files: ${parts.join(", ")}`;
    }
    if (Array.isArray(resp.files) && resp.files.length === 1) {
        return ` → ${resp.files[0].name}${resp.files[0].isNew ? " (new)" : ""}`;
    }
    return resp.target ? ` → ${resp.target}` : "";
}

// ── Init ──

async function init() {
    const manifest = chrome.runtime.getManifest();
    versionEl.textContent = `v${manifest.version}`;

    const settings = await checkConnection();
    await checkFirstRun(settings);
    await loadDetectedGame();
    await loadQueueStatus();
    await loadActivity();
    bindEvents();

    document.querySelectorAll(".popup-section").forEach((el, i) => {
        el.style.opacity = "0";
        setTimeout(() => {
            el.classList.add("fade-in");
            el.style.opacity = "";
        }, i * 60);
    });
}

async function checkConnection() {
    const resp = await sendMessage(MSG.GET_SETTINGS);
    const s = resp?.ok ? resp.data : {};
    const connected = !!(s.github_owner && s.github_repo && s.github_token);
    statusDot.className = `status-dot ${connected ? "online" : "offline"}`;
    statusDot.title = connected
        ? `Connected: ${s.github_owner}/${s.github_repo}`
        : "GitHub not configured \u2014 click Settings";
    return s;
}

async function checkFirstRun(settings) {
    if (settings.github_owner && settings.github_repo && settings.github_token) return;

    const section = $("#detectedSection");
    const banner = document.createElement("div");
    banner.className = "first-run-banner";
    banner.innerHTML = `
    <p><strong>Welcome!</strong> Configure your GitHub connection to start tracking games.</p>
    <button class="btn btn-primary btn-sm" id="firstRunSetupBtn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
      </svg>
      Open Settings
    </button>`;
    section.insertBefore(banner, section.firstChild.nextSibling);
    banner.querySelector("#firstRunSetupBtn").addEventListener("click", () => {
        openOrFocusTab("settings/settings.html");
        window.close();
    });
}

async function loadDetectedGame() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const onItchGamePage = !!(tab?.url && tab.url.match(/[a-z0-9-]+\.itch\.io\/[a-z0-9-]+/i));

        if (!tab || !onItchGamePage) {
            showNoGame(false);
            return;
        }

        const resp = await sendMessage("GET_DETECTED_GAME", { tabId: tab.id });

        if (resp?.ok && resp.data) {
            const game = resp.data;
            const dupResp = await sendMessage(MSG.CHECK_DUPLICATE, { url: game.url });
            const dupData = dupResp?.ok ? dupResp.data : {};
            showDetectedGame(game, dupData);
        } else {
            setTimeout(async () => {
                if (detectedLoading.style.display === "none") return;
                const retry = await sendMessage("GET_DETECTED_GAME", { tabId: tab.id });
                if (retry?.ok && retry.data) {
                    const dupResp2 = await sendMessage(MSG.CHECK_DUPLICATE, { url: retry.data.url });
                    showDetectedGame(retry.data, dupResp2?.ok ? dupResp2.data : {});
                } else {
                    showNoGame(true);  // on itch.io but no detection → offer rescan
                }
            }, 1200);
        }
    } catch {
        showNoGame(false);
    }
}

/**
 * Re-inject the content script into the active tab to retry detection.
 * Used when automatic detection failed (e.g. content loaded via SPA after initial script).
 */
async function rescanCurrentTab() {
    rescanBtn.disabled = true;
    const origHTML = rescanBtn.innerHTML;
    rescanBtn.innerHTML = `<span class="spinner"></span> Scanning...`;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) throw new Error("No active tab");

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content/detector.js"],
        });

        // Give detector a moment to run and post its result to the SW
        setTimeout(async () => {
            detectedLoading.style.display = "block";
            detectedNone.style.display = "none";
            await loadDetectedGame();
            rescanBtn.innerHTML = origHTML;
            rescanBtn.disabled = false;
        }, 500);
    } catch (err) {
        showToast(`Scan failed: ${err.message || err}`, "error");
        rescanBtn.innerHTML = origHTML;
        rescanBtn.disabled = false;
    }
}

function showDetectedGame(game, dupData = {}) {
    detectedLoading.style.display = "none";
    detectedNone.style.display = "none";
    detectedContent.style.display = "block";

    detectedThumb.src = game.thumbnail || "";
    detectedThumb.alt = game.name || "";
    detectedName.textContent = truncate(game.name, 45) || "Unknown Game";
    detectedGenre.textContent = game.genre && game.genre !== "N/A" ? game.genre : "Unknown";
    detectedDev.textContent = truncate(game.dev && game.dev !== "N/A" ? game.dev : "Unknown", 30);

    // ── Extra info line ──
    const extraInfo = $("#detectedExtraInfo");
    if (extraInfo) {
        const parts = [];
        const platformsStr = Array.isArray(game.platforms) ? game.platforms.join(" \u00B7 ") : (game.platforms || "");
        if (platformsStr && platformsStr !== "N/A") parts.push(platformsStr);
        const madeStr = Array.isArray(game.made_with) ? game.made_with.join(", ") : (game.made_with || "");
        if (madeStr && madeStr !== "N/A") parts.push(madeStr);
        if (game.status && game.status !== "N/A") parts.push(game.status);
        extraInfo.textContent = parts.join("  \u00B7  ");
        extraInfo.style.display = parts.length > 0 ? "block" : "none";
    }

    // ── Description preview ──
    const descEl = $("#detectedDesc");
    if (descEl) {
        if (game.description && game.description !== "N/A") {
            descEl.textContent = truncate(game.description, 100);
            descEl.title = game.description;
            descEl.style.display = "block";
        } else {
            descEl.style.display = "none";
        }
    }

    // ── Badges ──
    detectedBadges.innerHTML = "";

    // Paid game
    if (game.is_free === false) {
        appendBadge(detectedBadges, game.price ? `Paid (${game.price})` : "Paid", "error");
        addBtn.disabled = true;
        addBtn.removeAttribute("data-reason");
        addBtn.textContent = "Not Free \u2014 Ignored";
        detectedDuplicate.style.display = "none";
        _lastDetected = null;  // not actionable from this state
        return;
    }

    // Free game
    appendBadge(detectedBadges, "Free", "success");

    // NSFW
    if (game.nsfw === "Yes") {
        appendBadge(detectedBadges, "NSFW", "warning");
    }

    // Rating
    if (game.rating && game.rating !== "N/A") {
        const ratingNum = parseFloat(game.rating);
        if (!isNaN(ratingNum)) {
            const stars = "\u2605".repeat(Math.round(ratingNum));
            appendBadge(detectedBadges, `${ratingNum.toFixed(1)} ${stars}`, "info");
        }
    }

    // ── Duplicate ──
    if (dupData.isDuplicate) {
        detectedDuplicate.style.display = "block";
        const sourceLabel = dupData.source === "remote" ? "already in tracker" : "already in queue";
        detectedDuplicate.textContent = "";
        const dupSpan = document.createElement("span");
        dupSpan.className = "text-sm";
        dupSpan.style.color = "var(--accent-yellow)";
        dupSpan.textContent = `\u26A0 Duplicate \u2014 ${sourceLabel}`;
        detectedDuplicate.appendChild(dupSpan);
        addBtn.disabled = true;
        addBtn.removeAttribute("data-reason");
        addBtn.textContent = "Already Tracked";
        _lastDetected = null;  // not actionable from this state
    } else {
        _lastDetected = { game, dupData };
        applyEnabledOrQueueFullState();

        if (dupData.warning) {
            appendBadge(detectedBadges, "Local check only", "warning");
        }
    }
}

/**
 * Render the addBtn for the "free + not duplicate" branch \u2014 either enabled
 * for adding, or disabled with the "queue full" reason when the queue is at
 * capacity. Called from showDetectedGame() initially and from updateQueueUI()
 * whenever the queue size changes while the popup is open.
 */
function applyEnabledOrQueueFullState() {
    detectedDuplicate.style.display = "none";
    if (currentQueueSize >= QUEUE_MAX) {
        addBtn.disabled = true;
        addBtn.dataset.reason = "queue-full";
        addBtn.textContent = "Queue full \u2014 push first";
    } else {
        addBtn.disabled = false;
        addBtn.removeAttribute("data-reason");
        addBtn.innerHTML = `${icon("plus", { strokeWidth: 2.5 })} Add to Queue`;
    }
}

function appendBadge(container, text, type) {
    const badge = document.createElement("span");
    badge.className = `badge badge-${type}`;
    badge.textContent = text;
    container.appendChild(badge);
}

function showNoGame(offerRescan = false) {
    detectedLoading.style.display = "none";
    detectedContent.style.display = "none";
    detectedDuplicate.style.display = "none";
    detectedNone.style.display = "block";
    // Offer rescan only when we're on an itch.io game URL but detection failed
    if (rescanBtn) rescanBtn.style.display = offerRescan ? "inline-flex" : "none";
}

async function loadQueueStatus() {
    const resp = await sendMessage(MSG.GET_QUEUE_SIZE);
    const size = resp?.ok ? resp.data : 0;
    updateQueueUI(size);
}

function updateQueueUI(size) {
    currentQueueSize = size;
    queueCount.textContent = size;
    const pct = (size / QUEUE_MAX) * 100;
    queueBar.style.width = `${pct}%`;
    queueBar.className = "queue-bar-fill" +
        (pct >= 100 ? " full" : pct >= 80 ? " warning" : "");
    pushBtn.disabled = size === 0;

    // Reactive: if the popup is showing a free + non-duplicate detected game,
    // flip addBtn between "Add to Queue" and "Queue full — push first" as
    // capacity changes (queue cleared in another tab, pushed, etc.).
    if (_lastDetected) applyEnabledOrQueueFullState();
}

async function loadActivity() {
    const resp = await sendMessage(MSG.GET_LOGS);
    if (!resp?.ok || !resp.data?.length) return;

    const recent = resp.data.slice(-5).reverse();
    activityList.innerHTML = "";

    for (const entry of recent) {
        const item = document.createElement("div");
        item.className = "activity-item";

        const dot = document.createElement("span");
        dot.className = `activity-dot ${entry.level}`;

        const text = document.createElement("span");
        text.className = "activity-text truncate";
        text.textContent = entry.message;

        const time = document.createElement("span");
        time.className = "activity-time";
        const d = new Date(entry.timestamp);
        time.textContent = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;

        item.append(dot, text, time);
        activityList.appendChild(item);
    }
}

// ── Events ──

function bindEvents() {
    addBtn.addEventListener("click", async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        const resp = await sendMessage("GET_DETECTED_GAME", { tabId: tab.id });
        if (!resp?.ok || !resp.data) {
            showToast("No game detected on this page", "warning");
            return;
        }

        addBtn.disabled = true;
        addBtn.innerHTML = `<span class="spinner"></span> Adding...`;

        const addResp = await sendMessage(MSG.ADD_TO_QUEUE, resp.data);

        if (addResp?.ok) {
            _lastDetected = null;  // freeze button \u2014 don't let updateQueueUI override "Added"
            addBtn.innerHTML = `\u2713 Added`;
            addBtn.removeAttribute("data-reason");
            addBtn.classList.remove("btn-success");
            addBtn.classList.add("btn-ghost");
            updateQueueUI(addResp.data.queueSize);
            showToast(`Added: ${resp.data.name || "Game"}`, "success");
            await loadActivity();
        } else {
            showToast(addResp?.error || "Failed to add", "error");
            await loadQueueStatus();  // re-render addBtn (may now show "Queue full")
        }
    });

    pushBtn.addEventListener("click", async () => {
        pushBtn.disabled = true;
        const origText = pushBtn.innerHTML;
        pushBtn.innerHTML = `<span class="spinner"></span> Pushing...`;

        const resp = await sendMessage(MSG.PUSH_QUEUE);

        if (resp?.ok) {
            const label = resp.signed ? " (signed)" : "";
            const target = formatPushTarget(resp);
            showToast(`Pushed ${resp.pushed} game(s)${label}${target}`, "success", 3200);
            updateQueueUI(resp.remaining || 0);
            await loadActivity();
        } else if (resp?.gpgFailed) {
            const fallback = confirm(`GPG signing failed: ${resp.error}\n\nPush unsigned instead?`);
            if (fallback) {
                pushBtn.innerHTML = `<span class="spinner"></span> Unsigned...`;
                const unsignedResp = await sendMessage(MSG.PUSH_QUEUE_UNSIGNED);
                if (unsignedResp?.ok) {
                    showToast(`Pushed ${unsignedResp.pushed} game(s) (unsigned)`, "success");
                    updateQueueUI(unsignedResp.remaining || 0);
                    await loadActivity();
                } else {
                    showToast(unsignedResp?.error || "Push failed", "error");
                }
            }
        } else {
            showToast(resp?.error || "Push failed", "error");
        }

        pushBtn.innerHTML = origText;
        pushBtn.disabled = false;
        await loadQueueStatus();
    });

    openQueueBtn.addEventListener("click", () => {
        openOrFocusTab("queue/queue.html");
        window.close();
    });

    openSettingsBtn.addEventListener("click", () => {
        openOrFocusTab("settings/settings.html");
        window.close();
    });

    if (rescanBtn) rescanBtn.addEventListener("click", rescanCurrentTab);
}

// ── Live queue count update when storage changes (popup open) ──
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.queue) return;
    const size = Array.isArray(changes.queue.newValue) ? changes.queue.newValue.length : 0;
    updateQueueUI(size);
});

// ── Keyboard shortcuts ──
document.addEventListener("keydown", (e) => {
    const focused = document.activeElement;
    const inInput = focused?.tagName === "INPUT" || focused?.tagName === "TEXTAREA";

    if (e.key === "Enter" && !inInput && !addBtn.disabled) {
        e.preventDefault();
        addBtn.click();
    } else if (e.ctrlKey && (e.key === "p" || e.key === "P") && !pushBtn.disabled) {
        e.preventDefault();
        pushBtn.click();
    } else if (e.ctrlKey && (e.key === "q" || e.key === "Q")) {
        e.preventDefault();
        openQueueBtn.click();
    } else if (e.key === "Escape") {
        window.close();
    }
});

document.addEventListener("DOMContentLoaded", init);
