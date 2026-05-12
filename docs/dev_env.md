# Development Environment

This document captures the IDE configuration, language toolchains, and
development workflow used by the maintainer of **itch.io F2P Tracker**.

> Vietnamese: [docs/i18n/vi/dev_env.md](i18n/vi/dev_env.md)
> Hardware: [docs/pc_spec.md](pc_spec.md)

---

## IDEs

- **JetBrains IDEs 2026.x** (paid lineup)
  - WebStorm — primary IDE for this Chrome extension
  - RustRover — used for any future Tauri 2 desktop companion
  - PyCharm — used for repo-side maintenance scripts
  - Rider — kept for cross-language work
- **Visual Studio Code** — secondary editor for quick edits and `.md`
  preview

## Language toolchains

| Tool        | Version            | Notes                                      |
| ----------- | ------------------ | ------------------------------------------ |
| Node.js     | >= 22              | Required by `package.json` `engines` field |
| npm         | bundled with Node  | Used for lint / build / package scripts    |
| Python      | 3.12               | Companion scripts only                     |
| Rust        | stable, via rustup | For future Tauri build only                |
| Tauri       | 2.x                | Future desktop companion                   |
| Git         | recent             | GPG signing on (`commit.gpgsign=true`)     |

Only Node.js is required to build the extension itself. The rest of the
toolchain is listed for completeness.

## Repository scripts

All scripts live in `package.json` and `scripts/`:

| Command                     | Purpose                                                   |
| --------------------------- | --------------------------------------------------------- |
| `npm run lint`              | ESLint flat-config check                                  |
| `npm run lint:fix`          | ESLint auto-fix                                           |
| `npm run format`            | Prettier write                                            |
| `npm run validate:manifest` | Validate `manifest.json` against MV3 rules                |
| `npm run build:detector`    | Inject `shared/nsfw-keywords.js` into `content/detector.js` |
| `npm run package`           | Build distributable `.zip` in `dist/`                     |
| `npm run bump:patch`        | Bump patch version in manifest + package.json             |
| `npm run bump:minor`        | Bump minor version                                        |
| `npm run bump:major`        | Bump major version                                        |

## Release workflow

1. Land changes on `main` (PR review, CI must pass).
2. `npm run bump:patch` (or `minor` / `major`) — updates both
   `manifest.json` and `package.json`.
3. Commit and push the version bump.
4. Trigger `Version Bump` workflow (or manually `git tag vX.Y.Z`) →
   `release.yml` runs on the tag.
5. `release.yml` builds the `.zip`, publishes a GitHub Release, and
   auto-creates a Discussion in the **Announcements** category.
6. `announce-release.yml` sends a Discord notification.

## Code style

- ESLint flat config (v9)
- Prettier (default settings + project `.prettierrc` if present)
- Vanilla ES2022+ JavaScript, no build step for runtime code (only
  the `content/detector.js` injection)
- HTML formatting follows the existing aligned-attribute style in
  `popup/popup.html` and `settings/settings.html`
