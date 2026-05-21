// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Shared UI helpers for extension pages (popup, queue, settings).
 *
 * Consolidates helpers previously duplicated in each UI module:
 *   - DOM selection ($)
 *   - Message passing to service worker (sendMessage)
 *   - Toast notifications (showToast)
 *   - Tab singleton (openOrFocusTab) — focus existing tab if found, else create
 */

import { icon } from "./icons.js";

/**
 * querySelector shortcut.
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
export const $ = (selector) => document.querySelector (selector);

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

// ════════════════════════════════════════════════════════════
// Combobox — text input + filtered dropdown with keyboard nav
// ════════════════════════════════════════════════════════════

/**
 * Create a combobox widget: text input + grouped dropdown with fuzzy filtering,
 * keyboard navigation (ArrowUp/Down/Enter/Escape), free-text acceptance, and
 * click-outside dismissal.
 *
 * @param {object} opts
 * @param {string} [opts.value=""]              - Initial value
 * @param {string} [opts.placeholder]           - Input placeholder
 * @param {Array<{label: string, items: string[]}>} opts.groups - Option groups
 * @param {boolean} [opts.allowFreeText=true]   - Commit arbitrary typed value
 * @param {(v: string) => void} opts.onCommit   - Called when value is committed
 *                                                (select/Enter/blur-with-change)
 * @returns {{root: HTMLElement, input: HTMLInputElement, setValue: (v: string) => void}}
 */
export function createCombobox (opts) {
    const {
        value = "",
        placeholder = "",
        groups = [],
        allowFreeText = true,
        onCommit = () => {},
    } = opts;

    const root = document.createElement ("div");
    root.className = "combobox";

    const input = document.createElement ("input");
    input.type = "text";
    input.className = "input combobox-input";
    input.placeholder = placeholder;
    input.value = value;
    input.autocomplete = "off";
    input.setAttribute ("role", "combobox");
    input.setAttribute ("aria-autocomplete", "list");
    input.setAttribute ("aria-expanded", "false");

    const list = document.createElement ("div");
    list.className = "combobox-list";
    list.setAttribute ("role", "listbox");
    list.hidden = true;

    root.append (input, list);

    let activeIdx = -1;
    let currentItems = [];   // Flat list of {label, value, groupLabel}
    let lastCommitted = value;

    // ── Render dropdown, applying filter ──
    function render (filter = "") {
        list.innerHTML = "";
        currentItems = [];
        const f = filter.trim ().toLowerCase ();

        let anyVisible = false;
        for (const group of groups) {
            const matches = f
                            ? group.items.filter ((it) => it.toLowerCase ().includes (f))
                            : group.items;
            if (matches.length === 0) continue;

            anyVisible = true;
            if (group.label) {
                const header = document.createElement ("div");
                header.className = "combobox-group-label";
                header.textContent = group.label;
                list.appendChild (header);
            }

            for (const item of matches) {
                const optionEl = document.createElement ("div");
                optionEl.className = "combobox-option";
                optionEl.setAttribute ("role", "option");
                optionEl.textContent = item;
                const idx = currentItems.length;
                optionEl.dataset.idx = String (idx);
                optionEl.addEventListener ("mousedown", (e) => {
                    e.preventDefault ();     // prevent input blur before click fires
                    commit (item);
                    close ();
                });
                optionEl.addEventListener ("mouseenter", () => setActive (idx));
                list.appendChild (optionEl);
                currentItems.push ({label: item, value: item, groupLabel: group.label});
            }
        }

        if (!anyVisible) {
            const empty = document.createElement ("div");
            empty.className = "combobox-empty";
            empty.textContent = f ? `No match for "${filter}"` : "No options";
            list.appendChild (empty);
        }

        activeIdx = currentItems.length > 0 ? 0 : -1;
        paintActive ();
    }

    function setActive (idx) {
        if (idx < 0 || idx >= currentItems.length) return;
        activeIdx = idx;
        paintActive ();
    }

    function paintActive () {
        for (const el of list.querySelectorAll (".combobox-option")) {
            const i = parseInt (el.dataset.idx, 10);
            el.classList.toggle ("active", i === activeIdx);
        }
        // Scroll active into view
        if (activeIdx >= 0) {
            const active = list.querySelector (`.combobox-option[data-idx="${activeIdx}"]`);
            if (active) active.scrollIntoView ({block: "nearest"});
        }
    }

    function open () {
        list.hidden = false;
        input.setAttribute ("aria-expanded", "true");
        render (input.value);
    }

    function close () {
        list.hidden = true;
        input.setAttribute ("aria-expanded", "false");
        activeIdx = -1;
    }

    function commit (v) {
        const trimmed = (
            v ?? ""
        ).trim ();
        if (trimmed === lastCommitted) return;
        lastCommitted = trimmed;
        input.value = trimmed;
        onCommit (trimmed);
    }

    // ── Events ──
    input.addEventListener ("focus", open);

    input.addEventListener ("input", () => {
        if (list.hidden) open ();
        else render (input.value);
    });

    input.addEventListener ("keydown", (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault ();
            if (list.hidden) open ();
            else setActive (Math.min (activeIdx + 1, currentItems.length - 1));
        }
        else if (e.key === "ArrowUp") {
            e.preventDefault ();
            if (list.hidden) open ();
            else setActive (Math.max (activeIdx - 1, 0));
        }
        else if (e.key === "Enter") {
            e.preventDefault ();
            if (!list.hidden && activeIdx >= 0) {
                commit (currentItems[activeIdx].value);
            }
            else if (allowFreeText) {
                commit (input.value);
            }
            close ();
        }
        else if (e.key === "Escape") {
            e.preventDefault ();
            input.value = lastCommitted;
            close ();
        }
        else if (e.key === "Tab") {
            close ();  // don't preventDefault — allow tab to move focus
        }
    });

    input.addEventListener ("blur", () => {
        // Defer close so mousedown on option can fire first
        setTimeout (() => {
            if (!list.hidden) close ();
            // Commit free text on blur if changed
            if (allowFreeText && input.value.trim () !== lastCommitted) {
                commit (input.value);
            }
        }, 120);
    });

    // Click outside closes
    document.addEventListener ("mousedown", (e) => {
        if (!root.contains (e.target) && !list.hidden) close ();
    });

    return {
        root,
        input,
        setValue (v) {
            input.value = v || "";
            lastCommitted = (
                v || ""
            ).trim ();
        },
    };
}

// ════════════════════════════════════════════════════════════
// Theme handling
// ════════════════════════════════════════════════════════════

/**
 * Supported theme modes.
 * - "dark" / "light": explicit user choice (persisted)
 * - "system": follow prefers-color-scheme (default)
 */
const THEME_MODES = ["system", "dark", "light"];
const THEME_STORAGE_KEY = "ui:theme";

/**
 * Resolve the effective theme (dark | light) from a mode.
 * @param {"system"|"dark"|"light"} mode
 * @returns {"dark"|"light"}
 */
function resolveTheme (mode) {
    if (mode === "dark" || mode === "light") return mode;
    try {
        return window.matchMedia && window.matchMedia ("(prefers-color-scheme: light)").matches
               ? "light"
               : "dark";
    }
    catch {
        return "dark";
    }
}

/**
 * Apply theme to <html> via data-theme attribute.
 * Removes attribute for dark (implicit default) to keep DOM lean.
 * @param {"dark"|"light"} theme
 */
function applyThemeAttribute (theme) {
    if (theme === "light") document.documentElement.setAttribute ("data-theme", "light");
    else document.documentElement.removeAttribute ("data-theme");
}

/**
 * Load stored theme mode and apply it to the page.
 * Also subscribes to storage changes and system preference changes.
 * Call once at page init (popup/queue/settings).
 * @returns {Promise<"system"|"dark"|"light">} The active mode
 */
export async function initTheme () {
    let mode = "system";
    try {
        const stored = await chrome.storage.local.get (THEME_STORAGE_KEY);
        if (stored[THEME_STORAGE_KEY] && THEME_MODES.includes (stored[THEME_STORAGE_KEY])) {
            mode = stored[THEME_STORAGE_KEY];
        }
    }
    catch {
        // ignore — default to system
    }

    applyThemeAttribute (resolveTheme (mode));

    // React to external theme changes (e.g. from the settings page)
    chrome.storage.onChanged.addListener ((changes, area) => {
        if (area !== "local" || !changes[THEME_STORAGE_KEY]) return;
        const newMode = changes[THEME_STORAGE_KEY].newValue || "system";
        applyThemeAttribute (resolveTheme (newMode));
    });

    // React to system preference changes when in "system" mode
    try {
        const mq = window.matchMedia ("(prefers-color-scheme: light)");
        mq.addEventListener ("change", async () => {
            const stored = await chrome.storage.local.get (THEME_STORAGE_KEY);
            const currentMode = stored[THEME_STORAGE_KEY] || "system";
            if (currentMode === "system") applyThemeAttribute (resolveTheme ("system"));
        });
    }
    catch {
        // matchMedia listener unavailable — OK
    }

    return mode;
}

/**
 * Persist a new theme mode. Applied automatically via onChanged listener.
 * @param {"system"|"dark"|"light"} mode
 */
export async function setThemeMode (mode) {
    if (!THEME_MODES.includes (mode)) mode = "system";
    await chrome.storage.local.set ({[THEME_STORAGE_KEY]: mode});
}

/**
 * Read current stored theme mode (for settings UI initial state).
 * @returns {Promise<"system"|"dark"|"light">}
 */
export async function getThemeMode () {
    try {
        const stored = await chrome.storage.local.get (THEME_STORAGE_KEY);
        return stored[THEME_STORAGE_KEY] || "system";
    }
    catch {
        return "system";
    }
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

// ════════════════════════════════════════════════════════════
// Scroll-to-top button
// ════════════════════════════════════════════════════════════

/**
 * Create a floating "scroll to top" button fixed to the bottom-right corner.
 * It fades in once the page is scrolled past `threshold` pixels and scrolls
 * back to the top on click. Respects prefers-reduced-motion. Call once per
 * page, after the DOM is ready (popup is too short to need it).
 *
 * @param {object} [opts]
 * @param {number} [opts.threshold=320] - Scroll offset (px) before the button shows
 */
export function initScrollToTop (opts = {}) {
    const {threshold = 320} = opts;

    const btn = document.createElement ("button");
    btn.type = "button";
    btn.className = "scroll-top-btn";
    btn.title = "Scroll to top";
    btn.setAttribute ("aria-label", "Scroll to top");
    btn.innerHTML = icon ("arrow-up", {size: 20, strokeWidth: 2.5});
    document.body.appendChild (btn);

    btn.addEventListener ("click", () => {
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        window.scrollTo ({top: 0, behavior: reduce ? "auto" : "smooth"});
    });

    // Throttle the scroll handler through requestAnimationFrame.
    let ticking = false;
    const sync = () => {
        btn.classList.toggle ("visible", window.scrollY > threshold);
        ticking = false;
    };
    window.addEventListener ("scroll", () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame (sync);
    }, {passive: true});
    sync ();
}
