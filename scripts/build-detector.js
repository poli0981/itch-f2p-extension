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
const detectorPath = resolve(projectRoot, "content/detector.js");

const source = readFileSync(detectorPath, "utf8");

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

if (!markerRe.test(source)) {
    console.error("✗ Marker block not found in content/detector.js");
    console.error("  Expected:");
    console.error("    // NSFW_KEYWORDS_START");
    console.error("    ...");
    console.error("    // NSFW_KEYWORDS_END");
    process.exit(1);
}

const updated = source.replace(markerRe, replacement);

if (updated === source) {
    console.log(`✓ detector.js already up-to-date (${NSFW_KEYWORDS.length} keywords)`);
    process.exit(0);
}

writeFileSync(detectorPath, updated);
console.log(`✓ Injected ${NSFW_KEYWORDS.length} NSFW keywords into content/detector.js`);
