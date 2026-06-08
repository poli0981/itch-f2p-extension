#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * Build step: inject NSFW_KEYWORDS array from shared/nsfw-keywords.js into
 * content/detector.js (MV3 content scripts cannot use ES module imports).
 *
 * Looks for marker block:
 *     // NSFW_KEYWORDS_START
 *     ...
 *     // NSFW_KEYWORDS_END
 *
 * Replaces its contents with the canonical array from shared/nsfw-keywords.js.
 * Run via: npm run build:detector
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { NSFW_KEYWORDS } from "../shared/nsfw-keywords.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// Content scripts that inline the NSFW keyword array (MV3 content scripts
// cannot use ES module imports, so the array is injected at build time).
const targets = ["content/detector.js", "content/search-detector.js"];

// Build the injected block with 4-space base indentation (matches detector.js style).
const indent = "    ";
const arrayLines = NSFW_KEYWORDS.map((k) => `${indent}${indent}${JSON.stringify(k)},`).join("\n");
const replacement = [
    `${indent}// NSFW_KEYWORDS_START — auto-generated from shared/nsfw-keywords.js, do not edit manually`,
    `${indent}const NSFW_KEYWORDS = [`,
    arrayLines,
    `${indent}];`,
    `${indent}// NSFW_KEYWORDS_END`,
].join("\n");

const markerRe = /^[ \t]*\/\/ NSFW_KEYWORDS_START[\s\S]*?\/\/ NSFW_KEYWORDS_END[ \t]*$/m;

for (const rel of targets) {
    const targetPath = resolve(projectRoot, rel);
    const source = readFileSync(targetPath, "utf8");

    if (!markerRe.test(source)) {
        console.error(`✗ Marker block not found in ${rel}`);
        console.error("  Expected:");
        console.error("    // NSFW_KEYWORDS_START");
        console.error("    ...");
        console.error("    // NSFW_KEYWORDS_END");
        process.exit(1);
    }

    const updated = source.replace(markerRe, replacement);

    if (updated === source) {
        console.log(`✓ ${rel} already up-to-date (${NSFW_KEYWORDS.length} keywords)`);
        continue;
    }

    writeFileSync(targetPath, updated);
    console.log(`✓ Injected ${NSFW_KEYWORDS.length} NSFW keywords into ${rel}`);
}
