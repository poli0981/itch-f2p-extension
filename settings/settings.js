// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Settings page logic – itch.io version.
 * Includes push_format selector (url_only / full_object).
 */

import {DEFAULT_SETTINGS, MSG, QUEUE_MAX} from "../shared/constants.js";
import {formatTime, makeQueueEntry} from "../shared/utils.js";
import {$, sendMessage, showToast, initTheme, getThemeMode, setThemeMode} from "../shared/ui.js";

// Apply theme as early as possible to avoid flash
initTheme ();

const FIELD_IDS = [
    "github_owner", "github_repo", "github_branch", "github_token",
    "committer_name", "committer_email",
    "gpg_enabled",
    "auto_push_threshold", "commit_prefix", "push_format",
    "cache_ttl_minutes",
    "log_level", "log_max_entries",
];

// ── Load ──

async function loadSettingsIntoForm () {
    const resp = await sendMessage (MSG.GET_SETTINGS);
    if (!resp?.ok) return;
    const settings = resp.data;

    for (const id of FIELD_IDS) {
        const el = $ (`#${id}`);
        if (!el) continue;
        if (el.type === "checkbox") el.checked = !!settings[id];
        else if (el.type === "number") el.value = settings[id] ?? DEFAULT_SETTINGS[id] ?? "";
        else el.value = settings[id] ?? "";
    }

    $ ("#gpgFields").style.display = $ ("#gpg_enabled").checked ? "flex" : "none";
    await loadGPGKeyInfo ();
}

async function loadGPGKeyInfo () {
    const resp = await sendMessage (MSG.GPG_GET_KEY_META);
    const meta = resp?.ok ? resp.data : null;
    const infoEl = $ ("#gpgKeyInfo");

    if (!meta) {
        infoEl.style.display = "none";
        return;
    }

    infoEl.style.display = "block";
    infoEl.innerHTML = "";

    const lines = [
        `Fingerprint : ${formatFingerprint (meta.fingerprint)}`,
        `Algorithm   : ${meta.algorithm}`,
        `Key ID      : ${meta.keyId}`,
        `Created     : ${meta.created ? formatTime (meta.created) : "Unknown"}`,
        `Expires     : ${meta.expires ? formatTime (meta.expires) : "Never"}`,
    ];
    if (meta.userIDs && meta.userIDs.length > 0) {
        const rawUID = meta.userIDs[0] || "";
        const cleanUID = rawUID.replace (/&lt;/g, "<")
                               .replace (/&gt;/g, ">")
                               .replace (/&amp;/g, "&");
        lines.push (`User ID     : ${cleanUID}`);
    }

    const pre = document.createElement ("pre");
    pre.style.cssText = "margin:0; white-space:pre-wrap; font-family:var(--font-mono); font-size:11px; line-height:1.6;";
    pre.textContent = lines.join ("\n");
    infoEl.appendChild (pre);

    const removeBtn = document.createElement ("button");
    removeBtn.className = "btn btn-danger btn-sm";
    removeBtn.style.marginTop = "8px";
    removeBtn.textContent = "Remove Key";
    removeBtn.addEventListener ("click", async () => {
        await sendMessage (MSG.GPG_REMOVE_KEY);
        showToast ("GPG key removed", "info");
        await loadGPGKeyInfo ();
    });
    infoEl.appendChild (removeBtn);
}

function formatFingerprint (fp) {
    if (!fp) return "Unknown";
    return fp.match (/.{1,4}/g)
             ?.join (" ") || fp;
}

async function handleGPGImport () {
    const armoredKey = $ ("#gpg_private_key")
        .value
        .trim ();
    const passphrase = $ ("#gpg_passphrase").value;
    const btn = $ ("#importKeyBtn");

    if (!armoredKey) {
        showToast ("Paste your armored private key first", "warning");
        return;
    }

    btn.disabled = true;
    btn.textContent = "Validating...";

    const valResp = await sendMessage (MSG.GPG_VALIDATE_KEY, {armoredKey});
    const valData = valResp?.ok ? valResp.data : null;

    if (!valData || !valData.valid) {
        showToast (valData?.error || "Invalid key", "error");
        btn.disabled = false;
        btn.textContent = "Import & Validate Key";
        return;
    }

    btn.textContent = "Importing...";
    const importResp = await sendMessage (MSG.GPG_IMPORT_KEY, {armoredKey, passphrase});

    if (importResp?.ok) {
        showToast (`Key imported: ${importResp.meta?.algorithm || "GPG"} key`, "success");
        $ ("#gpg_private_key").value = "";
        $ ("#gpg_passphrase").value = "";
        await loadGPGKeyInfo ();
    }
    else {
        if (importResp?.needsPassphrase) showToast ("Key is encrypted \u2014 enter passphrase and try again", "warning");
        else showToast (importResp?.error || "Import failed", "error");
    }

    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Import &amp; Validate Key`;
}

// ── Collect & Save ──

function collectSettings () {
    const settings = {};
    for (const id of FIELD_IDS) {
        const el = $ (`#${id}`);
        if (!el) continue;
        if (el.type === "checkbox") settings[id] = el.checked;
        else if (el.type === "number") settings[id] = parseInt (el.value, 10) || DEFAULT_SETTINGS[id] || 0;
        else settings[id] = el.value.trim ();
    }
    return settings;
}

async function saveSettings () {
    const btn = $ ("#saveBtn");
    const origText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Saving...`;

    const settings = collectSettings ();
    const resp = await sendMessage (MSG.SAVE_SETTINGS, settings);

    if (resp?.ok) {
        btn.innerHTML = `\u2713 Saved`;
        showToast ("Settings saved", "success");
        setTimeout (() => {
            btn.innerHTML = origText;
            btn.disabled = false;
        }, 1500);
    }
    else {
        showToast ("Failed to save settings", "error");
        btn.innerHTML = origText;
        btn.disabled = false;
    }
}

// ── Test Connection ──

async function testConnection () {
    const statusEl = $ ("#connectionStatus");
    const btn = $ ("#testConnectionBtn");
    const owner = $ ("#github_owner")
        .value
        .trim ();
    const repo = $ ("#github_repo")
        .value
        .trim ();
    const token = $ ("#github_token")
        .value
        .trim ();

    if (!owner || !repo || !token) {
        statusEl.textContent = "\u2717 Fill in owner, repo, and token first";
        statusEl.className = "connection-status error";
        return;
    }

    btn.disabled = true;
    statusEl.textContent = "Testing...";
    statusEl.className = "connection-status";

    try {
        const resp = await fetch (`https://api.github.com/repos/${owner}/${repo}`, {
            headers: {Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json"},
        });
        if (resp.ok) {
            const data = await resp.json ();
            statusEl.textContent = `\u2713 Connected to ${data.full_name}`;
            statusEl.className = "connection-status success";
        }
        else if (resp.status === 401) {
            statusEl.textContent = "\u2717 Invalid token";
            statusEl.className = "connection-status error";
        }
        else if (resp.status === 404) {
            statusEl.textContent = "\u2717 Repository not found";
            statusEl.className = "connection-status error";
        }
        else {
            statusEl.textContent = `\u2717 HTTP ${resp.status}`;
            statusEl.className = "connection-status error";
        }
    }
    catch (err) {
        statusEl.textContent = `\u2717 Network error: ${err.message}`;
        statusEl.className = "connection-status error";
    }
    finally {
        btn.disabled = false;
    }
}

// ── Log viewer ──

async function loadLogs () {
    const level = $ ("#logFilterLevel").value;
    const category = $ ("#logFilterCategory").value;
    const resp = await sendMessage (MSG.GET_LOGS, {level, category});
    const logs = resp?.ok ? resp.data : [];

    $ ("#logCount").textContent = `${logs.length} entries`;
    const container = $ ("#logEntries");
    container.innerHTML = "";

    if (logs.length === 0) {
        container.innerHTML = '<div class="log-entry"><span class="log-msg text-muted">No log entries</span></div>';
        return;
    }

    const reversed = [...logs].reverse ();
    for (const entry of reversed) {
        const row = document.createElement ("div");
        row.className = "log-entry";
        row.innerHTML = `
      <span class="log-time">${formatTime (entry.timestamp)}</span>
      <span class="log-level ${entry.level}">${entry.level}</span>
      <span class="log-cat">${entry.category}</span>
      <span class="log-msg">${escapeHtml (entry.message)}</span>`;
        container.appendChild (row);
    }
}

function escapeHtml (str) {
    const div = document.createElement ("div");
    div.textContent = str || "";
    return div.innerHTML;
}

async function exportLogs () {
    const resp = await sendMessage (MSG.EXPORT_LOGS);
    if (!resp?.ok) {
        showToast ("Failed to export logs", "error");
        return;
    }
    const blob = new Blob ([resp.data], {type: "application/json"});
    const url = URL.createObjectURL (blob);
    const a = document.createElement ("a");
    a.href = url;
    a.download = `itch-f2p-tracker-logs-${new Date ().toISOString ()
                                                     .slice (0, 10)}.json`;
    a.click ();
    URL.revokeObjectURL (url);
    showToast ("Logs exported", "success");
}

async function clearLogs () {
    await sendMessage (MSG.CLEAR_LOGS);
    showToast ("Logs cleared", "info");
    await loadLogs ();
}

// ── Reset ──

let resetTimer = null;

function initiateReset () {
    $ ("#resetBtn").style.display = "none";
    $ ("#resetConfirmBtn").style.display = "inline-flex";
    resetTimer = setTimeout (() => {
        $ ("#resetConfirmBtn").style.display = "none";
        $ ("#resetBtn").style.display = "inline-flex";
    }, 5000);
}

async function confirmReset () {
    clearTimeout (resetTimer);
    const resp = await sendMessage (MSG.RESET_EXTENSION);
    if (resp?.ok) {
        showToast ("Extension reset to defaults", "warning");
        setTimeout (() => loadSettingsIntoForm (), 500);
        $ ("#resetConfirmBtn").style.display = "none";
        $ ("#resetBtn").style.display = "inline-flex";
    }
    else {
        showToast ("Reset failed", "error");
    }
}

// ── Backup / Restore ──

async function exportQueue () {
    const resp = await sendMessage (MSG.GET_QUEUE);
    const queue = resp?.ok ? resp.data : [];
    if (!Array.isArray (queue) || queue.length === 0) {
        showToast ("Queue is empty — nothing to export", "warning");
        return;
    }
    const payload = {
        format: "itch-f2p-queue",
        exported_at: new Date ().toISOString (),
        count: queue.length,
        entries: queue,
    };
    const json = JSON.stringify (payload, null, 2);
    const blob = new Blob ([json], {type: "application/json"});
    const url = URL.createObjectURL (blob);
    const a = document.createElement ("a");
    a.href = url;
    a.download = `itch-queue-${new Date ().toISOString ()
                                           .slice (0, 10)}.json`;
    a.click ();
    URL.revokeObjectURL (url);
    showToast (`Exported ${queue.length} game(s)`, "success");
}

async function importQueueFromFile (file) {
    if (!file) return;
    const statusEl = $ ("#importStatus");
    statusEl.textContent = "Reading file...";
    statusEl.classList.remove ("error", "success");

    let parsed;
    try {
        const text = await file.text ();
        parsed = JSON.parse (text);
    }
    catch (err) {
        statusEl.textContent = `\u2717 Invalid JSON: ${err.message}`;
        statusEl.classList.add ("error");
        showToast ("Invalid JSON file", "error");
        return;
    }

    // Accept two shapes: wrapped {entries: [...]} or raw array
    const entries = Array.isArray (parsed) ? parsed : Array.isArray (parsed?.entries) ? parsed.entries : null;
    if (!entries) {
        statusEl.textContent = "\u2717 File does not contain a queue array";
        statusEl.classList.add ("error");
        return;
    }

    if (entries.length > QUEUE_MAX) {
        statusEl.textContent = `\u2717 Too many entries (${entries.length}). Limit is ${QUEUE_MAX}.`;
        statusEl.classList.add ("error");
        return;
    }

    let added = 0;
    let skipped = 0;
    const errors = [];

    for (const raw of entries) {
        if (!raw || typeof raw !== "object" || !raw.url || !raw.name) {
            skipped++;
            continue;
        }
        // Rebuild entry from whitelisted fields via makeQueueEntry (strips unknown keys)
        const sanitized = makeQueueEntry (raw);
        // Preserve user-editable fields if present in the source
        if (raw.genre) sanitized.genre = String (raw.genre).slice (0, 100);
        if (raw.safe_virus) sanitized.safe_virus = String (raw.safe_virus).slice (0, 10);
        if (raw.notes) sanitized.notes = String (raw.notes).slice (0, 500);

        const resp = await sendMessage (MSG.ADD_TO_QUEUE, sanitized);
        if (resp?.ok) added++;
        else {
            skipped++;
            if (errors.length < 3 && resp?.error) errors.push (resp.error);
        }
    }

    const summary = `Imported ${added}, skipped ${skipped}${errors.length ? ` (${errors.join ("; ")})` : ""}`;
    statusEl.textContent = `\u2713 ${summary}`;
    statusEl.classList.add ("success");
    showToast (summary, added > 0 ? "success" : "warning");
}

// ── Statistics ──

async function refreshStats () {
    const [queueResp, logsResp] = await Promise.all ([
        sendMessage (MSG.GET_QUEUE),
        sendMessage (MSG.GET_LOGS),
    ]);

    const queue = queueResp?.ok ? queueResp.data : [];
    const logs = logsResp?.ok ? logsResp.data : [];

    const total = queue.length;
    const nsfwCount = queue.filter ((g) => g.nsfw === "Yes").length;

    // Total pushed: sum of logged push-success events
    const pushRe = /Successfully pushed (\d+)|Pushed (\d+)/;
    let totalPushed = 0;
    for (const entry of logs) {
        if (entry.category !== "push") continue;
        const m = String (entry.message || "").match (pushRe);
        if (m) totalPushed += parseInt (m[1] || m[2], 10) || 0;
    }

    // Top genre histogram from queue
    const genreCounts = new Map ();
    for (const g of queue) {
        const genre = (
            g.genre || ""
        ).trim ();
        if (!genre || genre === "N/A") continue;
        genreCounts.set (genre, (
            genreCounts.get (genre) || 0
        ) + 1);
    }
    let topGenre = "\u2014";
    let topCount = 0;
    for (const [g, c] of genreCounts) {
        if (c > topCount) {
            topCount = c;
            topGenre = g;
        }
    }

    $ ("#statQueueSize").textContent = String (total);
    $ ("#statNsfwPct").textContent = total > 0
                                     ? `${nsfwCount} (${Math.round ((
        nsfwCount / total
    ) * 100)}%)`
                                     : "0";
    $ ("#statTotalPushed").textContent = String (totalPushed);
    $ ("#statTopGenre").textContent = topCount > 0 ? `${topGenre} (${topCount})` : "\u2014";
}

// ── Events ──

function bindEvents () {
    $ ("#saveBtn")
        .addEventListener ("click", saveSettings);
    $ ("#toggleTokenBtn")
        .addEventListener ("click", () => {
            const input = $ ("#github_token");
            input.type = input.type === "password" ? "text" : "password";
        });
    $ ("#testConnectionBtn")
        .addEventListener ("click", testConnection);
    $ ("#gpg_enabled")
        .addEventListener ("change", (e) => {
            $ ("#gpgFields").style.display = e.target.checked ? "flex" : "none";
        });
    $ ("#importKeyBtn")
        .addEventListener ("click", handleGPGImport);
    $ ("#refreshCacheBtn")
        .addEventListener ("click", async () => {
            const btn = $ ("#refreshCacheBtn");
            btn.disabled = true;
            btn.textContent = "Refreshing...";
            const resp = await sendMessage (MSG.REFRESH_CACHE);
            if (resp?.ok) showToast (`Cache refreshed: ${resp.data.urlCount} known URLs`, "success");
            else showToast (resp?.error || "Cache refresh failed", "error");
            btn.disabled = false;
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Refresh Cache Now`;
        });
    $ ("#viewLogsBtn")
        .addEventListener ("click", () => {
            const viewer = $ ("#logViewer");
            const isHidden = viewer.style.display === "none";
            viewer.style.display = isHidden ? "block" : "none";
            if (isHidden) loadLogs ();
        });
    $ ("#logFilterLevel")
        .addEventListener ("change", loadLogs);
    $ ("#logFilterCategory")
        .addEventListener ("change", loadLogs);
    $ ("#exportLogsBtn")
        .addEventListener ("click", exportLogs);
    $ ("#clearLogsBtn")
        .addEventListener ("click", clearLogs);
    $ ("#resetBtn")
        .addEventListener ("click", initiateReset);
    $ ("#resetConfirmBtn")
        .addEventListener ("click", confirmReset);

    // Backup & restore
    $ ("#exportQueueBtn")
        .addEventListener ("click", exportQueue);
    $ ("#importQueueBtn")
        .addEventListener ("click", () => $ ("#importQueueInput").click ());
    $ ("#importQueueInput")
        .addEventListener ("change", async (e) => {
            const file = e.target.files?.[0];
            await importQueueFromFile (file);
            e.target.value = "";  // reset so same file can be re-imported later
            refreshStats ();
        });

    // Stats refresh
    $ ("#refreshStatsBtn")
        .addEventListener ("click", refreshStats);

    // Theme picker
    for (const radio of document.querySelectorAll ("input[name='theme_mode']")) {
        radio.addEventListener ("change", async (e) => {
            if (e.target.checked) {
                await setThemeMode (e.target.value);
                showToast (`Theme: ${e.target.value}`, "info", 1500);
            }
        });
    }
}

async function syncThemePicker () {
    const mode = await getThemeMode ();
    const radio = document.querySelector (`input[name='theme_mode'][value='${mode}']`);
    if (radio) radio.checked = true;
}

async function init () {
    await loadSettingsIntoForm ();
    await syncThemePicker ();
    bindEvents ();
    refreshStats ();
    document.querySelectorAll (".settings-section")
            .forEach ((el, i) => {
                el.style.opacity = "0";
                setTimeout (() => {
                    el.classList.add ("fade-in");
                    el.style.opacity = "";
                }, i * 80);
            });
}

// ── Auto-refresh when storage changes externally ──
chrome.storage.onChanged.addListener ((changes, area) => {
    if (area !== "local") return;
    if (changes.settings) {
        // Re-sync form without overwriting in-flight edits: only if not currently typing
        if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
            loadSettingsIntoForm ();
        }
    }
    if (changes["gpg:key_meta"]) {
        loadGPGKeyInfo ();
    }
    if (changes.queue || changes.logs) {
        refreshStats ();
    }
});

document.addEventListener ("DOMContentLoaded", init);
