# Developer Machine Spec

This document describes the hardware and mobile environment used by the
maintainer for developing and testing the **itch.io F2P Tracker** extension.
It is published for transparency; **none of this hardware is a requirement
to run the extension**.

> Vietnamese: [docs/i18n/vi/pc_spec.md](i18n/vi/pc_spec.md)

---

## Primary developer machine

| Component   | Details                                                       |
| ----------- | ------------------------------------------------------------- |
| **OS**      | Windows 11 Pro 25H2 Insider Preview (Dev Channel), build 26300.8376 |
| **CPU**     | Intel Core i7-14700KF                                         |
| **GPU**     | NVIDIA GeForce RTX 5080 (16 GB VRAM)                          |
| **RAM**     | 32 GB DDR5                                                    |
| **Storage** | 1 TB SSD                                                      |
| **IDE**     | JetBrains IDEs 2026.x (paid lineup) + VS Code                 |

## Mobile devices (web testing)

The extension targets desktop Chromium, but the companion data repo and
related web pages are sanity-checked on:

- iPhone 14 Pro — iOS 26.x — Chrome, Brave
- iPhone 13 Pro Max — iOS 26.x — Chrome, Brave

If a section is not exercised on mobile, it is intentionally not listed.

---

## Disclaimer

The figures above describe the maintainer's local environment. They are
not minimum requirements. The extension is a Manifest V3 Chrome extension
and runs on any reasonably modern Chromium browser.

For toolchain versions and dev workflow, see
[docs/dev_env.md](dev_env.md).
