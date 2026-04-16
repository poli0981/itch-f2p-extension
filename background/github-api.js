// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * GitHub REST API client.
 * [SHARED] Identical to Steam extension.
 *
 * Handles all communication with GitHub:
 *   - Contents API: read/write files
 *   - Response caching with TTL
 *   - Base64 encode/decode for file content
 *   - Error classification (auth, rate-limit, conflict, network)
 *   - Git Database API for signed commits
 */

import {GITHUB_API_BASE} from "../shared/constants.js";
import {loadSettings} from "../shared/storage.js";
import {logDebug, logError, logInfo} from "../shared/logger.js";

const cache = new Map ();

function cacheKey (owner, repo, path, branch) {
    return `${owner}/${repo}/${branch}:${path}`;
}

function isCacheValid (entry, ttlMs) {
    return entry && (
        Date.now () - entry.timestamp
    ) < ttlMs;
}

function classifyError (status, body = "") {
    if (status === 401 || status === 403) {
        if (typeof body === "string" && body.includes ("rate limit")) {
            return {type: "rate_limit", status, message: "GitHub API rate limit exceeded"};
        }
        return {type: "auth", status, message: "Authentication failed \u2014 check your token"};
    }
    if (status === 404) return {type: "not_found", status, message: "File or repository not found"};
    if (status === 409) return {type: "conflict", status, message: "SHA conflict \u2014 file was modified remotely"};
    if (status === 422) return {type: "validation", status, message: "GitHub rejected the request (validation error)"};
    if (status >= 500) return {type: "server", status, message: `GitHub server error (${status})`};
    return {type: "unknown", status, message: `Unexpected HTTP ${status}`};
}

function makeHeaders (token) {
    return {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
    };
}

async function getConfig () {
    const s = await loadSettings ();
    if (!s.github_owner || !s.github_repo || !s.github_token) {
        throw new Error ("GitHub not configured \u2014 set owner, repo, and token in Settings");
    }
    return {
        owner: s.github_owner,
        repo: s.github_repo,
        branch: s.github_branch || "main",
        token: s.github_token,
        cacheTtl: (
                      s.cache_ttl_minutes || 5
                  ) * 60 * 1000,
        commitPrefix: s.commit_prefix || "ext:",
        committerName: s.committer_name || "itch-f2p-ext[bot]",
        committerEmail: s.committer_email || "noreply@github.com",
    };
}

export async function getFileContent (path, opts = {}) {
    const {useCache = true, allowMissing = false} = opts;
    const cfg = await getConfig ();
    const key = cacheKey (cfg.owner, cfg.repo, path, cfg.branch);

    if (useCache && isCacheValid (cache.get (key), cfg.cacheTtl)) {
        await logDebug ("github", `Cache hit: ${path}`);
        return cache.get (key).data;
    }

    const url = `${GITHUB_API_BASE}/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${cfg.branch}`;

    let resp;
    try {
        resp = await fetch (url, {headers: makeHeaders (cfg.token)});
    }
    catch (err) {
        await logError ("github", `Network error fetching ${path}: ${err.message}`);
        throw {type: "network", status: 0, message: `Network error: ${err.message}`};
    }

    if (!resp.ok) {
        if (resp.status === 404 && allowMissing) {
            await logDebug ("github", `File not found (allowed): ${path}`);
            return null;
        }
        const body = await resp.text ()
                               .catch (() => "");
        const err = classifyError (resp.status, body);
        await logError ("github", `${err.message} (${path})`, {status: resp.status});
        throw err;
    }

    const json = await resp.json ();

    let content = "";
    if (json.content) {
        const raw = json.content.replace (/\n/g, "");
        content = decodeBase64 (raw);
    }

    const result = {content, sha: json.sha, path: json.path || path};
    cache.set (key, {data: result, timestamp: Date.now ()});

    await logDebug ("github", `Fetched ${path} (${content.length} chars, sha: ${json.sha.slice (0, 7)})`);
    return result;
}

export async function putFileContent (path, content, sha, message) {
    const cfg = await getConfig ();

    const body = {
        message,
        content: encodeBase64 (content),
        branch: cfg.branch,
        committer: {name: cfg.committerName, email: cfg.committerEmail},
    };
    if (sha) body.sha = sha;

    const url = `${GITHUB_API_BASE}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;

    let resp;
    try {
        resp = await fetch (url, {
            method: "PUT",
            headers: makeHeaders (cfg.token),
            body: JSON.stringify (body),
        });
    }
    catch (err) {
        await logError ("github", `Network error writing ${path}: ${err.message}`);
        throw {type: "network", status: 0, message: `Network error: ${err.message}`};
    }

    if (!resp.ok) {
        const respBody = await resp.text ()
                                   .catch (() => "");
        const err = classifyError (resp.status, respBody);
        await logError ("github", `${err.message} (PUT ${path})`, {status: resp.status});
        throw err;
    }

    const json = await resp.json ();
    const key = cacheKey (cfg.owner, cfg.repo, path, cfg.branch);
    cache.delete (key);

    const result = {sha: json.content?.sha || "", commitSha: json.commit?.sha || ""};
    await logInfo ("github", `Updated ${path} (commit: ${result.commitSha.slice (0, 7)})`, {path});
    return result;
}

export function clearCache () { cache.clear (); }

export async function invalidatePath (path) {
    const cfg = await getConfig ();
    const key = cacheKey (cfg.owner, cfg.repo, path, cfg.branch);
    cache.delete (key);
}

// ── Git Database API (for signed commits) ──

async function githubFetch (method, endpoint, body = null) {
    const cfg = await getConfig ();
    const url = `${GITHUB_API_BASE}/repos/${cfg.owner}/${cfg.repo}${endpoint}`;
    const init = {method, headers: makeHeaders (cfg.token)};
    if (body) init.body = JSON.stringify (body);

    let resp;
    try {
        resp = await fetch (url, init);
    }
    catch (err) {
        throw {type: "network", status: 0, message: `Network error: ${err.message}`};
    }

    if (!resp.ok) {
        const text = await resp.text ()
                               .catch (() => "");
        throw classifyError (resp.status, text);
    }
    return resp.json ();
}

export async function getHeadCommit () {
    const cfg = await getConfig ();
    const data = await githubFetch ("GET", `/git/ref/heads/${cfg.branch}`);
    const commitSha = data.object.sha;
    const commit = await githubFetch ("GET", `/git/commits/${commitSha}`);
    return {sha: commitSha, treeSha: commit.tree.sha};
}

export async function createBlob (content) {
    const data = await githubFetch ("POST", "/git/blobs", {
        content: encodeBase64 (content),
        encoding: "base64",
    });
    return data.sha;
}

export async function createTree (baseTreeSha, pathOrEntries, blobSha) {
    let tree;
    if (Array.isArray (pathOrEntries)) {
        tree = pathOrEntries.map ((e) => ({path: e.path, mode: "100644", type: "blob", sha: e.blobSha}));
    }
    else {
        tree = [{path: pathOrEntries, mode: "100644", type: "blob", sha: blobSha}];
    }
    const data = await githubFetch ("POST", "/git/trees", {base_tree: baseTreeSha, tree});
    return data.sha;
}

export async function createSignedCommit ({
                                              treeSha, parentSha, message, signature,
                                              authorName, authorEmail, committerName, committerEmail, date,
                                          }) {
    const author = {
        name: authorName || "itch-f2p-ext[bot]",
        email: authorEmail || "noreply@github.com",
        date,
    };
    const committer = {
        name: committerName || authorName || "itch-f2p-ext[bot]",
        email: committerEmail || authorEmail || "noreply@github.com",
        date,
    };
    const data = await githubFetch ("POST", "/git/commits", {
        message, tree: treeSha, parents: [parentSha], author, committer, signature,
    });
    await logInfo ("github", `Created signed commit: ${data.sha.slice (0, 7)}`);
    return data.sha;
}

export async function createUnsignedCommit ({
                                                treeSha, parentSha, message,
                                                authorName, authorEmail,
                                                committerName, committerEmail, date,
                                            }) {
    const author = {
        name: authorName || "itch-f2p-ext[bot]",
        email: authorEmail || "noreply@github.com",
        date,
    };
    const committer = {
        name: committerName || authorName || "itch-f2p-ext[bot]",
        email: committerEmail || authorEmail || "noreply@github.com",
        date,
    };
    const data = await githubFetch ("POST", "/git/commits", {
        message, tree: treeSha, parents: [parentSha], author, committer,
    });
    await logInfo ("github", `Created unsigned commit: ${data.sha.slice (0, 7)}`);
    return data.sha;
}

export async function updateRef (commitSha) {
    const cfg = await getConfig ();
    await githubFetch ("PATCH", `/git/refs/heads/${cfg.branch}`, {sha: commitSha, force: false});
    await logInfo ("github", `Updated ref heads/${cfg.branch} \u2192 ${commitSha.slice (0, 7)}`);
}

// ── Base64 helpers ──

function encodeBase64 (str) {
    const bytes = new TextEncoder ().encode (str);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode (b);
    return btoa (binary);
}

function decodeBase64 (b64) {
    const binary = atob (b64);
    const bytes = new Uint8Array (binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt (i);
    return new TextDecoder ().decode (bytes);
}
