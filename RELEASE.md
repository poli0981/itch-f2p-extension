# v1.0.0 — Initial Release

The first public release of the **itch.io F2P Tracker Extension**, a Chrome Manifest V3 extension that detects and
tracks free games on itch.io.

Companion extension for [free-itch-games-list](https://github.com/poli0981/free-itch-games-list). Sibling project
of [steam-f2p-extension](https://github.com/poli0981/steam-f2p-extension).

---

## Highlights

### 🎮 Auto-Detection

Browse any itch.io game page — the extension extracts **17+ metadata fields** automatically: name, developer, genre,
tags, platforms, status, release date, engine, rating, description, languages, inputs, NSFW status, and more.

### 🆓 Free/Paid Classification

Detects whether a game is free or paid by parsing `buy_row` elements and price tags. Paid games are flagged and cannot
be added to the queue.

### 🔄 Two Push Modes

- **URL only** → pushes URLs to `temp_link.json` (backend scrapes later)
- **Full object** → pushes complete data directly to `game_info.json` (no re-scrape)

### 🔐 GPG Signing

Optional GPG commit signing via bundled openpgp.js. Import your private key, and all pushes produce verified commits on
GitHub.

### 🔍 Smart Deduplication

Checks against remote `game_info.json` + `temp_link.json` + local queue before adding. URL-based identity with
normalization (lowercase, strip query/hash).

---

## Installation

1. Download and extract the release zip
2. Open Chrome → `chrome://extensions` → Enable Developer mode
3. Click **Load unpacked** → select the extracted folder
4. Click the extension icon → **Settings** → Configure GitHub connection

## What's Included

```
22 source files (JS/CSS/HTML)    4,700+ lines
4 legal documents                Privacy Policy, Terms, Disclaimer, Third-Party
5 community files                CONTRIBUTING, SECURITY, issue templates, PR template
3 icon sizes                     16px, 48px, 128px
1 architecture document          14-section DOCX
```

## Tech Stack

| Layer    | Technology                                            |
|----------|-------------------------------------------------------|
| Runtime  | Chrome MV3 Service Worker                             |
| Language | JavaScript ES2022+ (zero dependencies, no build step) |
| Styling  | CSS Custom Properties (itch.io dark theme)            |
| Storage  | chrome.storage.local                                  |
| GPG      | openpgp.js v6 (LGPL-3.0)                              |
| License  | GPL-3.0-only                                          |

## Shared with Steam Extension

Core modules reused from [steam-f2p-extension](https://github.com/poli0981/steam-f2p-extension): `github-api.js`,
`gpg-signer.js`, `storage.js`, `logger.js`.

---

**Full changelog:** [CHANGELOG.md](https://github.com/poli0981/itch-f2p-extension/blob/main/CHANGELOG.md)
