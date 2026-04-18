// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Content script – itch.io game page detector.
 * Runs on *.itch.io/* pages.
 *
 * Detection strategy (mirrors scraper.py logic):
 *   1. Page validation  → Is this a game page? (not jam/profile/devlog)
 *   2. Free/Paid        → buy_row + span.dollars[itemprop="price"]
 *   3. Title            → h1.game_title / h1[itemprop="name"]
 *   4. Info table parse  → div.info_panel_wrapper > table (all fields)
 *   5. Description      → div.formatted_description (first sentence)
 *   6. Thumbnail        → meta[og:image] / screenshot_list img
 *   7. NSFW             → Multilingual keyword scan + content warning div
 *
 * Multi-value fields (tags, platforms, languages, inputs, made_with)
 * are returned as arrays. Single-value fields remain strings.
 *
 * MV3: Plain content script (not a module). IIFE pattern.
 * Cannot import ES modules — NSFW keywords are inlined.
 */

(function () {
    "use strict";

    const url = window.location.href;

    // ════════════════════════════════════════════════════════════
    // 0. Page validation — is this a game page?
    // ════════════════════════════════════════════════════════════

    function isGamePage() {
        const urlMatch = url.match(
            /^https:\/\/([a-z0-9-]+)\.itch\.io\/([a-z0-9-]+)\/?(\?.*)?$/i
        );
        if (!urlMatch) return false;

        const creator = urlMatch[1].toLowerCase();
        const skipSubdomains = ["itch", "leafo", "static", "img", "hwcdn"];
        if (skipSubdomains.includes(creator)) return false;

        const slug = urlMatch[2].toLowerCase();
        const skipSlugs = ["jams", "profile", "my-collections", "dashboard",
                           "games", "tools", "game-assets", "comics", "books",
                           "physical-games", "soundtracks", "misc"];
        if (skipSlugs.includes(slug)) return false;

        const hasTitle = !!document.querySelector("h1.game_title, h1[itemprop='name']");
        const hasInfoPanel = !!document.querySelector(".game_info_panel_widget, .info_panel_wrapper");

        return hasTitle || hasInfoPanel;
    }

    if (!isGamePage()) return;

    // ════════════════════════════════════════════════════════════
    // 1. Title extraction
    // ════════════════════════════════════════════════════════════

    function extractTitle() {
        const titleEl =
            document.querySelector("h1.game_title") ||
            document.querySelector("h1[itemprop='name']");
        if (titleEl) return titleEl.textContent.trim();

        const og = document.querySelector("meta[property='og:title']");
        if (og) return og.getAttribute("content") || "";

        return "";
    }

    // ════════════════════════════════════════════════════════════
    // 2. Free / Paid detection
    // ════════════════════════════════════════════════════════════

    function detectFreeStatus() {
        const buyRow = document.querySelector("div.buy_row");
        if (!buyRow) {
            return { isFree: true, price: "" };
        }

        const priceTag = buyRow.querySelector(
            'span.dollars[itemprop="price"], span.dollars'
        );
        if (priceTag) {
            const priceText = priceTag.textContent.trim();
            if (priceText && priceText !== "$0.00" && priceText !== "$0.00 USD") {
                return { isFree: false, price: priceText };
            }
        }

        const buyBtn = buyRow.querySelector("a.buy_btn");
        if (buyBtn) {
            const btnText = buyBtn.textContent.trim().toLowerCase();
            if (btnText.includes("buy")) {
                return { isFree: false, price: "" };
            }
        }

        return { isFree: true, price: "" };
    }

    // ════════════════════════════════════════════════════════════
    // 3. Info table parsing
    // ════════════════════════════════════════════════════════════

    /**
     * Fields that contain multiple values (links or comma-separated).
     * These will be returned as arrays instead of joined strings.
     */
    const MULTI_VALUE_FIELDS = new Set([
        "Genre", "Tags", "Platforms", "Languages", "Inputs", "Made with",
    ]);

    /**
     * Parse the right-side info panel.
     *
     * Multi-value fields → array of strings
     * Single-value fields → string
     *
     * @returns {Object<string, string|string[]>}
     */
    function parseInfoTable() {
        const info = {};
        const wrapper = document.querySelector(".info_panel_wrapper");
        if (!wrapper) return info;

        const table = wrapper.querySelector("table");
        if (!table) return info;

        const rows = table.querySelectorAll("tr");
        for (const row of rows) {
            const cells = row.querySelectorAll("td");
            if (cells.length < 2) continue;

            const key = cells[0].textContent.trim();
            const valueTd = cells[1];

            // ── Release date: prefer abbr[title] ──
            if (key === "Release date") {
                const abbr = valueTd.querySelector("abbr");
                info[key] = (abbr && abbr.getAttribute("title"))
                    ? abbr.getAttribute("title")
                    : (valueTd.textContent.trim() || "N/A");
                continue;
            }

            // ── Rating: itemprop attributes ──
            if (key === "Rating") {
                const ratingDiv = valueTd.querySelector(".aggregate_rating");
                if (ratingDiv) {
                    const rv = ratingDiv.querySelector("[itemprop='ratingValue']");
                    const rc = ratingDiv.querySelector("[itemprop='ratingCount']");
                    info["Rating"] = rv ? (rv.getAttribute("content") || "N/A") : "N/A";
                    info["RatingCount"] = rc ? (rc.getAttribute("content") || "N/A") : "N/A";
                } else {
                    info["Rating"] = "N/A";
                    info["RatingCount"] = "N/A";
                }
                continue;
            }

            // ── Multi-value fields → arrays ──
            if (MULTI_VALUE_FIELDS.has(key)) {
                const links = valueTd.querySelectorAll("a");
                if (links.length > 0) {
                    info[key] = [...links]
                        .map((a) => a.textContent.trim())
                        .filter(Boolean);
                } else {
                    // Comma-separated plain text fallback
                    const raw = valueTd.textContent.trim();
                    if (raw && raw !== "N/A") {
                        info[key] = raw.split(",").map((s) => s.trim()).filter(Boolean);
                    } else {
                        info[key] = [];
                    }
                }
                continue;
            }

            // ── Single-value fields → string ──
            const links = valueTd.querySelectorAll("a");
            let value;
            if (links.length > 0) {
                value = [...links].map((a) => a.textContent.trim()).join(", ");
            } else {
                value = valueTd.textContent.trim();
            }

            info[key] = value || "N/A";
        }

        return info;
    }

    // ════════════════════════════════════════════════════════════
    // 4. Description
    // ════════════════════════════════════════════════════════════

    function extractDescription() {
        const descEl = document.querySelector(".formatted_description");
        if (!descEl) {
            const og = document.querySelector("meta[property='og:description']");
            return og ? (og.getAttribute("content") || "").trim() : "N/A";
        }

        const raw = descEl.textContent.trim().replace(/\s+/g, " ");
        if (!raw) return "N/A";

        if (raw.includes(".")) {
            const first = raw.split(".")[0] + ".";
            return first.length <= 200 ? first : first.slice(0, 197) + "...";
        }

        return raw.length > 200 ? raw.slice(0, 197) + "..." : raw;
    }

    // ════════════════════════════════════════════════════════════
    // 5. Thumbnail
    // ════════════════════════════════════════════════════════════

    function extractThumbnail() {
        const og = document.querySelector("meta[property='og:image']");
        if (og && og.getAttribute("content")) {
            return og.getAttribute("content");
        }

        const ss = document.querySelector(".screenshot_list");
        if (ss) {
            const img = ss.querySelector("img");
            if (img && img.src) return img.src;
        }

        return "";
    }

    // ════════════════════════════════════════════════════════════
    // 6. NSFW detection — multilingual keywords
    // ════════════════════════════════════════════════════════════

    /**
     * NSFW keyword database.
     * Single source of truth: shared/nsfw-keywords.js
     * Injected by scripts/build-detector.js (run: npm run build:detector)
     *
     * MV3 content scripts cannot use ES module imports, so the array
     * is inlined by the build step between the markers below.
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

    /**
     * Detect NSFW status from tags, description, and page elements.
     *
     * @param {string[]} tags - Array of tag strings
     * @param {string} description - Game description text
     * @returns {string} "Yes" or "No"
     */
    function detectNSFW(tags, description) {
        // Build searchable text from tags (array) + description
        const tagsText = Array.isArray(tags) ? tags.join(" ").toLowerCase() : (tags || "").toLowerCase();
        const descText = (description || "").toLowerCase();
        const combined = tagsText + " " + descText;

        for (const kw of NSFW_KEYWORDS) {
            if (combined.includes(kw.toLowerCase())) {
                return "Yes";
            }
        }

        // Content warning div
        if (
            document.querySelector(".view_game_warning") ||
            document.querySelector(".mature_content_notice")
        ) {
            return "Yes";
        }

        return "No";
    }

    // ════════════════════════════════════════════════════════════
    // 7. Developer extraction (fallback for missing info table)
    // ════════════════════════════════════════════════════════════

    function extractDeveloper(infoTable) {
        const author = infoTable["Author"] || infoTable["Authors"];
        if (author && author !== "N/A") return author;

        const creatorLink = document.querySelector(".game_author a, .user_link a");
        if (creatorLink) return creatorLink.textContent.trim();

        const match = url.match(/^https:\/\/([a-z0-9-]+)\.itch\.io\//i);
        return match ? match[1] : "N/A";
    }

    // ════════════════════════════════════════════════════════════
    // Build and send
    // ════════════════════════════════════════════════════════════

    const freeStatus = detectFreeStatus();
    const info = parseInfoTable();
    const description = extractDescription();

    // Multi-value fields: arrays (empty array if N/A)
    const tags      = info["Tags"]      || [];
    const platforms  = info["Platforms"]  || [];
    const languages  = info["Languages"]  || [];
    const inputs     = info["Inputs"]     || [];
    const madeWith   = info["Made with"]  || [];
    const genres     = info["Genre"]      || [];

    const nsfw = detectNSFW(tags, description);

    const gameData = {
        url: url.split("?")[0].split("#")[0].replace(/\/+$/, ""),
        name: extractTitle(),
        is_free: freeStatus.isFree,
        price: freeStatus.price,

        // Single-value fields (strings)
        dev: extractDeveloper(info),
        description,
        status: info["Status"] || "N/A",
        publisher: info["Publisher"] || "N/A",
        release_date: info["Release date"] || "N/A",
        rating: info["Rating"] || "N/A",
        rating_count: info["RatingCount"] || "N/A",
        average_session: info["Average session"] || "N/A",

        // Multi-value fields (arrays)
        genre: genres.length > 0 ? genres[0] : "N/A",  // primary genre (string for editable field)
        tags,             // ["Action", "Puzzle", "2D"]
        platforms,        // ["Windows", "Linux", "HTML5"]
        languages,        // ["English", "Japanese"]
        inputs,           // ["Keyboard", "Mouse", "Gamepad"]
        made_with: madeWith,  // ["Unity", "Godot"]

        // Derived fields
        thumbnail: extractThumbnail(),
        nsfw,
    };

    chrome.runtime.sendMessage(
        { type: "GAME_DETECTED", data: gameData },
        () => {
            if (chrome.runtime.lastError) return;
        }
    );
})();
