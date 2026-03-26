# Third-Party Notices

This document lists third-party components used by the itch.io F2P Tracker Extension.

---

## OpenPGP.js

- **Location:** `lib/openpgp.min.mjs`
- **Version:** 6.x
- **License:** LGPL-3.0
- **Repository:** [openpgpjs/openpgpjs](https://github.com/openpgpjs/openpgpjs)
- **Usage:** Optional GPG commit signing. Used unmodified in pre-built ESM form.
- **License text:** https://github.com/openpgpjs/openpgpjs/blob/main/LICENSE

### LGPL-3.0 Compliance

- The library is a separate, unmodified file (`lib/openpgp.min.mjs`).
- It can be replaced by the user with any compatible version.
- It is loaded as an ES module, not statically linked.
- The Extension's own code is GPL-3.0, which is compatible with LGPL-3.0.

---

## Chrome Extension APIs

- **Provider:** Google (Chromium project)
- **License:** BSD-3-Clause (Chromium), proprietary (Chrome)
- **Usage:** `chrome.storage`, `chrome.runtime`, `chrome.tabs`, `chrome.action`, `chrome.alarms`
- **Note:** Browser-provided APIs, not bundled dependencies.

---

## GitHub REST API

- **Provider:** GitHub, Inc.
- **Terms:
  ** [GitHub API Terms](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features)
- **Usage:** Contents API for file read/write, Git Database API for signed commits.
- **Note:** Not bundled. The Extension makes HTTP requests to `api.github.com`.

---

## itch.io

- **Provider:** itch corp
- **Terms:** [itch.io Terms of Service](https://itch.io/docs/legal/terms)
- **Usage:** Content script reads publicly visible DOM data from itch.io game pages.
- **Note:** Not bundled. No itch.io API keys are used.

---

## No Other Dependencies

The Extension uses vanilla JavaScript (ES2022+) and CSS custom properties. It has **no npm dependencies**, no build
step, and no bundled third-party libraries beyond openpgp.js.
