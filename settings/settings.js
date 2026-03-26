// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Settings page logic – itch.io version.
 * Includes push_format selector (url_only / full_object).
 */

import {DEFAULT_SETTINGS, MSG} from "../shared/constants.js";
import {formatTime} from "../shared/utils.js";

const $ = (s) => document.querySelector (s);

const FIELD_IDS = [
    "github_owner", "github_repo", "github_branch", "github_token",
    "committer_name", "committer_email",
    "gpg_enabled",
    "auto_push_threshold", "commit_prefix", "push_format",
    "cache_ttl_minutes",
    "log_level", "log_max_entries",
];

function sendMessage (type, data = null) {
    return chrome.runtime.sendMessage ({type, data});
}

function showToast (text, type = "info") {
    const toast = document.createElement ("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = text;
    document.body.appendChild (toast);
    setTimeout (() => {
        toast.classList.add ("fade-out");
        setTimeout (() => toast.remove (), 300);
    }, 2500);
}

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
}

async function init () {
    await loadSettingsIntoForm ();
    bindEvents ();
    document.querySelectorAll (".settings-section")
            .forEach ((el, i) => {
                el.style.opacity = "0";
                setTimeout (() => {
                    el.classList.add ("fade-in");
                    el.style.opacity = "";
                }, i * 80);
            });
}

document.addEventListener ("DOMContentLoaded", init);
