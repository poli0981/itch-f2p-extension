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
 *   7. NSFW             → Keyword scan + content warning div
 *
 * MV3: Plain content script (not a module). IIFE pattern.
 */

(
    function () {
        "use strict";

        const url = window.location.href;

        // ════════════════════════════════════════════════════════════
        // 0. Page validation — is this a game page?
        // ════════════════════════════════════════════════════════════

        /**
         * itch.io game pages have:
         *   - URL: https://{creator}.itch.io/{slug}
         *   - h1.game_title or h1[itemprop="name"]
         *   - div.game_info_panel_widget (the right-side info panel)
         *
         * Skip: jams, profiles, devlogs, browse pages, collections
         */
        function isGamePage () {
            // URL pattern check
            const urlMatch = url.match (
                /^https:\/\/([a-z0-9-]+)\.itch\.io\/([a-z0-9-]+)\/?(\?.*)?$/i
            );
            if (!urlMatch) return false;

            // Skip known non-game subdomains
            const creator = urlMatch[1].toLowerCase ();
            const skipSubdomains = ["itch", "leafo", "static", "img", "hwcdn"];
            if (skipSubdomains.includes (creator)) return false;

            // Skip non-game paths
            const slug = urlMatch[2].toLowerCase ();
            const skipSlugs = [
                "jams", "profile", "my-collections", "dashboard",
                "games", "tools", "game-assets", "comics", "books",
                "physical-games", "soundtracks", "misc"
            ];
            if (skipSlugs.includes (slug)) return false;

            // Positive signals: game page DOM elements
            const hasTitle = !!document.querySelector ("h1.game_title, h1[itemprop='name']");
            const hasInfoPanel = !!document.querySelector (".game_info_panel_widget, .info_panel_wrapper");

            return hasTitle || hasInfoPanel;
        }

        if (!isGamePage ()) return;

        // ════════════════════════════════════════════════════════════
        // DOM helpers
        // ════════════════════════════════════════════════════════════

        function textOf (sel) {
            const el = document.querySelector (sel);
            return el ? el.textContent.trim () : "";
        }

        // ════════════════════════════════════════════════════════════
        // 1. Title extraction
        // ════════════════════════════════════════════════════════════

        function extractTitle () {
            const titleEl =
                document.querySelector ("h1.game_title") ||
                document.querySelector ("h1[itemprop='name']");
            if (titleEl) return titleEl.textContent.trim ();

            // Fallback: og:title
            const og = document.querySelector ("meta[property='og:title']");
            if (og) return og.getAttribute ("content") || "";

            return "";
        }

        // ════════════════════════════════════════════════════════════
        // 2. Free / Paid detection
        // ════════════════════════════════════════════════════════════

        /**
         * Mirrors scraper.py is_free_game() logic:
         *   - No buy_row → free (browser game / direct download)
         *   - span.dollars[itemprop="price"] present → check value
         *   - Button text "Buy" → paid
         *   - "Download Now" + "Name your own price" → free
         */
        function detectFreeStatus () {
            const buyRow = document.querySelector ("div.buy_row");
            if (!buyRow) {
                // No purchase section → free (browser game or direct link)
                return {isFree: true, price: ""};
            }

            // Explicit price tag
            const priceTag = buyRow.querySelector (
                'span.dollars[itemprop="price"], span.dollars'
            );
            if (priceTag) {
                const priceText = priceTag.textContent.trim ();
                if (priceText && priceText !== "$0.00" && priceText !== "$0.00 USD") {
                    return {isFree: false, price: priceText};
                }
            }

            // Button text hint
            const buyBtn = buyRow.querySelector ("a.buy_btn");
            if (buyBtn) {
                const btnText = buyBtn.textContent.trim ()
                                      .toLowerCase ();
                if (btnText.includes ("buy")) {
                    return {isFree: false, price: ""};
                }
            }

            return {isFree: true, price: ""};
        }

        // ════════════════════════════════════════════════════════════
        // 3. Info table parsing
        // ════════════════════════════════════════════════════════════

        /**
         * Parse the right-side info panel into a flat dict.
         * Mirrors scraper.py parse_info_table().
         *
         * HTML structure:
         *   <div class="info_panel_wrapper">
         *     <table>
         *       <tr>
         *         <td>Genre</td>
         *         <td><a>Platformer</a>, <a>Action</a></td>
         *       </tr>
         *       ...
         *     </table>
         *   </div>
         */
        function parseInfoTable () {
            const info = {};
            const wrapper = document.querySelector (".info_panel_wrapper");
            if (!wrapper) return info;

            const table = wrapper.querySelector ("table");
            if (!table) return info;

            const rows = table.querySelectorAll ("tr");
            for (const row of rows) {
                const cells = row.querySelectorAll ("td");
                if (cells.length < 2) continue;

                const key = cells[0].textContent.trim ();
                const valueTd = cells[1];

                // ── Release date: prefer abbr[title] for full datetime ──
                if (key === "Release date") {
                    const abbr = valueTd.querySelector ("abbr");
                    if (abbr && abbr.getAttribute ("title")) {
                        info[key] = abbr.getAttribute ("title");
                    }
                    else {
                        info[key] = valueTd.textContent.trim () || "N/A";
                    }
                    continue;
                }

                // ── Rating: extract from itemprop attributes ──
                if (key === "Rating") {
                    const ratingDiv = valueTd.querySelector (".aggregate_rating");
                    if (ratingDiv) {
                        const rv = ratingDiv.querySelector ("[itemprop='ratingValue']");
                        const rc = ratingDiv.querySelector ("[itemprop='ratingCount']");
                        info["Rating"] = rv
                                         ? rv.getAttribute ("content") || "N/A"
                                         : "N/A";
                        info["RatingCount"] = rc
                                              ? rc.getAttribute ("content") || "N/A"
                                              : "N/A";
                    }
                    else {
                        info["Rating"] = "N/A";
                        info["RatingCount"] = "N/A";
                    }
                    continue;
                }

                // ── Generic: prefer link texts, fallback to plain text ──
                const links = valueTd.querySelectorAll ("a");
                let value;
                if (links.length > 0) {
                    value = [...links].map ((a) => a.textContent.trim ())
                                      .join (", ");
                }
                else {
                    value = valueTd.textContent.trim ();
                }

                info[key] = value || "N/A";
            }

            return info;
        }

        // ════════════════════════════════════════════════════════════
        // 4. Description
        // ════════════════════════════════════════════════════════════

        /**
         * Extract first sentence of game description, max 200 chars.
         * Mirrors scraper.py extract_description().
         */
        function extractDescription () {
            const descEl = document.querySelector (".formatted_description");
            if (!descEl) {
                // Fallback: og:description
                const og = document.querySelector ("meta[property='og:description']");
                return og ? (
                    og.getAttribute ("content") || ""
                ).trim () : "N/A";
            }

            const raw = descEl.textContent.trim ()
                              .replace (/\s+/g, " ");
            if (!raw) return "N/A";

            if (raw.includes (".")) {
                const first = raw.split (".")[0] + ".";
                return first.length <= 200 ? first : first.slice (0, 197) + "...";
            }

            return raw.length > 200 ? raw.slice (0, 197) + "..." : raw;
        }

        // ════════════════════════════════════════════════════════════
        // 5. Thumbnail
        // ════════════════════════════════════════════════════════════

        function extractThumbnail () {
            const og = document.querySelector ("meta[property='og:image']");
            if (og && og.getAttribute ("content")) {
                return og.getAttribute ("content");
            }

            const ss = document.querySelector (".screenshot_list");
            if (ss) {
                const img = ss.querySelector ("img");
                if (img && img.src) return img.src;
            }

            return "";
        }

        // ════════════════════════════════════════════════════════════
        // 6. NSFW detection
        // ════════════════════════════════════════════════════════════

        const NSFW_KEYWORDS = [
            "adult", "nsfw", "erotic", "hentai", "porn", "mature", "sexual",
            "18+", "furry", "s&m", "nudity", "yuri", "yaoi", "lewd",
            "ecchi", "bdsm", "fetish",
        ];

        function detectNSFW (tags, description) {
            const tagsLower = (
                tags || ""
            ).toLowerCase ();
            const descLower = (
                description || ""
            ).toLowerCase ();

            for (const kw of NSFW_KEYWORDS) {
                if (tagsLower.includes (kw) || descLower.includes (kw)) {
                    return "Yes";
                }
            }

            // Content warning div
            if (
                document.querySelector (".view_game_warning") ||
                document.querySelector (".mature_content_notice")
            ) {
                return "Yes";
            }

            return "No";
        }

        // ════════════════════════════════════════════════════════════
        // 7. Developer extraction (fallback for missing info table)
        // ════════════════════════════════════════════════════════════

        function extractDeveloper (infoTable) {
            // Try info table first
            const author = infoTable["Author"] || infoTable["Authors"];
            if (author && author !== "N/A") return author;

            // Fallback: creator link in page header
            const creatorLink = document.querySelector (
                ".game_author a, .user_link a"
            );
            if (creatorLink) return creatorLink.textContent.trim ();

            // Fallback: extract from URL
            const match = url.match (
                /^https:\/\/([a-z0-9-]+)\.itch\.io\//i
            );
            return match ? match[1] : "N/A";
        }

        // ════════════════════════════════════════════════════════════
        // Build and send
        // ════════════════════════════════════════════════════════════

        const freeStatus = detectFreeStatus ();
        const info = parseInfoTable ();
        const description = extractDescription ();
        const tags = info["Tags"] || "N/A";
        const nsfw = detectNSFW (tags, description);

        const gameData = {
            url: url.split ("?")[0].split ("#")[0].replace (/\/+$/, ""),
            name: extractTitle (),
            is_free: freeStatus.isFree,
            price: freeStatus.price,

            // Info table fields
            dev: extractDeveloper (info),
            description,
            genre: info["Genre"] || "N/A",
            tags,
            status: info["Status"] || "N/A",
            platforms: info["Platforms"] || "N/A",
            publisher: info["Publisher"] || "N/A",
            release_date: info["Release date"] || "N/A",
            made_with: info["Made with"] || "N/A",
            rating: info["Rating"] || "N/A",
            rating_count: info["RatingCount"] || "N/A",
            average_session: info["Average session"] || "N/A",
            languages: info["Languages"] || "N/A",
            inputs: info["Inputs"] || "N/A",

            // Derived fields
            thumbnail: extractThumbnail (),
            nsfw,
        };

        chrome.runtime.sendMessage (
            {type: "GAME_DETECTED", data: gameData},
            () => {
                if (chrome.runtime.lastError) return;
            }
        );
    }
) ();
