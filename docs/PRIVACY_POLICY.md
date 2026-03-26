# Privacy Policy

**Last updated:** March 2026  
**Applies to:** itch.io F2P Tracker Extension (Chrome/Chromium)

---

## Overview

The itch.io F2P Tracker Extension ("the Extension") operates **entirely on your local machine** and does not collect,
transmit, or store any personal data on external servers controlled by the developer.

---

## Data We Do NOT Collect

The Extension does **not** collect, store, or transmit:

- Personal identifying information (name, email, phone number, etc.)
- Browsing history or browsing habits
- Device identifiers or fingerprints
- Location data
- Analytics, telemetry, or usage statistics
- Cookies or tracking data

**There is no analytics service, tracking pixel, or telemetry endpoint in this Extension.**

---

## Data Stored Locally

The Extension uses `chrome.storage.local` to persist data **on your device only**:

| Data                                         | Purpose                         | Shared With                            |
|----------------------------------------------|---------------------------------|----------------------------------------|
| GitHub Personal Access Token                 | Authenticate with GitHub API    | `api.github.com` only                  |
| GitHub repository info (owner, repo, branch) | Identify target repository      | `api.github.com` only                  |
| Committer name and email                     | Set as commit author/committer  | `api.github.com` only                  |
| Push format preference                       | Determine target file for push  | Never transmitted                      |
| GPG private key (if imported)                | Sign commits (optional)         | Never transmitted — local signing only |
| Game queue (detected game metadata)          | Store pending games before push | `api.github.com` when pushed           |
| Extension logs                               | Debugging and activity history  | Never transmitted                      |
| Cached URL lists                             | Deduplication checks            | Never transmitted                      |

### Important Notes

- **Your GitHub token** is sent only to `api.github.com` as an `Authorization` header.
- **Your GPG private key** is never transmitted. Only the resulting signature is sent to GitHub.
- **Committer name and email** become part of public Git history if your repository is public.

---

## Data Transmitted to Third Parties

### 1. itch.io (`*.itch.io`)

- **What:** The content script reads the DOM of itch.io game pages you visit to extract game metadata.
- **How:** Standard page reading — no additional HTTP requests are made to itch.io by the Extension.
- **Note:** The Extension only reads pages you have already navigated to in your browser.

### 2. GitHub API (`api.github.com`)

- **What:** The Extension reads and writes files in your specified GitHub repository.
- **Authentication:** Your PAT is sent as a Bearer token in the `Authorization` header.
- **Data sent:** Game URLs or full game metadata (depending on push format setting), commit messages, and optionally
  GPG signatures.
- **Privacy policy:
  ** [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)

**No data is sent to any server controlled by the Extension developer.**

---

## Permissions Explained

| Permission                          | Why It's Needed                                           |
|-------------------------------------|-----------------------------------------------------------|
| `storage`                           | Store settings, queue, logs, and cached data locally      |
| `activeTab`                         | Read the current itch.io tab to detect game information   |
| `alarms`                            | Schedule auto-push checks (if threshold is configured)    |
| Host: `*.itch.io/*`                 | Content script runs on itch.io pages to extract game data |
| Host: `api.github.com/*`            | API calls to read/write repository files                  |
| Host: `raw.githubusercontent.com/*` | Fetch raw file content for deduplication checks           |

---

## Data Retention

- All data persists in `chrome.storage.local` until manually cleared, extension reset, or uninstallation.
- Uninstalling the Extension removes all locally stored data.
- The "Reset Extension" feature clears all stored data.
- Logs are automatically pruned when they exceed the configured maximum (default: 500 entries).

---

## Data You Push to GitHub

When you push games to your repository, the metadata becomes part of Git history. If your repository is **public**,
this includes:

- Game URLs, names, genres, and other metadata
- Commit messages with timestamps
- Committer name and email
- GPG signatures (if enabled)

**You are responsible for the content you push to your repository.**

---

## Children's Privacy

This Extension is not directed at children under the age of 13. We do not knowingly collect any information from
children.

---

## Changes to This Policy

Changes will be documented in the repository's commit history. Continued use after changes constitutes acceptance.

---

## Contact

If you have questions, please [open an issue](https://github.com/poli0981/itch-f2p-extension/issues).
