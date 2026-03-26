# Contributing to itch.io F2P Tracker Extension

Thank you for your interest in contributing! This document covers how to report issues, suggest features, and submit
code changes.

---

## Before You Start

1. **Read the [README](README.md)** to understand what the extension does.
2. **Search [existing issues](https://github.com/poli0981/itch-f2p-extension/issues)** to avoid duplicates.
3. **Check the [project board](https://github.com/poli0981/itch-f2p-extension/projects)** for current priorities.

---

## Opening an Issue

### Bug Reports

Use the [Bug Report template](https://github.com/poli0981/itch-f2p-extension/issues/new?template=bug_report.yml).
Include:

- Steps to reproduce (numbered)
- Expected vs actual behavior
- itch.io game page URL (if applicable)
- Extension version, browser version, OS
- Screenshots or exported logs (Settings → Export Logs)

### Feature Requests

Use
the [Feature Request template](https://github.com/poli0981/itch-f2p-extension/issues/new?template=feature_request.yml).
Explain:

- What you want and why
- How it should work
- What alternatives you considered

### Security Vulnerabilities

**Do NOT open a public issue.**
Use [private security reporting](https://github.com/poli0981/itch-f2p-extension/security/advisories/new) instead.

---

## Submitting Code

### Setup

```bash
git clone https://github.com/poli0981/itch-f2p-extension.git
cd itch-f2p-extension
```

No build step required. Load the extension in Chrome:

1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select the project folder

### Branch Naming

- `fix/short-description` — bug fixes
- `feat/short-description` — new features
- `refactor/short-description` — code improvements
- `docs/short-description` — documentation changes

### Commit Messages

Follow the project's commit prefix convention:

```
ext: add selective push for queue entries
fix: handle missing info panel on minimal itch.io pages
docs: update privacy policy for push_format setting
refactor: simplify genre tag-select dropdown logic
```

### Pull Request Process

1. **One PR per issue.** Link the issue with `Closes #123`.
2. **Fill out the PR template** completely.
3. **Test thoroughly** before submitting (see checklist below).
4. **Keep PRs focused.** Avoid mixing unrelated changes.

---

## Code Style

### JavaScript

- **ES2022+** — use modern syntax (optional chaining, nullish coalescing, etc.)
- **No build step** — no transpiler, no bundler, no npm dependencies
- **Static imports only** in service worker — no `await import()` (MV3 restriction)
- **Content script** is a plain IIFE (not an ES module) — no `import`/`export`
- **`textContent`** for all dynamic DOM content — never `innerHTML` with user data
- **No `eval()`**, `new Function()`, or inline event handlers

### CSS

- **CSS custom properties** from `shared/theme.css` — no hardcoded colors
- **No preprocessors** (no Sass, Less, PostCSS)
- **BEM-ish naming** — `.game-card-body`, `.detected-badges`, etc.

### File Organization

```
background/   — Service worker modules (business logic)
content/      — Content script (itch.io page parser)
shared/       — Constants, utilities, storage, logger, theme
popup/        — Popup UI (HTML + CSS + JS)
queue/        — Queue page UI
settings/     — Settings page UI
lib/          — Vendored libraries (openpgp.js only)
docs/         — Legal documents
```

### Key Conventions

- **Identity key**: normalized URL (`https://creator.itch.io/slug`) — not numeric ID
- **N/A sentinel**: fields use `"N/A"` string when data is unavailable (matches scraper.py)
- **Push format routing**: `url_only` → `temp_link.json`, `full_object` → `game_info.json`
- **All user-facing strings**: use `textContent`, never `innerHTML`
- **Error handling**: always `try/catch` around storage and network operations

---

## Testing Checklist

Before submitting a PR, verify:

- [ ] Extension loads without errors on `chrome://extensions`
- [ ] No console errors in service worker
- [ ] No console errors in popup / queue / settings pages
- [ ] Tested detection on a free itch.io game page
- [ ] Tested detection on a paid itch.io game page (should show "Not Free")
- [ ] Tested detection on a non-game itch.io page (should show "No game detected")
- [ ] Tested queue add / remove / edit operations
- [ ] Tested push to GitHub (real or test repo)
- [ ] Tested with GPG signing enabled (if applicable)
- [ ] Tested with GPG signing disabled
- [ ] Tested search/filter in queue page
- [ ] Tested settings save/load cycle

### itch.io Test Pages

Use these page types to verify detection:

| Page Type     | Example Pattern               | Expected                                 |
|---------------|-------------------------------|------------------------------------------|
| Free game     | `creator.itch.io/free-game`   | Detected, "Free" badge                   |
| Paid game     | `creator.itch.io/paid-game`   | Detected, "Not Free" badge, Add disabled |
| Browser game  | `creator.itch.io/html5-game`  | Detected (no buy_row = free)             |
| NSFW game     | Game with content warning     | Detected, "NSFW" badge                   |
| Game jam page | `itch.io/jam/jam-name`        | Not detected (correct)                   |
| Profile page  | `creator.itch.io`             | Not detected (correct)                   |
| Devlog        | `creator.itch.io/game/devlog` | Not detected (correct)                   |

---

## Questions?

Open a [discussion](https://github.com/poli0981/itch-f2p-extension/discussions) or ask in an issue. We're happy to
help!
