# Security Policy

## Reporting a Vulnerability

**Do NOT open a public issue for security vulnerabilities.**

Please report security vulnerabilities through GitHub's private reporting:

**[Report a vulnerability →](https://github.com/poli0981/itch-f2p-extension/security/advisories/new)**

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: within 48 hours
- **Assessment**: within 7 days
- **Fix release**: depends on severity, typically within 14 days for critical issues

---

## Scope

The following are in scope for security reports:

- **Token exposure**: GitHub PAT leaking to unintended destinations
- **GPG key exposure**: private key material transmitted or accessible externally
- **XSS vulnerabilities**: untrusted itch.io page content executing in extension context
- **Data injection**: malicious game page data corrupting extension storage or commits
- **Permission escalation**: extension accessing data beyond declared permissions
- **Storage security**: sensitive data stored insecurely in `chrome.storage.local`

The following are **out of scope**:

- Vulnerabilities in Chrome itself or `chrome.storage.local` encryption
- Vulnerabilities in GitHub's API or itch.io's website
- Social engineering attacks against the user
- Issues requiring physical access to the user's machine
- Issues in openpgp.js (report to [openpgpjs/openpgpjs](https://github.com/openpgpjs/openpgpjs))

---

## Security Design

### Data Flow

The extension only communicates with two external services:

1. **itch.io** (`*.itch.io`) — content script reads page DOM (no HTTP requests made by extension)
2. **GitHub API** (`api.github.com`) — authenticated REST API calls with user's PAT

No data is sent to any server controlled by the developer.

### Sensitive Data Storage

| Data            | Storage                | Transmitted To                         |
|-----------------|------------------------|----------------------------------------|
| GitHub PAT      | `chrome.storage.local` | `api.github.com` only (Bearer header)  |
| GPG private key | `chrome.storage.local` | Never transmitted — local signing only |
| Committer email | `chrome.storage.local` | `api.github.com` (in commits)          |
| Game metadata   | `chrome.storage.local` | `api.github.com` (when pushed)         |

### MV3 Security

- All imports are static (no dynamic `import()`)
- Content Security Policy: `script-src 'self'`
- Content script runs in isolated world (cannot access page JS context)
- No `eval()`, `new Function()`, or inline event handlers
- All dynamic DOM content uses `textContent` (never `innerHTML`)

---

## Supported Versions

| Version | Supported     |
|---------|---------------|
| 1.x.x   | ✅ Active      |
| < 1.0   | ❌ Pre-release |

Only the latest release receives security updates.
