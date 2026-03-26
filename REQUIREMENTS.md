# Requirements & Development Specs

---

## Development Environment

This extension was built and tested with the following setup.

### Tools

| Tool                        | Version | Purpose                                                |
|-----------------------------|---------|--------------------------------------------------------|
| JetBrains WebStorm          | 2026.1  | Primary IDE                                            |
| Claude Opus 4.6 (Anthropic) | —       | AI assistance for coding, debugging, and documentation |
| GitHub                      | —       | Source code hosting and version control                |

### Development OS

| OS      | Version |
|---------|---------|
| Windows | 11      |
| macOS   | 26.4    |

### Tested Browsers

| Browser              | Version                                       | OS              | Status   |
|----------------------|-----------------------------------------------|-----------------|----------|
| Google Chrome Canary | 148.0.7753.0 (Official Build) canary (64-bit) | Windows 11 25H2 | ✅ Passed |
| Brave                | 1.88.136 (Chromium 146.9.7680.164)            | macOS 26.4      | ✅ Passed |

> The developer is also the primary tester for this project.

---

## User Requirements

### Minimum

| Component               | Requirement                                                                                                                  |
|-------------------------|------------------------------------------------------------------------------------------------------------------------------|
| **Browser**             | Google Chrome 116+ or any Chromium-based browser with Manifest V3 support (Edge 116+, Brave 1.57+, Opera 102+, Vivaldi 6.2+) |
| **OS**                  | Windows 10 (64-bit), macOS 12 Monterey, or Ubuntu 22.04 / equivalent Linux                                                   |
| **GitHub Account**      | Required — with a Personal Access Token (`repo` scope)                                                                       |
| **Target Repository**   | A GitHub repository containing `scripts/game_info.json` and/or `scripts/temp_link.json`                                      |
| **Internet Connection** | Required for GitHub API calls and itch.io page access                                                                        |
| **Storage**             | ~2 MB available in browser local storage                                                                                     |

### Recommended

| Component        | Recommendation                                                                                                                              |
|------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| **Browser**      | Latest stable Google Chrome or Brave (Chromium 130+)                                                                                        |
| **OS**           | Windows 11 24H2+, macOS 15+, or Ubuntu 24.04+                                                                                               |
| **GitHub Token** | Fine-grained PAT scoped to the target repository only (instead of classic PAT with broad `repo` access)                                     |
| **GPG Key**      | Ed25519 or RSA-4096 key registered in your GitHub account (for verified commit signatures)                                                  |
| **Push Format**  | `full_object` for single-maintainer workflows (no backend scrape needed); `url_only` for collaborative repos with `update_info.py` pipeline |

### Not Supported

| Environment      | Reason                                                                                                     |
|------------------|------------------------------------------------------------------------------------------------------------|
| Firefox / Safari | Manifest V3 service worker API differences; `chrome.*` namespace not available                             |
| Mobile browsers  | Chrome extensions are not supported on Android/iOS                                                         |
| Chrome < 116     | Manifest V3 service worker + static import support required                                                |
| Incognito mode   | `chrome.storage.local` is not accessible in incognito by default (can be enabled in `chrome://extensions`) |
