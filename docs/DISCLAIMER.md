# Disclaimer & Warnings

**Last updated:** March 2026

---

## No Warranty

This Extension is provided **"AS IS"** and **"AS AVAILABLE"**, without warranty of any kind, express or implied,
including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement.

## Independent Development

This Extension is developed and maintained by an **independent developer** with the assistance of AI tools. It is not
affiliated with, endorsed by, or sponsored by itch.io, itch corp, GitHub Inc., or any game developer or publisher.

## Game Information Accuracy

- The Extension extracts game metadata by parsing itch.io page DOM elements. **This information may not be 100%
  accurate**, complete, or up-to-date.
- Free status detection relies on heuristics (`buy_row` parsing, price tag detection) and may produce false positives
  or false negatives.
- **No guarantee is made regarding the quality, safety, content, or suitability of any game** tracked by this Extension.
- NSFW detection is based on keyword matching and content warning div detection. It may miss some content or
  produce false positives.
- Rating data is extracted from itch.io's DOM and may not reflect the most current values.

## Companion Tool

This Extension is designed as a companion tool for the
[free-itch-games-list](https://github.com/poli0981/free-itch-games-list) repository.

- **You may need to modify the Extension** if you use it with a different repository structure.
- The Extension assumes specific repository paths (`scripts/game_info.json`, `scripts/temp_link.json`).
- The `full_object` push format writes directly to `game_info.json`. Ensure your repository accepts this format.

## GitHub API & Authentication

- The Extension requires a GitHub PAT with `repo` scope. This token is stored locally in `chrome.storage.local`.
- **You are solely responsible for the security of your GitHub token.**
- Commits made by the Extension to your repository are your responsibility.

## GPG Signing

- GPG signing is optional. If enabled, the private key is stored in `chrome.storage.local`.
- **You are responsible for the security of your GPG private key.**
- Signature verification depends on key registration in your GitHub account.

## Limitation of Liability

In no event shall the developer(s) be liable for any claim, damages, or other liability arising from the Extension,
including but not limited to loss of data, repository corruption, unauthorized access from compromised tokens, or
inaccurate game information.

## Changes

This disclaimer may be updated at any time. Continued use constitutes acceptance.

---

*If you have concerns, please discontinue use and
[open an issue](https://github.com/poli0981/itch-f2p-extension/issues).*
