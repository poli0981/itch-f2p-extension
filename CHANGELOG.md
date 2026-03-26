# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
