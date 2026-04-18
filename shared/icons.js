// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Icon helper — centralized SVG source for dynamically-created UI icons.
 *
 * Purpose: eliminate repeated inline-SVG strings from popup.js / queue.js.
 * Pure paths from the Feather/Lucide aesthetic (stroke-based, 24x24 viewBox).
 *
 * Usage (returns HTML string suitable for .innerHTML):
 *     button.innerHTML = icon("plus") + " Add";
 *
 * Or as an Element (for append):
 *     button.appendChild(iconEl("x"));
 *
 * All icons use currentColor for stroke so they inherit from the parent,
 * work with both light and dark themes, and respond to :hover/:disabled
 * state changes automatically.
 */

/**
 * Icon path definitions (just the inner <path>/<line>/<polyline> markup —
 * the <svg> wrapper is added by the helpers below).
 * Keep these minimal; add new ones as needed.
 */
const ICON_PATHS = {
    plus:
        '<line x1="12" y1="5" x2="12" y2="19"/>' +
        '<line x1="5" y1="12" x2="19" y2="12"/>',

    x:
        '<line x1="18" y1="6" x2="6" y2="18"/>' +
        '<line x1="6" y1="6" x2="18" y2="18"/>',

    upload:
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
        '<polyline points="17 8 12 3 7 8"/>' +
        '<line x1="12" y1="3" x2="12" y2="15"/>',

    "arrow-up":
        '<line x1="12" y1="19" x2="12" y2="5"/>' +
        '<polyline points="5 12 12 5 19 12"/>',

    refresh:
        '<polyline points="23 4 23 10 17 10"/>' +
        '<polyline points="1 20 1 14 7 14"/>' +
        '<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',

    trash:
        '<polyline points="3 6 5 6 21 6"/>' +
        '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',

    sun:
        '<circle cx="12" cy="12" r="5"/>' +
        '<line x1="12" y1="1" x2="12" y2="3"/>' +
        '<line x1="12" y1="21" x2="12" y2="23"/>' +
        '<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>' +
        '<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>' +
        '<line x1="1" y1="12" x2="3" y2="12"/>' +
        '<line x1="21" y1="12" x2="23" y2="12"/>' +
        '<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>' +
        '<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',

    moon:
        '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',

    "grip-vertical":
        '<circle cx="9" cy="5" r="1"/>' +
        '<circle cx="9" cy="12" r="1"/>' +
        '<circle cx="9" cy="19" r="1"/>' +
        '<circle cx="15" cy="5" r="1"/>' +
        '<circle cx="15" cy="12" r="1"/>' +
        '<circle cx="15" cy="19" r="1"/>',

    search:
        '<circle cx="11" cy="11" r="8"/>' +
        '<line x1="21" y1="21" x2="16.65" y2="16.65"/>',

    check:
        '<polyline points="20 6 9 17 4 12"/>',
};

/**
 * Return an icon as an HTML string (for innerHTML insertion).
 *
 * @param {string} name - Icon name from ICON_PATHS
 * @param {object} [opts]
 * @param {number} [opts.size=14] - Width/height in px
 * @param {number} [opts.strokeWidth=2] - Stroke thickness
 * @param {string} [opts.className] - Extra CSS class on the <svg>
 * @returns {string} SVG HTML string
 */
export function icon (name, opts = {}) {
    const {size = 14, strokeWidth = 2, className = ""} = opts;
    const path = ICON_PATHS[name];
    if (!path) {
        console.warn (`[icons] Unknown icon: ${name}`);
        return "";
    }
    const cls = className ? ` class="${className}"` : "";
    return `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" ` +
           `fill="none" stroke="currentColor" stroke-width="${strokeWidth}" ` +
           `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/**
 * Return an icon as an SVG element (for appendChild).
 * @param {string} name
 * @param {object} [opts] - Same options as icon()
 * @returns {SVGElement|null}
 */
export function iconEl (name, opts = {}) {
    const wrapper = document.createElement ("template");
    wrapper.innerHTML = icon (name, opts).trim ();
    return wrapper.content.firstElementChild;
}
