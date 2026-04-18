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
 * Uses chrome.runtime.getContexts (MV3, Chrome 116+) to discover tabs across all
 * windows without requiring the "tabs" permission. getContexts returns only
 * contexts owned by this extension, so it's safe and privacy-preserving.
 *
 * Previously used chrome.tabs.query({url}) which silently fails on inactive tabs
 * without the "tabs" permission — meaning it only found the queue/settings tab
 * when it happened to be the currently active tab.
 *
 * @param {string} relativeUrl - Path relative to extension root (e.g. "queue/queue.html")
 * @returns {Promise<{tabId: number, windowId: number}|chrome.tabs.Tab>}
 */
export async function openOrFocusTab (relativeUrl) {
    const fullUrl = chrome.runtime.getURL (relativeUrl);

    // Preferred path: find existing extension tab via runtime.getContexts
    if (typeof chrome.runtime.getContexts === "function") {
        try {
            const contexts = await chrome.runtime.getContexts ({
                contextTypes: ["TAB"],
                documentUrls: [fullUrl],
            });
            if (contexts.length > 0) {
                // Prefer a tab in the currently focused window if we can identify one;
                // otherwise just pick the first.
                let target = contexts[0];
                try {
                    const currentWindow = await chrome.windows.getCurrent ();
                    const sameWindow = contexts.find ((c) => c.windowId === currentWindow.id);
                    if (sameWindow) target = sameWindow;
                }
                catch {
                    // windows API unavailable — keep first context
                }

                await chrome.tabs.update (target.tabId, {active: true});
                if (typeof target.windowId === "number") {
                    try {
                        await chrome.windows.update (target.windowId, {focused: true});
                    }
                    catch {
                        // windows API may be unavailable — not critical
                    }
                }
                return {tabId: target.tabId, windowId: target.windowId};
            }
        }
        catch {
            // getContexts failed for some reason — fall through to create
        }
    }

    // No existing tab found, or getContexts unavailable (Chrome < 116) — create new
    return chrome.tabs.create ({url: fullUrl});
}
