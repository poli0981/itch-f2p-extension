# itch.io F2P Tracker Extension

<p align="center">
  <img src="icons/icon-128.png" alt="itch.io F2P Tracker" width="96">
</p>

<p align="center">
  <strong>Chrome extension that detects and tracks free games on itch.io.</strong><br>
  Companion tool for <a href="https://github.com/poli0981/free-itch-games-list">free-itch-games-list</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg" alt="License"></a>
  <a href="https://github.com/poli0981/itch-f2p-extension/releases"><img src="https://img.shields.io/github/v/release/poli0981/itch-f2p-extension" alt="Release"></a>
  <img src="https://img.shields.io/badge/manifest-v3-green.svg" alt="Manifest V3">
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen.svg" alt="Zero Dependencies">
</p>

---

## What It Does

Browse any game page on itch.io — the extension automatically detects whether the game is free, extracts metadata
(genre, developer, platforms, tags, rating, NSFW status, and more), and lets you queue games for submission to a GitHub
repository.

On itch.io **browse/search grids** (`itch.io/games/…`) you can also hover over a game to detect and queue it without
opening its page. See **[How Detection Works](docs/DETECTION.md)** for the full technical breakdown.

**Two push modes:**

- **URL only** → pushes game URLs to `scripts/temp_link.json` (backend scrapes full details later)
- **Full object** → pushes complete game data directly to `scripts/game_info.json` (no re-scrape needed)

## Features

- **Auto-detection** of 17+ metadata fields from itch.io game pages
- **Search-page hover detection** — add free games straight from `itch.io/games/…` browse grids by hovering, no need to open each page
- **Free/Paid classification** via `buy_row` and price tag parsing
- **NSFW detection** via keyword scanning and content warning detection
- **Deduplication** against remote `game_info.json` + `temp_link.json` + local queue
- **GPG commit signing** (optional) via bundled openpgp.js
- **Auto-push** when queue reaches a configurable threshold
- **Structured logging** with level/category filtering and JSON export
- **Dark theme UI** inspired by itch.io's design language
- **Scroll-to-top button** on long Queue and Settings pages

## Screenshots

| Popup                          | Queue                           | Settings                        |
|--------------------------------|---------------------------------|---------------------------------|
| Detected game card with badges | Grid view with auto/edit panels | GitHub, GPG, push format config |

## Installation

### From Source (Developer)

1. Clone this repository:
   ```bash
   git clone https://github.com/poli0981/itch-f2p-extension.git
   ```

2. Open Chrome → `chrome://extensions`

3. Enable **Developer mode** (top right)

4. Click **Load unpacked** → select the cloned folder

5. Navigate to an itch.io game page — the extension icon activates

### Setup

1. Click the extension icon → **Settings**
2. Enter your GitHub **owner**, **repo**, and **Personal Access Token** (needs `repo` scope)
3. (Optional) Import a GPG key for signed commits
4. Choose your **Push Format**: `url_only` or `full_object`

## How It Works

```
  itch.io Game Page
       │
       ▼
  [Content Script: detector.js]
       │ Extracts 17+ fields from DOM
       ▼
  [Service Worker: sw.js]
       │ Routes message to queue manager
       ▼
  [Queue Manager] ──→ chrome.storage.local
       │
       ▼   (on push)
  [Push Handler]
       │
       ├── url_only ──→ scripts/temp_link.json
       │                     ▼
       │               update_info.py (scrapes)
       │                     ▼
       │               scripts/game_info.json
       │
       └── full_object ──→ scripts/game_info.json (direct)
```

## Detected Fields

> For the exact selectors, the browse-page cell structure, and the free/sale/paid logic, see
> **[How Detection Works](docs/DETECTION.md)** ([Tiếng Việt](docs/i18n/vi/DETECTION.md)).

| Field        | Source                     | Notes                          |
|--------------|----------------------------|--------------------------------|
| Name         | `h1.game_title`            | Game display name              |
| Developer    | Info table / URL           | Author or creator              |
| Genre        | Info table                 | Primary genre                  |
| Tags         | Info table                 | Comma-separated                |
| Status       | Info table                 | Released, In development, etc. |
| Platforms    | Info table                 | Windows, macOS, Linux, HTML5   |
| Release Date | Info table `abbr[title]`   | ISO datetime preferred         |
| Made With    | Info table                 | Engine/tools (Unity, Godot...) |
| Rating       | `itemprop`                 | Numeric value + count          |
| Description  | `formatted_description`    | First sentence, max 200 chars  |
| Languages    | Info table                 | Supported languages            |
| Inputs       | Info table                 | Keyboard, mouse, gamepad       |
| NSFW         | Keywords + content warning | "Yes" / "No"                   |
| Thumbnail    | `og:image`                 | Cover image URL                |
| Free/Paid    | `buy_row` + price span     | Price tag parsing              |

## Project Structure

```
itch-f2p-extension/
├── manifest.json              # MV3 manifest
├── knip.json                  # Dead-code detection config
├── LICENSE                    # GPL-3.0-only
├── background/
│   ├── sw.js                  # Service worker entry
│   ├── github-api.js          # GitHub REST client
│   ├── gpg-signer.js          # GPG key management + signing
│   ├── push-handler.js        # Push entry (pushQueue / pushQueueUnsigned)
│   ├── push-strategies.js     # Push execution paths + dispatcher
│   ├── push-serialize.js      # Entry / index serialization + merge
│   ├── queue-manager.js       # CRUD, validation, cap
│   └── dedup-checker.js       # URL-based deduplication
├── content/
│   ├── toast.js               # in-page toast layer (Shadow DOM, IIFE)
│   ├── detector.js            # game-page parser (IIFE)
│   └── search-detector.js     # browse/search-page parser + hover-to-add (IIFE)
├── shared/
│   ├── constants.js           # URLs, limits, field definitions
│   ├── storage.js             # chrome.storage wrapper
│   ├── logger.js              # Structured logger
│   ├── utils.js               # URL normalization, helpers
│   └── theme.css              # Design system (itch.io palette)
├── popup/                     # Popup UI
├── queue/                     # Queue page UI (bootstrap + state/render/actions)
├── settings/                  # Settings page UI
├── lib/
│   └── openpgp.min.mjs        # OpenPGP.js v6 (LGPL-3.0)
└── docs/                      # Legal documents
```

## Sibling Project

This extension shares core architecture with the
[Steam F2P Tracker Extension](https://github.com/poli0981/steam-f2p-extension).
Shared modules include `github-api.js`, `gpg-signer.js`, `storage.js`, and `logger.js`.

| Aspect         | Steam Extension        | itch.io Extension                |
|----------------|------------------------|----------------------------------|
| Target         | store.steampowered.com | *.itch.io                        |
| Identity key   | Numeric appid          | Normalized URL                   |
| Data format    | JSONL                  | JSON array                       |
| Push target    | temp_info.jsonl        | temp_link.json or game_info.json |
| Anti-cheat     | 20+ systems            | Not applicable                   |
| NSFW detection | Not needed             | Keyword + content warning        |
| Unique fields  | —                      | made_with, rating, inputs, nsfw  |

## Tech Stack

- **JavaScript ES2022+** — no build step, no transpiler, no npm dependencies
- **Chrome Manifest V3** — service worker, static imports only
- **CSS Custom Properties** — dark theme, itch.io red accent (`#FA5C5C`)
- **openpgp.js v6** (LGPL-3.0) — optional GPG signing
- **License:** GPL-3.0-only

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for code style, testing checklist, and PR guidelines.

## Dev environment

- [Developer machine spec](docs/pc_spec.md) — hardware used by the maintainer (transparency only, not a requirement).
- [Development environment](docs/dev_env.md) — IDE, toolchains, scripts, and release workflow.
- Vietnamese mirrors under [docs/i18n/vi/](docs/i18n/vi/).

## Security

See [SECURITY.md](SECURITY.md). Report vulnerabilities via
[private security advisory](https://github.com/poli0981/itch-f2p-extension/security/advisories/new).

## Legal

- [Privacy Policy](docs/PRIVACY_POLICY.md)
- [Terms of Use](docs/TERMS_OF_USE.md)
- [Disclaimer](docs/DISCLAIMER.md)
- [Third-Party Notices](docs/THIRD_PARTY_NOTICES.md)

## Support

<a href="https://ko-fi.com/skullmute"><img src="https://img.shields.io/badge/Ko--fi-Support-ff5e5b?logo=ko-fi&logoColor=white" alt="Ko-fi"></a>
<a href="https://www.buymeacoffee.com/skullmute"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Support-FFDD00?logo=buy-me-a-coffee&logoColor=black" alt="Buy Me a Coffee"></a>
<a href="https://patreon.com/skullmute"><img src="https://img.shields.io/badge/Patreon-Support-F96854?logo=patreon&logoColor=white" alt="Patreon"></a>
<a href="https://paypal.me/DungDang212"><img src="https://img.shields.io/badge/PayPal-Support-00457C?logo=paypal&logoColor=white" alt="PayPal"></a>
<a href="https://github.com/sponsors/poli0981"><img src="https://img.shields.io/badge/GitHub%20Sponsors-Support-EA4AAA?logo=github&logoColor=white" alt="GitHub Sponsors"></a>

## Author & Contact

Maintained by **poli0981 / SkullMute**. Full list of social, Discord,
Telegram, and email channels: [docs/SOCIAL.md](docs/SOCIAL.md).

---

<p align="center">
  <sub>Made with the assistance of AI tools · Not affiliated with itch.io or GitHub</sub>
</p>
