# How Detection Works

A technical reference for **how the extension recognises itch.io games, classifies free vs. paid, and
extracts metadata** — written for contributors and curious users who want to know exactly which DOM
elements drive each decision.

> All selectors below reflect itch.io's markup at the time of writing. itch.io ships no public API for
> this, so detection is DOM-based and may need updating if their markup changes — see
> [Maintenance](#5-maintenance).

Detection runs in **two places**:

| Surface | Script | Trigger | Output |
|---------|--------|---------|--------|
| Game page — `creator.itch.io/slug` | [`content/detector.js`](../content/detector.js) | page load (`document_idle`) | full metadata; auto-collect if enabled |
| Browse / search — `itch.io/games/…` | [`content/search-detector.js`](../content/search-detector.js) | hover a game cell | lightweight metadata; hover-to-add |

Both scripts are injected on every `*.itch.io` page but **early-exit when the page is not theirs**, so they
never run at the same time (a game lives on a `creator.itch.io` subdomain; a browse grid lives on the bare
`itch.io` host).

Both identify a game by its **normalized URL** — `https://{creator}.itch.io/{slug}`, lowercased, with
query string, hash, and trailing slash stripped ([`shared/utils.js`](../shared/utils.js) → `normalizeUrl`).
That URL is the identity/dedup key against both the local queue and the remote database.

---

## 1. Game-page detection (`content/detector.js`)

### 1.1 Is this a game page?

`isGamePage()` accepts only `https://{creator}.itch.io/{slug}` URLs, rejects reserved subdomains
(`itch`, `leafo`, `static`, `img`, `hwcdn`) and reserved slugs (`jams`, `profile`, `dashboard`, `games`,
`tools`, …), then confirms a game-page DOM exists:

```js
const hasTitle     = !!document.querySelector("h1.game_title, h1[itemprop='name']");
const hasInfoPanel = !!document.querySelector(".game_info_panel_widget, .info_panel_wrapper");
```

### 1.2 Free vs. paid — `detectFreeStatus()`

Reads the purchase widget `div.buy_row`:

| Condition | Result |
|-----------|--------|
| No `div.buy_row` at all | **Free** |
| `span.dollars[itemprop="price"]` text is not `$0.00` | **Paid** (keeps the price string) |
| `a.buy_btn` text contains `buy` | **Paid** |
| otherwise | **Free** |

```html
<div class="buy_row">
  <a class="buy_btn"><span class="dollars" itemprop="price">$4.99</span></a>
</div>
```

### 1.3 Metadata — the info panel

`parseInfoTable()` walks `div.info_panel_wrapper > table > tr`, reading each row as a `key → value` pair.
Special handling:

- **Multi-value** fields (`Genre`, `Tags`, `Platforms`, `Languages`, `Inputs`, `Made with`) → arrays of the
  `<a>` link texts (or comma-split plain text).
- **Release date** → `abbr[title]` (full ISO datetime) when present.
- **Rating** → `[itemprop="ratingValue"]` / `[itemprop="ratingCount"]` content attributes.

### 1.4 Description, thumbnail, developer, NSFW

| Field | Source | Fallback |
|-------|--------|----------|
| Description | `.formatted_description` (first sentence, ≤200 chars) | `meta[property="og:description"]` |
| Thumbnail | `meta[property="og:image"]` | `.screenshot_list img` |
| Developer | info table `Author` | `.game_author a` / `.user_link a` / URL creator |
| NSFW | multilingual keyword scan over tags + description | `.view_game_warning` / `.mature_content_notice` div |

### 1.5 Field → source quick reference

| Field | Source |
|-------|--------|
| Name | `h1.game_title` / `h1[itemprop="name"]` |
| Free/Paid | `div.buy_row` + `span.dollars[itemprop="price"]` |
| Developer | info table / `.game_author a` |
| Genre, Tags, Platforms, Languages, Inputs, Made with | info table |
| Status, Publisher, Release date, Rating, Average session | info table |
| Description | `.formatted_description` |
| Thumbnail | `meta[og:image]` |
| NSFW | keyword scan + content-warning div |

---

## 2. Browse / search-page detection (`content/search-detector.js`) — new in v1.11

On a browse grid, each game is a **cell** with far less markup than a full game page. The extension parses
those cells so you can add a free game by **hovering** over it — no need to open each page.

### 2.1 Which pages are eligible?

`isBrowsePageEligible()` requires the **bare host** (`itch.io` or `www.itch.io`, never a creator
subdomain) and a first path segment of `games`, then applies a denylist:

| | Pattern | Why |
|---|---------|-----|
| ✅ Accept | `itch.io/games` | default browse grid |
| ✅ Accept | `itch.io/games/free/…` | free filter |
| ✅ Accept | `itch.io/games/exclude-jam/free/…` | free, jam entries excluded |
| ✅ Accept | `itch.io/games/<tag>/…` (e.g. `tag-horror`) | any other `/games` filter |
| 🚫 Reject | `itch.io/games/store` | paid storefront |
| 🚫 Reject | `itch.io/games/on-sale` | discounts, not permanently free |
| 🚫 Reject | `itch.io/games/in-jam` | active jam entries |
| 🚫 Reject | `itch.io/games/5-dollars-or-less` (any `N-dollars-or-less`) | priced filters |
| 🚫 Reject | `itch.io/tools`, `/game-assets`, `/soundtracks`, `/comics`, `/devlogs`, `/community` | not games (excluded by the `games` prefix) |

### 2.2 Anatomy of a game cell

```html
<div class="game_cell" data-game_id="4493268">
  <div class="game_thumb">
    <a class="thumb_link game_link" href="https://bodinhe.itch.io/takecareofthedog">
      <img class="lazy_loaded" data-lazy_src="https://img.itch.zone/…/315x250%23c/ofBc9.png">
    </a>
  </div>
  <div class="game_cell_data">
    <div class="game_title">
      <a class="title game_link" href="https://bodinhe.itch.io/takecareofthedog">TAKE CARE OF THE DOG</a>
    </div>
    <div class="game_text" title="a very short story about DOG.">a very short story about DOG.</div>
    <div class="game_author"><a href="https://bodinhe.itch.io">bodinhe</a></div>
    <div class="game_genre">Adventure</div>
    <div class="game_platform"><span class="icon icon-windows8" title="Download for Windows"></span></div>
  </div>
</div>
```

`parseCell()` reads, within each `.game_cell`:

| Field | Selector (within the cell) | Notes |
|-------|----------------------------|-------|
| URL / identity | `a.title.game_link[href]` → `normalizeUrl` (fallback `a.game_link`) | identity & dedup key |
| Name | `a.title.game_link` text | |
| Developer | `.game_author a` text | |
| Genre | `.game_genre` text | single value |
| Description | `.game_text[title]` (or its text) | tagline; truncated to 200 chars |
| Platforms | `.game_platform` icons → mapping below | array |
| Thumbnail | `.game_thumb img[data-lazy_src]` ‖ `img[src]`; GIFs: `.gif_overlay[data-gif]` | |
| Price state | `.price_tag` / `.price_value` / `.sale_tag` | see §2.3 |

**Platform icon → name mapping:**

| Icon class | Platform |
|------------|----------|
| `.icon-windows8` | Windows |
| `.icon-tux` | Linux |
| `.icon-apple` | macOS |
| `.icon-android` | Android |
| `.web_flag` (“Play in browser”) | HTML5 |

### 2.3 Free vs. temporary-sale vs. paid — the key distinction

The price tag inside `.game_title` decides everything. There are **three** cases:

**(a) Really free** — there is **no `.price_tag` element at all**. → **addable**.

```html
<div class="game_title">
  <a class="title game_link" href="https://bodinhe.itch.io/takecareofthedog">TAKE CARE OF THE DOG</a>
  <!-- no .price_tag → FREE -->
</div>
```

**(b) Temporary “-100% sale”** — a `.price_tag` exists and `.price_value` is `$0` (with a `-100%`
`.sale_tag`). The game is **free right now but reverts to paid**, so it is **flagged but NOT added** (the
companion repo lists *permanently* free games).

```html
<div class="game_title">
  <a class="title game_link" href="https://redcap-games.itch.io/matilda">MATILDA</a>
  <a class="price_tag meta_tag sale" title="Pay $0 or more for this game">
    <div class="price_value">$0</div>
    <div class="sale_tag">-100%</div>
  </a>
</div>
```

**(c) Paid** — a `.price_tag` exists and `.price_value` is greater than `$0`. → **not added**.

```html
<div class="game_title">
  <a class="title game_link" href="https://rosesrot.itch.io/killer-chat-overkill-dlc">Killer Chat! Overkill DLC</a>
  <a class="price_tag meta_tag sale" title="Pay $8.99 or more for this game DLC">
    <div class="price_value">$8.99</div>
    <div class="sale_tag">-10%</div>
  </a>
</div>
```

`detectCellPrice()` in code:

```js
const priceTag = cell.querySelector(".price_tag");
if (!priceTag) return "free";                       // (a)
const raw = cell.querySelector(".price_value")?.textContent.trim() ?? "";
const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
if (!isFinite(num) || num === 0) return "sale_temp"; // (b) — fail closed
return "paid";                                       // (c)
```

> **Fail-closed:** if a price can't be parsed, the cell is treated as `sale_temp` (not added), never as a
> free game. Better to skip a real freebie than to add a paid game.

### 2.4 Hover → add flow

1. The cursor enters a `.game_cell` and **pauses ~400 ms** (a dwell debounce — sweeping past cells does not
   trigger anything).
2. `parseCell()` runs. Non-free cells just show a status chip (`Paid`, `Sale -100%`) and stop.
3. A free cell sends `REQUEST_SEARCH_COLLECT` to the service worker, which **dedups → checks the 150 cap →
   adds**, then replies with an outcome.
4. The outcome appears as a corner chip (`✓ Added`, `In database`, `Queue full`) **and** a bottom-right
   toast. The `Added` toast carries an **Undo** button.

NSFW on browse cells is **best-effort**: a keyword scan over name + tagline + genre only (no info-table tags
available). For example a cell whose tagline is `18+ Yandere` matches the `18+` keyword. Full NSFW
classification happens when the backend re-scrapes the page.

Only active when **Settings → Search-page detection** is enabled (opt-in, default off).

---

## 3. Deduplication

A game is a duplicate if its normalized URL is already in:

1. the **local queue** (`chrome.storage.local` → `queue`), or
2. the **remote database** — the set of URLs read from `data_game/*.json` (via `data_game/index.json`) and
   `scripts/temp_link.json`, cached for `cache_ttl_minutes`.

See [`background/dedup-checker.js`](../background/dedup-checker.js) → `checkDuplicate`.

---

## 4. Limitations

- **Partial metadata from browse cells.** A cell exposes only name, developer, genre, tagline, platforms,
  and thumbnail. Tags, rating, status, languages, release date, etc. are `N/A` until the backend scrapes the
  page. The `url_only` push format (default) is the natural fit for search-added games — the backend fills
  in full details from the URL.
- **NSFW is best-effort on browse cells** (limited text to scan).
- **Temporary -100% sales are intentionally skipped** to keep the list permanently free.

---

## 5. Maintenance

Detection is DOM-based, so itch.io markup changes are the main failure mode. If detection breaks:

- **Game pages** → fix selectors in [`content/detector.js`](../content/detector.js).
- **Browse pages** → fix selectors in [`content/search-detector.js`](../content/search-detector.js)
  (`parseCell`, `detectCellPrice`, `PLATFORM_ICONS`, `isBrowsePageEligible`).
- The NSFW keyword list lives in [`shared/nsfw-keywords.js`](../shared/nsfw-keywords.js) and is injected into
  both content scripts by `npm run build:detector` — never edit the inlined arrays by hand.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the testing checklist and the list of itch.io pages to verify
against.
