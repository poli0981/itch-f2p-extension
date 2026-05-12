# Môi trường phát triển

Tài liệu này ghi lại cấu hình IDE, toolchain ngôn ngữ và quy trình phát
triển được maintainer của **itch.io F2P Tracker** sử dụng.

> English: [docs/dev_env.md](../../dev_env.md)
> Phần cứng: [docs/i18n/vi/pc_spec.md](pc_spec.md)

---

## IDE

- **JetBrains IDEs 2026.x** (bản trả phí)
  - WebStorm — IDE chính cho Chrome extension này
  - RustRover — dùng cho companion Tauri 2 desktop tương lai
  - PyCharm — dùng cho script bảo trì companion repo
  - Rider — giữ để làm việc cross-language
- **Visual Studio Code** — editor phụ cho chỉnh nhanh và preview `.md`

## Toolchain ngôn ngữ

| Công cụ     | Phiên bản           | Ghi chú                                       |
| ----------- | ------------------- | --------------------------------------------- |
| Node.js     | >= 22               | Bắt buộc theo `engines` trong `package.json`  |
| npm         | đi kèm Node         | Dùng cho lint / build / package scripts       |
| Python      | 3.12                | Chỉ dùng cho script companion                 |
| Rust        | stable, qua rustup  | Chỉ cho build Tauri tương lai                 |
| Tauri       | 2.x                 | Companion desktop tương lai                   |
| Git         | bản gần đây         | GPG signing on (`commit.gpgsign=true`)        |

Chỉ Node.js là bắt buộc để build extension. Các phần còn lại liệt kê để
đầy đủ.

## Script repo

Tất cả script ở `package.json` và `scripts/`:

| Lệnh                        | Mục đích                                                  |
| --------------------------- | --------------------------------------------------------- |
| `npm run lint`              | ESLint flat-config check                                  |
| `npm run lint:fix`          | ESLint auto-fix                                           |
| `npm run format`            | Prettier write                                            |
| `npm run validate:manifest` | Validate `manifest.json` theo MV3                         |
| `npm run build:detector`    | Inject `shared/nsfw-keywords.js` vào `content/detector.js` |
| `npm run package`           | Build `.zip` phát hành trong `dist/`                      |
| `npm run bump:patch`        | Tăng patch version trong manifest + package.json          |
| `npm run bump:minor`        | Tăng minor version                                        |
| `npm run bump:major`        | Tăng major version                                        |

## Quy trình release

1. Đẩy thay đổi vào `main` (qua PR review, CI phải pass).
2. `npm run bump:patch` (hoặc `minor` / `major`) — update cả
   `manifest.json` và `package.json`.
3. Commit và push version bump.
4. Trigger workflow `Version Bump` (hoặc thủ công `git tag vX.Y.Z`) →
   `release.yml` chạy trên tag.
5. `release.yml` build `.zip`, publish GitHub Release, và **tự động tạo
   Discussion** trong category **Announcements**.
6. `announce-release.yml` gửi thông báo Discord.

## Code style

- ESLint flat config (v9)
- Prettier (mặc định + `.prettierrc` của project nếu có)
- Vanilla ES2022+ JavaScript, không có build step cho runtime code (trừ
  bước inject `content/detector.js`)
- HTML format theo style aligned-attribute hiện có trong
  `popup/popup.html` và `settings/settings.html`
