// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * In-page toast layer for itch.io pages.
 *
 * Runs as a content script BEFORE detector.js. Exposes
 * `window.__itchF2P.toast.show({kind, name, action})` for the detector to call
 * after the service worker decides what to do with the detected game.
 *
 * Why Shadow DOM:
 *   itch.io ships its own global CSS that would otherwise override our toast
 *   styles. The shared/theme.css from the extension cannot reach the host page
 *   either. Shadow DOM gives us a self-contained style scope at zero cost.
 *
 * Per-URL session dedup:
 *   Showing the same toast every time a user revisits or refreshes a tab is
 *   noise. We track {url, kind} pairs in a closure-scoped Set; repeats are
 *   silently dropped.
 */

(function () {
    "use strict";

    if (window.__itchF2P && window.__itchF2P.toast) return; // idempotent

    // Per-URL dedup: Set of "${url}::${kind}" already shown in this page lifetime.
    const _shown = new Set ();

    // Host + shadow root, created lazily on first toast.
    let _host = null;
    let _shadow = null;
    let _container = null;

    function ensureMount () {
        if (_container) return;

        _host = document.createElement ("div");
        _host.id = "__itch-f2p-toast-host";
        // Reset all inheritance from host page (itch.io may set "all" rules).
        _host.style.cssText = "all: initial; position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;";

        _shadow = _host.attachShadow ({mode: "closed"});

        const style = document.createElement ("style");
        style.textContent = `
            :host { all: initial; }

            .stack {
                position: fixed;
                bottom: 16px;
                right: 16px;
                display: flex;
                flex-direction: column-reverse;
                gap: 10px;
                z-index: 2147483647;
                pointer-events: none;
            }

            .toast {
                pointer-events: auto;
                min-width: 240px;
                max-width: 360px;
                padding: 12px 16px;
                border-radius: 10px;
                color: #fff;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                font-size: 13px;
                font-weight: 500;
                line-height: 1.4;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25), 0 2px 6px rgba(0, 0, 0, 0.15);
                display: flex;
                align-items: center;
                gap: 10px;
                opacity: 0;
                transform: translateY(12px) scale(0.96);
                animation: toast-in 0.25s ease forwards;
            }

            .toast.fade-out {
                animation: toast-out 0.25s ease forwards;
            }

            .toast .msg {
                flex: 1;
                word-break: break-word;
            }

            .toast .action-btn {
                flex-shrink: 0;
                background: rgba(255, 255, 255, 0.22);
                color: inherit;
                border: 1px solid rgba(255, 255, 255, 0.35);
                padding: 4px 10px;
                border-radius: 6px;
                font-family: inherit;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.4px;
                text-transform: uppercase;
                cursor: pointer;
                transition: background 0.15s ease;
            }

            .toast .action-btn:hover {
                background: rgba(255, 255, 255, 0.35);
            }

            .toast.kind-added    { background: #4FC978; }
            .toast.kind-removed  { background: #6B7280; }
            .toast.kind-paid     { background: #FFCB4A; color: #1A1A1A; }
            .toast.kind-paid .action-btn { border-color: rgba(0, 0, 0, 0.25); background: rgba(0, 0, 0, 0.1); }
            .toast.kind-dup      { background: #FA5C5C; }
            .toast.kind-error    { background: #E74C3C; }
            .toast.kind-queue_full { background: #E74C3C; }

            @keyframes toast-in {
                from { opacity: 0; transform: translateY(12px) scale(0.96); }
                to   { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes toast-out {
                from { opacity: 1; transform: translateY(0) scale(1); }
                to   { opacity: 0; transform: translateY(12px) scale(0.96); }
            }
        `;

        _container = document.createElement ("div");
        _container.className = "stack";

        _shadow.append (style, _container);

        // documentElement is always present even before body parses.
        (document.documentElement || document.body).appendChild (_host);
    }

    function formatText (kind, name) {
        const safe = name && String (name).trim () ? String (name).trim () : "Unknown";
        switch (kind) {
            case "added":       return `Game "${safe}" added`;
            case "removed":     return `Removed "${safe}" from queue`;
            case "paid":        return `Game "${safe}" not free`;
            case "dup":         return `"${safe}" already in database`;
            case "queue_full":  return `Queue full (150/150) — push first`;
            case "error":       return `Could not verify "${safe}" — skipped`;
            default:            return safe;
        }
    }

    /**
     * Show a toast.
     *
     * @param {object} opts
     * @param {"added"|"paid"|"dup"|"queue_full"|"error"} opts.kind
     * @param {string} [opts.name]            Game name to embed in message
     * @param {string} [opts.dedupKey]        Override dedup key (default: url + kind)
     * @param {{label: string, onClick: () => void}} [opts.action]  Optional action button
     * @param {number} [opts.duration]        Auto-dismiss ms (default 4000, 6000 with action)
     */
    function show (opts = {}) {
        const {kind, name, dedupKey, action} = opts;
        if (!kind) return;

        const key = dedupKey || `${location.href}::${kind}`;
        if (_shown.has (key)) return;
        _shown.add (key);

        ensureMount ();

        const toast = document.createElement ("div");
        toast.className = `toast kind-${kind}`;

        const msg = document.createElement ("span");
        msg.className = "msg";
        msg.textContent = formatText (kind, name);
        toast.appendChild (msg);

        let dismissed = false;
        const dismiss = () => {
            if (dismissed) return;
            dismissed = true;
            toast.classList.add ("fade-out");
            setTimeout (() => toast.remove (), 250);
        };

        if (action && typeof action.onClick === "function") {
            const btn = document.createElement ("button");
            btn.type = "button";
            btn.className = "action-btn";
            btn.textContent = action.label || "Undo";
            btn.addEventListener ("click", () => {
                try { action.onClick (); }
                finally { dismiss (); }
            });
            toast.appendChild (btn);
        }

        _container.appendChild (toast);

        const duration = typeof opts.duration === "number"
                         ? opts.duration
                         : (action ? 6000 : 4000);
        setTimeout (dismiss, duration);
    }

    window.__itchF2P = window.__itchF2P || {};
    window.__itchF2P.toast = {show};
}) ();
