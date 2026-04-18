#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * Bump semantic version in manifest.json and package.json in sync.
 *
 * Usage:
 *     node scripts/bump-version.js <patch|minor|major>
 *
 * Exits 0 on success, prints new version to stdout.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const type = process.argv[2];
if (!["patch", "minor", "major"].includes(type)) {
    console.error("Usage: node scripts/bump-version.js <patch|minor|major>");
    process.exit(1);
}

function bumpSemver(version, bumpType) {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) throw new Error(`Invalid semver: ${version}`);
    let [, major, minor, patch] = match.map(Number);
    if (bumpType === "major") {
        major++;
        minor = 0;
        patch = 0;
    } else if (bumpType === "minor") {
        minor++;
        patch = 0;
    } else {
        patch++;
    }
    return `${major}.${minor}.${patch}`;
}

// ── Read ──
const manifestPath = resolve(projectRoot, "manifest.json");
const packagePath = resolve(projectRoot, "package.json");

const manifestRaw = readFileSync(manifestPath, "utf8");
const packageRaw = readFileSync(packagePath, "utf8");

const manifest = JSON.parse(manifestRaw);
const pkg = JSON.parse(packageRaw);

const oldVersion = manifest.version;
const newVersion = bumpSemver(oldVersion, type);

// ── Write manifest.json (preserve unusual spacing style) ──
const updatedManifest = manifestRaw.replace(
    /"version"(\s*):(\s*)"[^"]+"/,
    `"version"$1:$2"${newVersion}"`,
);
writeFileSync(manifestPath, updatedManifest);

// ── Write package.json (standard formatting) ──
pkg.version = newVersion;
writeFileSync(packagePath, JSON.stringify(pkg, null, 4) + "\n");

console.log(`${oldVersion} → ${newVersion}`);
console.log(newVersion);
