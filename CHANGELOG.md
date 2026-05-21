# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.10.0] - 2026-05-21

### Added

- **Scroll-to-top button** on the Queue and Settings pages — a floating up-arrow button appears in
  the bottom-right corner once the page is scrolled past ~320px and smoothly scrolls back to the top
  on click. Respects `prefers-reduced-motion`, is keyboard-accessible, and follows the active
  light/dark theme.

[1.10.0]: https://github.com/poli0981/itch-f2p-extension/releases/tag/v1.10.0

## [1.9.1] - 2026-05-21

### Changed

- **Internal refactor — no behavior change.** Split the two largest source files into focused
  single-purpose modules:
    - `background/push-handler.js` → `push-handler.js` (public `pushQueue` / `pushQueueUnsigned`),
      `push-strategies.js` (push execution paths + dispatcher), `push-serialize.js` (entry / index
      serialization + JSON merge)
    - `queue/queue.js` → `queue.js` (event-binding bootstrap), `queue-state.js` (shared DOM refs +
      view state), `queue-render.js` (grid / card rendering), `queue-actions.js` (drag-drop, bulk
      selection, push / remove handlers)
- Added [knip](https://knip.dev) for dead-code detection — `knip.json` config plus a `npm run knip`
  script

### Removed

- Unused exports surfaced by knip: `iconEl` (`shared/icons.js`) and `$$` (`shared/ui.js`). Dropped
  the redundant `export` keyword from `log`, `nowISO`, and `THEME_MODES` (still used internally)

[1.9.1]: https://github.com/poli0981/itch-f2p-extension/releases/tag/v1.9.1

## [1.9.0] - 2026-05-16

### Added

- **Auto-collection of free games** (opt-in via Settings → Auto-collection)
    - Visit an itch.io game page and the extension automatically detects, dedups, and adds free games to the queue
      without needing to open the popup
    - In-page toast notifications appear in the bottom-right of the game page using a Shadow-DOM-isolated layer
      (immune to itch.io's stylesheet)
    - Five toast kinds: `Added` (with Undo button), `Removed` (Undo confirmation), `Not free`, `Already in database`,
      `Queue full (150/150) — push first`, and `Could not verify — skipped` (when remote dedup fails)
    - Per-URL session dedup — refreshing the same tab does not re-fire toasts
    - Three independent toggles: master `auto_collect` (default OFF), `auto_collect_show_paid_toast`,
      `auto_collect_show_dup_toast`
    - Strict URL gate via `ITCH_GAME_URL_RE` regex on top of detector's DOM-based `isGamePage()` — non-game pages
      (profiles, jams, search) never trigger auto-add
    - Concurrent auto-adds from multiple tabs are serialized through a promise chain in the service worker to keep
      `loadQueue → push → saveQueue` atomic
    - Auto-add refuses to proceed when the remote dedup verification fails, to avoid creating duplicates in the
      data repo
    - Auto-collected entries logged with `trigger: "auto"` for audit trail

- **Queue-full block in popup**
    - When the queue is at capacity (150/150), the "Add to Queue" button is preemptively disabled with a red
      `Queue full — push first` label instead of failing silently on click
    - The button reactively re-enables when the queue drops below capacity (queue cleared, pushed, or deduped in
      another tab) via the existing storage change listener

### Changed

- `popup.js` now tracks `currentQueueSize` and `_lastDetected` in module scope so the add button can react to
  queue capacity changes while the popup is open
- `manifest.json` content_scripts now declares `content/toast.js` before `content/detector.js` so the toast layer
  is available when the detector calls it

[1.9.0]: https://github.com/poli0981/itch-f2p-extension/releases/tag/v1.9.0

## [1.0.0] - 2026-03-26

### Added

- **Content script detector** for itch.io game pages
    - Auto-detects 17+ metadata fields from DOM (name, developer, genre, tags, platforms, status, release date, made
      with, rating, description, languages, inputs, thumbnail)
    - Free/Paid classification via `buy_row` and `span.dollars[itemprop="price"]` parsing
    - NSFW detection via keyword scanning and content warning div detection
    - Game page validation — skips jams, profiles, devlogs, collections, and browse pages
    - Fallback extraction chains for title, developer, description, and thumbnail

- **Queue management**
    - Add/remove/update games with 150-entry cap
    - Auto-detected fields (read-only) separated from user-editable fields (genre, safe, notes)
    - Genre tag-select dropdown with detected tags prioritized, common presets, and custom input
    - URL-based deduplication (normalized `https://creator.itch.io/slug`)
    - Local duplicate check (instant) + remote duplicate check (cached with configurable TTL)

- **Two push modes** via `push_format` setting
    - `url_only` (default): appends URL strings to `scripts/temp_link.json` — backend `update_info.py` scrapes full
      details
    - `full_object`: appends complete game objects directly to `scripts/game_info.json` — no re-scrape needed
    - Both modes support unsigned (Contents API) and GPG-signed (Git Database API) commits
    - SHA conflict auto-retry (1 retry on HTTP 409)

- **GPG commit signing** (optional)
    - Import armored private keys with passphrase support
    - Key metadata display (fingerprint, algorithm, expiry, UID)
    - Unsigned fallback prompt on signing failure
    - Uses bundled openpgp.js v6 (LGPL-3.0)

- **Popup UI**
    - Detected game card with thumbnail, name, genre, developer, extra info line
    - Badges: Free, Paid, NSFW, rating stars, duplicate warning
    - Queue summary bar with count and push button
    - Quick navigation to Queue and Settings pages
    - Recent activity feed from structured logs

- **Queue page**
    - Responsive card grid with lazy-loaded thumbnails
    - NSFW badge overlay on thumbnails
    - Collapsible auto-detected info panel (description, developer, status, platforms, made with, rating, languages,
      tags)
    - Collapsible edit panel (genre tag-select, safe, notes)
    - Search/filter across name, genre, developer, tags, URL, engine
    - Keyboard shortcuts: Ctrl+F / `/` to focus search, Escape to clear
    - Push All with GPG fallback prompt
    - Clear All with confirmation

- **Settings page**
    - GitHub connection config with Test Connection button
    - Committer identity (name, email)
    - GPG signing toggle with key import/validate/remove
    - Push settings: auto-push threshold, commit prefix, push format selector
    - Cache TTL config with manual refresh
    - Log viewer with level/category filters
    - Log export (JSON) and clear
    - Danger zone: extension reset with 5-second confirmation

- **Shared infrastructure**
    - GitHub REST API client with response caching, error classification, and base64 encoding
    - Structured logger with levels, categories, auto-pruning, and JSON export
    - Chrome storage wrapper with typed get/set and default merging
    - URL normalization (lowercase, strip trailing slash, remove query/hash)
    - Dark theme design system with itch.io red accent palette (`#FA5C5C`)

- **Project documentation**
    - README with architecture diagram, field reference, and sibling project comparison
    - CONTRIBUTING.md with code style guide and itch.io-specific testing checklist
    - SECURITY.md with scope, threat model, and response timeline
    - Privacy Policy, Terms of Use, Disclaimer, Third-Party Notices
    - GitHub issue templates (bug report, feature request) and PR template
    - Architecture document (DOCX) with 14 sections

[1.0.0]: https://github.com/poli0981/itch-f2p-extension/releases/tag/v1.0.0
