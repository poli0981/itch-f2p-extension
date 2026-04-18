// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Shared UI helpers for extension pages (popup, queue, settings).
 *
 * Consolidates helpers previously duplicated in each UI module:
 *   - DOM selection ($, $$)
 *   - Message passing to service worker (sendMessage)
 *   - Toast notifications (showToast)
 *   - Tab singleton (openOrFocusTab) — focus existing tab if found, else create
 */

/**
 * querySelector shortcut.
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
export const $ = (selector) => document.querySelector (selector);

/**
 * querySelectorAll returning a real array.
 * @param {string} selector
 * @returns {HTMLElement[]}
 */
export const $$ = (selector) => [...document.querySelectorAll (selector)];

/**
 * Send a message to the extension service worker.
 * @param {string} type - Message type from MSG constants
 * @param {any} [data=null]
 * @returns {Promise<any>}
 */
export function sendMessage (type, data = null) {
    return chrome.runtime.sendMessage ({type, data});
}

/**
 * Display an ephemeral toast notification.
 * Removes any existing toasts before showing the new one.
 *
 * @param {string} text - Toast content
 * @param {"info"|"success"|"warning"|"error"} [type="info"]
 * @param {number} [duration=2500] - Milliseconds before fade out
 */
export function showToast (text, type = "info", duration = 2500) {
    document.querySelectorAll (".toast")
            .forEach ((t) => t.remove ());
    const toast = document.createElement ("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = text;
    document.body.appendChild (toast);
    setTimeout (() => {
        toast.classList.add ("fade-out");
        setTimeout (() => toast.remove (), 300);
    }, duration);
}

/**
 * Display a toast with an action button (e.g. "Undo").
 * Action is invoked on button click; toast auto-dismisses after duration.
 *
 * @param {string} text - Main toast message
 * @param {{label: string, onClick: () => void}} action
 * @param {"info"|"success"|"warning"|"error"} [type="info"]
 * @param {number} [duration=5000]
 */
export function showActionToast (text, action, type = "info", duration = 5000) {
    document.querySelectorAll (".toast")
            .forEach ((t) => t.remove ());

    const toast = document.createElement ("div");
    toast.className = `toast toast-${type} toast-action`;

    const msg = document.createElement ("span");
    msg.className = "toast-msg";
    msg.textContent = text;

    const btn = document.createElement ("button");
    btn.className = "toast-action-btn";
    btn.type = "button";
    btn.textContent = action.label;

    let dismissed = false;
    const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        toast.classList.add ("fade-out");
        setTimeout (() => toast.remove (), 300);
    };

    btn.addEventListener ("click", () => {
        try {
            action.onClick ();
        }
        finally {
            dismiss ();
        }
    });

    toast.append (msg, btn);
    document.body.appendChild (toast);

    setTimeout (dismiss, duration);
}

/**
 * Open a bundled extension page in a tab, reusing the existing tab if already open.
 *
 * @param {string} relativeUrl - Path relative to extension root (e.g. "queue/queue.html")
 * @returns {Promise<chrome.tabs.Tab>}
 */
export async function openOrFocusTab (relativeUrl) {
    const fullUrl = chrome.runtime.getURL (relativeUrl);
    const tabs = await chrome.tabs.query ({url: fullUrl});
    if (tabs.length > 0) {
        const tab = tabs[0];
        await chrome.tabs.update (tab.id, {active: true});
        if (typeof tab.windowId === "number") {
            try {
                await chrome.windows.update (tab.windowId, {focused: true});
            }
            catch {
                // windows API may be unavailable in some contexts — not critical
            }
        }
        return tab;
    }
    return chrome.tabs.create ({url: fullUrl});
}
