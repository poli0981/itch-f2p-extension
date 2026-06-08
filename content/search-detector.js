// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Content script – itch.io browse/search page detector.
 * Runs on itch.io browse pages (itch.io/games/...).
 *
 * Unlike content/detector.js (which parses a single game PAGE), this script
 * parses game CELLS in a browse/search grid and lets the user add a free game
 * to the queue by hovering over its cell — no need to open each page.
 *
 * Behavior (v1.11):
 *   1. Page gate     → bare-host itch.io/games/... only (denylist for store /
 *                      on-sale / in-jam / *-dollars-or-less and non-game sections).
 *   2. Per-cell price → no .price_tag = FREE (addable); .price_value $0 = SALE_TEMP
 *                      (-100% sale, temporarily free → NOT added); >$0 = PAID.
 *   3. Dwell ~400ms over a FREE cell → auto-add via REQUEST_SEARCH_COLLECT, with
 *      an Undo toast (reuses the toast layer from content/toast.js).
 *   4. A compact status chip (shared closed Shadow DOM) reflects state on the cell.
 *
 * Opt-in: only active when settings.search_detect_enabled is true (read live from
 * chrome.storage.local; default off).
 *
 * MV3: Plain content script (not a module). IIFE pattern.
 * Cannot import ES modules — NSFW keywords are inlined (build:detector) and the
 * URL normalizer / message-type strings are duplicated from shared/.
 */

(function () {
    "use strict";

    // Injected on every itch.io page alongside detector.js — guard double-init.
    if (window.__itchF2P && window.__itchF2P.searchDetector) return;

    // ════════════════════════════════════════════════════════════
    // 0. Page validation — is this an eligible browse page?
    // ════════════════════════════════════════════════════════════

    /**
     * Eligible: bare host itch.io (or www), first path segment is "games", and no
     * denied segment. Creator subdomains (creator.itch.io) are game pages —
     * handled by detector.js, never here.
     */
    function isBrowsePageEligible() {
        const host = window.location.hostname.toLowerCase();
        if (host !== "itch.io" && host !== "www.itch.io") return false;

        const segments = window.location.pathname.toLowerCase().split("/").filter(Boolean);
        if (segments[0] !== "games") return false;

        // Denied contexts: paid / discount / jam browse where games are not
        // permanently free. Non-game sections (tools, game-assets, soundtracks,
        // comics, devlogs, community) are excluded by the "games" prefix above.
        const DENY = new Set(["store", "on-sale", "in-jam"]);
        for (const seg of segments) {
            if (DENY.has(seg)) return false;
            if (/^\d+-dollars-or-less$/.test(seg)) return false; // any $-or-less filter
        }
        return true;
    }

    if (!isBrowsePageEligible()) return;

    // ════════════════════════════════════════════════════════════
    // 1. URL normalization (duplicated from shared/utils.js)
    // ════════════════════════════════════════════════════════════

    const ITCH_URL_EXTRACT_RE = /https:\/\/([a-z0-9-]+)\.itch\.io\/([a-z0-9-]+)/i;

    function normalizeUrl(rawUrl) {
        if (!rawUrl) return null;
        const match = String(rawUrl).match(ITCH_URL_EXTRACT_RE);
        if (!match) return null;
        return `https://${match[1].toLowerCase()}.itch.io/${match[2].toLowerCase()}`;
    }

    // ════════════════════════════════════════════════════════════
    // 2. NSFW detection — multilingual keywords (inlined at build time)
    // ════════════════════════════════════════════════════════════

    /**
     * NSFW keyword database.
     * Single source of truth: shared/nsfw-keywords.js
     * Injected by scripts/build-detector.js (run: npm run build:detector)
     */
    // NSFW_KEYWORDS_START — auto-generated from shared/nsfw-keywords.js, do not edit manually
    const NSFW_KEYWORDS = [
        "adult",
        "nsfw",
        "erotic",
        "erotica",
        "hentai",
        "porn",
        "pornographic",
        "mature",
        "sexual",
        "sexual content",
        "nudity",
        "nude",
        "naked",
        "lewd",
        "ecchi",
        "bdsm",
        "fetish",
        "bondage",
        "s&m",
        "furry",
        "yuri",
        "yaoi",
        "bara",
        "otome",
        "sex",
        "intercourse",
        "orgasm",
        "masturbation",
        "explicit",
        "xxx",
        "x-rated",
        "stripshow",
        "striptease",
        "strip poker",
        "ahegao",
        "tentacle",
        "tentacles",
        "succubus",
        "incubus",
        "dating sim",
        "dating simulator",
        "エロ",
        "エッチ",
        "ヘンタイ",
        "おっぱい",
        "裸",
        "成人",
        "性的",
        "官能",
        "百合",
        "やおい",
        "r-18",
        "r18",
        "色情",
        "裸体",
        "裸體",
        "情色",
        "性感",
        "变态",
        "變態",
        "美少女",
        "巨乳",
        "福利",
        "禁止未成年",
        "성인",
        "야한",
        "에로",
        "누드",
        "섹시",
        "성적",
        "헨타이",
        "19금",
        "adulto",
        "adulta",
        "erótico",
        "erótica",
        "desnudo",
        "desnuda",
        "desnudez",
        "sexo",
        "pornografía",
        "contenido adulto",
        "solo adultos",
        "nudez",
        "nu",
        "nua",
        "pornografia",
        "conteúdo adulto",
        "adulte",
        "érotique",
        "nue",
        "nudité",
        "sexuel",
        "sexuelle",
        "sexe",
        "pornographie",
        "pornographique",
        "contenu adulte",
        "erwachsene",
        "erotik",
        "erotisch",
        "nackt",
        "nacktheit",
        "sexuell",
        "pornografie",
        "pornographisch",
        "ab 18",
        "взрослый",
        "эротика",
        "порно",
        "обнажённый",
        "секс",
        "хентай",
        "18+",
        "người lớn",
        "khiêu dâm",
        "khỏa thân",
        "gợi cảm",
        "tình dục",
        "18 +",
        "21+",
        "n.s.f.w",
        "x rated",
    ];
    // NSFW_KEYWORDS_END

    function detectNSFW(text) {
        const haystack = (text || "").toLowerCase();
        if (!haystack.trim()) return "No";
        for (const kw of NSFW_KEYWORDS) {
            if (haystack.includes(kw.toLowerCase())) return "Yes";
        }
        return "No";
    }

    // ════════════════════════════════════════════════════════════
    // 3. Cell parsing
    // ════════════════════════════════════════════════════════════

    const PLATFORM_ICONS = [
        ["icon-windows8", "Windows"],
        ["icon-tux", "Linux"],
        ["icon-apple", "macOS"],
        ["icon-android", "Android"],
    ];

    function extractPlatforms(cell) {
        const platforms = [];
        const wrap = cell.querySelector(".game_platform");
        if (!wrap) return platforms;
        if (wrap.querySelector(".web_flag")) platforms.push("HTML5");
        for (const [cls, name] of PLATFORM_ICONS) {
            if (wrap.querySelector(`.${cls}`)) platforms.push(name);
        }
        return platforms;
    }

    function extractThumbnail(cell) {
        const gif = cell.querySelector(".gif_overlay");
        if (gif && gif.getAttribute("data-gif")) return gif.getAttribute("data-gif");
        const img = cell.querySelector(".game_thumb img") || cell.querySelector("img");
        if (img) return img.getAttribute("data-lazy_src") || img.getAttribute("src") || "";
        return "";
    }

    /**
     * Determine price state from a cell.
     *   - No .price_tag at all            → "free"      (really free, addable)
     *   - .price_value parses to 0 / N/A  → "sale_temp" (-100% sale, NOT added)
     *   - .price_value > 0                → "paid"
     *
     * @returns {"free"|"sale_temp"|"paid"}
     */
    function detectCellPrice(cell) {
        const priceTag = cell.querySelector(".price_tag");
        if (!priceTag) return "free";

        const valueEl = priceTag.querySelector(".price_value");
        const raw = valueEl ? valueEl.textContent.trim() : "";
        const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
        // Fail closed: unknown/zero price is treated as a (temporary) sale, never paid-as-free.
        if (!isFinite(num) || num === 0) return "sale_temp";
        return "paid";
    }

    /**
     * Parse a game cell into queue-entry-compatible data.
     * @returns {object|null}
     */
    function parseCell(cell) {
        const link = cell.querySelector("a.title.game_link") || cell.querySelector("a.game_link");
        const url = normalizeUrl(link && link.getAttribute("href"));
        if (!url) return null;

        const titleEl = cell.querySelector("a.title.game_link");
        const name = (titleEl ? titleEl.textContent : "").trim() || "Unknown";

        const authorEl = cell.querySelector(".game_author a");
        const dev = authorEl ? authorEl.textContent.trim() : "N/A";

        const genreEl = cell.querySelector(".game_genre");
        const genre = genreEl ? genreEl.textContent.trim() : "N/A";

        const textEl = cell.querySelector(".game_text");
        let description = textEl
            ? (textEl.getAttribute("title") || textEl.textContent || "").trim().replace(/\s+/g, " ")
            : "";
        if (description.length > 200) description = description.slice(0, 197) + "...";
        if (!description) description = "N/A";

        return {
            url,
            name,
            is_free: true, // only sent for free cells; SW re-checks
            _price: detectCellPrice(cell),

            // Single-value fields (strings) — N/A for those a cell can't provide
            dev,
            description,
            genre,
            status: "N/A",
            publisher: "N/A",
            release_date: "N/A",
            rating: "N/A",
            rating_count: "N/A",
            average_session: "N/A",

            // Multi-value fields (arrays)
            tags: [],
            platforms: extractPlatforms(cell),
            languages: [],
            inputs: [],
            made_with: [],

            // Derived
            thumbnail: extractThumbnail(cell),
            nsfw: detectNSFW(`${name} ${description} ${genre}`),
        };
    }

    // ════════════════════════════════════════════════════════════
    // 4. Status chip — single shared closed Shadow DOM (purely visual)
    // ════════════════════════════════════════════════════════════

    let _chipHost = null;
    let _chipEl = null;

    function ensureChip() {
        if (_chipEl) return;

        _chipHost = document.createElement("div");
        _chipHost.id = "__itch-f2p-search-chip-host";
        // pointer-events:none → never becomes the hover target; cursor passes through.
        _chipHost.style.cssText =
            "all: initial; position: fixed; top: 0; left: 0; z-index: 2147483647; pointer-events: none;";

        const shadow = _chipHost.attachShadow({ mode: "closed" });
        const style = document.createElement("style");
        style.textContent = `
            :host { all: initial; }
            .chip {
                position: fixed;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 4px 9px;
                border-radius: 7px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                font-size: 11px;
                font-weight: 700;
                line-height: 1;
                color: #fff;
                white-space: nowrap;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                pointer-events: none;
            }
            .chip.state-pending { background: #6B7280; }
            .chip.state-added   { background: #4FC978; }
            .chip.state-dup     { background: #FA5C5C; }
            .chip.state-full    { background: #E74C3C; }
            .chip.state-paid    { background: #FFCB4A; color: #1A1A1A; }
            .chip.state-sale    { background: #F0883E; color: #1A1A1A; }
            .chip.state-error   { background: #E74C3C; }
        `;
        _chipEl = document.createElement("div");
        _chipEl.className = "chip";
        shadow.append(style, _chipEl);
        (document.documentElement || document.body).appendChild(_chipHost);
    }

    function showChip(cell, state, text) {
        ensureChip();
        _chipEl.className = `chip state-${state}`;
        _chipEl.textContent = text;
        _chipEl.style.display = "inline-flex";

        // Position at the cell's top-right corner, viewport coordinates (fixed).
        const rect = cell.getBoundingClientRect();
        const chipW = _chipEl.getBoundingClientRect().width; // width is position-independent
        let left = rect.right - chipW - 6;
        let top = rect.top + 6;
        if (left < 4) left = 4;
        if (top < 4) top = 4;
        _chipEl.style.left = `${left}px`;
        _chipEl.style.top = `${top}px`;
    }

    function hideChip() {
        if (_chipEl) _chipEl.style.display = "none";
    }

    function showChipIfActive(cell, state, text) {
        if (activeCell === cell) showChip(cell, state, text);
    }

    // ════════════════════════════════════════════════════════════
    // 5. Hover → dwell → auto-add
    // ════════════════════════════════════════════════════════════

    const DWELL_MS = 400;
    const MSG_SEARCH_COLLECT = "REQUEST_SEARCH_COLLECT";
    const MSG_REMOVE = "REMOVE_FROM_QUEUE";

    let _enabled = false;
    let activeCell = null;
    let dwellTimer = null;
    // url → {state, text} terminal cache (added / dup) to avoid re-adding on re-hover.
    const processed = new Map();

    function clearDwell() {
        if (dwellTimer) {
            clearTimeout(dwellTimer);
            dwellTimer = null;
        }
    }

    function onPointerOver(e) {
        if (!_enabled) return;
        const cell = e.target && e.target.closest ? e.target.closest(".game_cell") : null;
        if (cell === activeCell) return; // still within the same cell (or both null)

        activeCell = cell;
        clearDwell();
        hideChip();
        if (!cell) return;

        dwellTimer = setTimeout(() => {
            dwellTimer = null;
            if (activeCell === cell) processCell(cell);
        }, DWELL_MS);
    }

    function processCell(cell) {
        const data = parseCell(cell);
        if (!data) return;

        const price = data._price;
        delete data._price;

        if (price === "paid") return showChip(cell, "paid", "Paid");
        if (price === "sale_temp") return showChip(cell, "sale", "Sale -100%");

        // FREE
        const cached = processed.get(data.url);
        if (cached) return showChip(cell, cached.state, cached.text);

        showChip(cell, "pending", "Adding…");

        chrome.runtime.sendMessage({ type: MSG_SEARCH_COLLECT, data }, (reply) => {
            if (chrome.runtime.lastError) {
                showChipIfActive(cell, "error", "Error");
                return;
            }
            handleReply(cell, data, reply);
        });
    }

    function handleReply(cell, data, reply) {
        if (!reply || !reply.ok || reply.skip || !reply.kind) {
            if (activeCell === cell) hideChip();
            return;
        }

        const kind = reply.kind;
        let state, text, terminal = false;
        switch (kind) {
            case "added":      state = "added"; text = "✓ Added"; terminal = true; break;
            case "dup":        state = "dup";   text = "In database";  terminal = true; break;
            case "queue_full": state = "full";  text = "Queue full";   break;
            case "paid":       state = "paid";  text = "Paid";         break;
            default:           state = "error"; text = "Error";        break;
        }
        if (terminal) processed.set(data.url, { state, text });
        showChipIfActive(cell, state, text);

        // Toast (Undo for "added"). location.href is the same browse URL for every
        // cell, so dedup must be keyed on the GAME url, not the page url.
        const toast = window.__itchF2P && window.__itchF2P.toast;
        if (!toast) return;
        const name = reply.name || data.name;
        const addedUrl = reply.url || data.url;

        if (kind === "added") {
            toast.show({
                kind,
                name,
                dedupKey: `${addedUrl}::added`,
                action: {
                    label: "Undo",
                    onClick: () => {
                        chrome.runtime.sendMessage({ type: MSG_REMOVE, data: { url: addedUrl } }, () => {
                            if (chrome.runtime.lastError) return;
                            processed.delete(addedUrl);
                            toast.show({ kind: "removed", name, dedupKey: `${addedUrl}::undo` });
                        });
                    },
                },
            });
        } else {
            toast.show({ kind, name, dedupKey: `${addedUrl}::${kind}` });
        }
    }

    // ════════════════════════════════════════════════════════════
    // 6. Enable gate (live) + listeners
    // ════════════════════════════════════════════════════════════

    function setEnabled(on) {
        _enabled = !!on;
        if (!_enabled) {
            clearDwell();
            activeCell = null;
            hideChip();
        }
    }

    try {
        chrome.storage.local.get("settings", (res) => {
            if (chrome.runtime.lastError) return;
            setEnabled(res && res.settings && res.settings.search_detect_enabled);
        });
    } catch {
        // storage unavailable — stay disabled
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes.settings) return;
        const s = changes.settings.newValue;
        setEnabled(s && s.search_detect_enabled);
    });

    function onScrollOrResize() {
        // A fixed chip would otherwise hover over the wrong cell after scrolling.
        clearDwell();
        activeCell = null;
        hideChip();
    }

    document.addEventListener("pointerover", onPointerOver, true);
    window.addEventListener("scroll", onScrollOrResize, { capture: true, passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });

    window.__itchF2P = window.__itchF2P || {};
    window.__itchF2P.searchDetector = true;
})();
