# Cấu hình máy phát triển

Tài liệu này mô tả phần cứng và môi trường mobile được maintainer sử dụng
để phát triển và kiểm thử extension **itch.io F2P Tracker**. Thông tin
được công khai để minh bạch; **không có cấu hình nào trong số này là yêu
cầu để chạy extension**.

> English: [docs/pc_spec.md](../../pc_spec.md)

---

## Máy phát triển chính

| Thành phần      | Chi tiết                                                            |
| --------------- | ------------------------------------------------------------------- |
| **Hệ điều hành** | Windows 11 Pro 25H2 Insider Preview (Dev Channel), build 26300.8376 |
| **CPU**         | Intel Core i7-14700KF                                                |
| **GPU**         | NVIDIA GeForce RTX 5080 (16 GB VRAM)                                 |
| **RAM**         | 32 GB DDR5                                                           |
| **Lưu trữ**     | 1 TB SSD                                                             |
| **IDE**         | JetBrains IDEs 2026.x (bản trả phí) + VS Code                        |

## Thiết bị di động (kiểm tra web)

Extension target Chromium desktop, nhưng companion data repo và các
trang web liên quan được kiểm tra trên:

- iPhone 14 Pro — iOS 26.x — Chrome, Brave
- iPhone 13 Pro Max — iOS 26.x — Chrome, Brave

Mục nào không được kiểm tra trên mobile sẽ không được liệt kê.

---

## Miễn trừ

Các thông số ở trên mô tả môi trường cục bộ của maintainer. Đây không
phải là yêu cầu tối thiểu. Extension là Manifest V3 Chrome extension và
chạy trên bất kỳ trình duyệt Chromium hiện đại nào.

Để biết phiên bản toolchain và quy trình dev, xem
[docs/i18n/vi/dev_env.md](dev_env.md).
