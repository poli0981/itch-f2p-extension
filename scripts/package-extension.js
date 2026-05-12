#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * Package the extension into a .zip file for Chrome Web Store / GitHub Release.
 *
 * Output: dist/itch-f2p-tracker-v{VERSION}.zip
 * Includes only files needed at runtime — no dev tooling, no docs, no .git.
 */

import { createWriteStream, mkdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

// archiver v8 dropped the legacy callable default export and now exposes
// format-specific classes. Load via CJS interop and use `new ZipArchive(opts)`.
const require = createRequire(import.meta.url);
const { ZipArchive } = require("archiver");

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const manifest = JSON.parse(readFileSync(resolve(projectRoot, "manifest.json"), "utf8"));
const distDir = resolve(projectRoot, "dist");
const outPath = resolve(distDir, `itch-f2p-tracker-v${manifest.version}.zip`);

mkdirSync(distDir, { recursive: true });

const output = createWriteStream(outPath);
const archive = new ZipArchive({ zlib: { level: 9 } });

output.on("close", () => {
    const sizeKb = (archive.pointer() / 1024).toFixed(1);
    console.log(`✓ Packaged: ${outPath.replace(projectRoot + "/", "")} (${sizeKb} KB)`);
});

archive.on("warning", (err) => {
    if (err.code === "ENOENT") console.warn(`⚠ ${err.message}`);
    else throw err;
});
archive.on("error", (err) => {
    throw err;
});

archive.pipe(output);

// ── Bundle contents ──
// Runtime-only: manifest, icons, lib (openpgp), and all extension code directories.

archive.file(resolve(projectRoot, "manifest.json"), { name: "manifest.json" });
archive.file(resolve(projectRoot, "LICENSE"), { name: "LICENSE" });

const dirs = ["icons", "lib", "shared", "background", "content", "popup", "queue", "settings"];
for (const dir of dirs) {
    const absPath = resolve(projectRoot, dir);
    try {
        statSync(absPath);
        archive.directory(absPath, dir);
    } catch {
        console.warn(`⚠ Skipping missing directory: ${dir}`);
    }
}

await archive.finalize();
