#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * Validate manifest.json against MV3 requirements and project conventions.
 * Fails fast with actionable error messages.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const manifestPath = resolve(projectRoot, "manifest.json");
const packagePath = resolve(projectRoot, "package.json");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const pkg = JSON.parse(readFileSync(packagePath, "utf8"));

const errors = [];
const warnings = [];

// ── Core fields ──
if (manifest.manifest_version !== 3) errors.push("manifest_version must be 3");
if (!manifest.name || manifest.name.length > 75) errors.push("name missing or too long (>75 chars)");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version || "")) {
    errors.push(`version "${manifest.version}" does not match x.y.z format`);
}
if (manifest.version !== pkg.version) {
    errors.push(`Version mismatch: manifest.json=${manifest.version}, package.json=${pkg.version}`);
}
if (!manifest.description) warnings.push("description is empty");
if (!manifest.icons || !manifest.icons["128"]) errors.push("icons.128 required for Chrome Web Store");

// ── Permissions ──
const requiredPerms = ["storage"];
for (const perm of requiredPerms) {
    if (!manifest.permissions?.includes(perm)) errors.push(`Missing required permission: ${perm}`);
}

// ── Background ──
if (!manifest.background?.service_worker) errors.push("background.service_worker missing");
if (manifest.background?.type !== "module") warnings.push('background.type should be "module"');

// ── Content scripts ──
if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length === 0) {
    warnings.push("No content_scripts declared");
}

// ── Action / popup ──
if (!manifest.action?.default_popup) warnings.push("action.default_popup missing");

// ── Host permissions ──
if (!manifest.host_permissions?.length) warnings.push("host_permissions empty");

// ── Report ──
if (warnings.length > 0) {
    for (const w of warnings) console.warn(`⚠ ${w}`);
}
if (errors.length > 0) {
    for (const e of errors) console.error(`✗ ${e}`);
    process.exit(1);
}

console.log(`✓ manifest.json valid (v${manifest.version}, MV3, ${manifest.permissions?.length || 0} permissions)`);
