// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 poli0981 & contributor(s)
// This file is part of itch.io F2P Tracker Extension.
// See LICENSE for full license text.
/**
 * Push strategies — the concrete push execution paths and dispatcher.
 *
 *   full_object → multi-file commit via Git Database API
 *   url_only    → single-file commit (signed: Git Database API,
 *                 unsigned: Contents API)
 *
 * Extracted from push-handler.js (v1.9.1 refactor). executePush() is the
 * single entry point used by push-handler.js.
 */

import {REPO_INDEX_PATH, REPO_TEMP_PATH} from "../shared/constants.js";
import {logWarn} from "../shared/logger.js";
import {
    createBlob,
    createSignedCommit,
    createTree,
    createUnsignedCommit,
    getFileContent,
    getHeadCommit,
    invalidatePath,
    putFileContent,
    updateRef,
} from "./github-api.js";
import {buildCommitPayload, getKeyMeta, isSigningAvailable, signCommitPayload} from "./gpg-signer.js";
import {buildCommitMessage, distributeEntries, mergeJsonArray, readIndex, toFullObject} from "./push-serialize.js";

// ════════════════════════════════════════════════════════════
// Push: full_object (multi-file via Git Database API)
// ════════════════════════════════════════════════════════════

/**
 * Execute a full_object push using Git Database API.
 * Handles multi-file commits (data files + index.json) atomically.
 * Works for both signed and unsigned commits.
 */
async function executeFullObjectPush (entries, settings, signed) {
    const commitMsg = buildCommitMessage (entries.length, settings.commit_prefix || "ext:", "full_object");
    const serialized = entries.map ((e) => toFullObject (e));

    // 1. Read current index
    const {data: indexData} = await readIndex ();

    // 2. Distribute entries across files
    const {fileOps, updatedIndex} = distributeEntries (indexData, serialized);

    // 3. Build blobs for each data file
    const blobEntries = [];

    for (const op of fileOps) {
        let existingContent = "";
        if (!op.isNew) {
            try {
                const file = await getFileContent (op.path, {useCache: false, allowMissing: true});
                if (file) existingContent = file.content;
            }
            catch (err) {
                if (err.type === "auth") throw err;
                await logWarn ("push", `Could not fetch ${op.path}: ${err.message}. Treating as new.`);
            }
        }

        const merged = mergeJsonArray (existingContent, op.entries);
        const blobSha = await createBlob (merged);
        blobEntries.push ({path: op.path, blobSha});
    }

    // 4. Blob for updated index.json
    const indexContent = JSON.stringify (updatedIndex, null, 4) + "\n";
    const indexBlobSha = await createBlob (indexContent);
    blobEntries.push ({path: REPO_INDEX_PATH, blobSha: indexBlobSha});

    // 5. Create tree with all file changes
    const head = await getHeadCommit ();
    const treeSha = await createTree (head.treeSha, blobEntries);

    // 6. Create commit (signed or unsigned)
    const now = new Date ();
    const unixTimestamp = Math.floor (now.getTime () / 1000);
    const isoDate = new Date (unixTimestamp * 1000).toISOString ();

    const committerName = settings.committer_name || "itch-f2p-ext[bot]";
    const authorName = "itch-f2p-ext[bot]";
    let committerEmail, authorEmail;

    if (signed) {
        const keyMeta = await getKeyMeta ();
        const keyEmail = keyMeta?.userIDs?.[0]?.match (/<(.+?)>/)?.[1] || "";
        committerEmail = keyEmail || settings.committer_email || "noreply@github.com";
        authorEmail = settings.committer_email || committerEmail;
    }
    else {
        committerEmail = settings.committer_email || "noreply@github.com";
        authorEmail = committerEmail;
    }

    let commitSha;

    if (signed) {
        const payload = buildCommitPayload ({
            treeSha,
            parentSha: head.sha,
            authorName,
            authorEmail,
            committerName,
            committerEmail,
            message: commitMsg,
            timestamp: unixTimestamp,
        });

        const signResult = await signCommitPayload (payload);
        if (!signResult.ok) {
            throw {type: "gpg_failed", message: signResult.error};
        }

        commitSha = await createSignedCommit ({
            treeSha,
            parentSha: head.sha,
            message: commitMsg,
            signature: signResult.signature,
            authorName,
            authorEmail,
            committerName,
            committerEmail,
            date: isoDate,
        });
    }
    else {
        commitSha = await createUnsignedCommit ({
            treeSha,
            parentSha: head.sha,
            message: commitMsg,
            authorName,
            authorEmail,
            committerName,
            committerEmail,
            date: isoDate,
        });
    }

    await updateRef (commitSha);

    // Invalidate cache for all touched paths
    for (const op of fileOps) {
        await invalidatePath (op.path);
    }
    await invalidatePath (REPO_INDEX_PATH);

    // Detailed per-file breakdown so the UI can show progress feedback
    // (e.g. "Pushed 8 games to 2 files: game_info_003.json +5, game_info_004.json +3")
    const files = fileOps.map ((op) => ({
        name: op.path.split ("/").pop (),
        added: op.entries.length,
        isNew: op.isNew,
    }));

    return {ok: true, commitSha, signed, targetPath: REPO_INDEX_PATH, files};
}

// ════════════════════════════════════════════════════════════
// Push: url_only (single file via Contents API — unchanged)
// ════════════════════════════════════════════════════════════

async function executeUrlOnlyUnsignedPush (entries, settings) {
    const targetPath = REPO_TEMP_PATH;
    const newEntries = entries.map ((e) => e.url);
    const commitMsg = buildCommitMessage (entries.length, settings.commit_prefix || "ext:", "url_only");

    let existingContent = "";
    let existingSha = null;

    try {
        const file = await getFileContent (targetPath, {useCache: false, allowMissing: true});
        if (file) {
            existingContent = file.content;
            existingSha = file.sha;
        }
    }
    catch (err) {
        if (err.type === "auth") throw err;
        await logWarn ("push", `Could not fetch ${targetPath}: ${err.message}. Will create new.`);
    }

    const merged = mergeJsonArray (existingContent, newEntries);
    const result = await putFileContent (targetPath, merged, existingSha, commitMsg);

    return {ok: true, commitSha: result.commitSha, targetPath};
}

async function executeUrlOnlySignedPush (entries, settings) {
    const targetPath = REPO_TEMP_PATH;
    const newEntries = entries.map ((e) => e.url);
    const commitMsg = buildCommitMessage (entries.length, settings.commit_prefix || "ext:", "url_only");

    const keyMeta = await getKeyMeta ();
    const keyEmail = keyMeta?.userIDs?.[0]?.match (/<(.+?)>/)?.[1] || "";

    const committerName = settings.committer_name || "itch-f2p-ext";
    const committerEmail = keyEmail || settings.committer_email || "noreply@github.com";
    const authorName = "itch-f2p-ext[bot]";
    const authorEmail = settings.committer_email || committerEmail;

    let existingContent = "";
    try {
        const file = await getFileContent (targetPath, {useCache: false, allowMissing: true});
        if (file) existingContent = file.content;
    }
    catch (err) {
        if (err.type === "auth") throw err;
        await logWarn ("push", `Could not fetch ${targetPath}: ${err.message}`);
    }

    const merged = mergeJsonArray (existingContent, newEntries);

    const head = await getHeadCommit ();
    const blobSha = await createBlob (merged);
    const treeSha = await createTree (head.treeSha, targetPath, blobSha);

    const now = new Date ();
    const unixTimestamp = Math.floor (now.getTime () / 1000);
    const isoDate = new Date (unixTimestamp * 1000).toISOString ();

    const payload = buildCommitPayload ({
        treeSha,
        parentSha: head.sha,
        authorName,
        authorEmail,
        committerName,
        committerEmail,
        message: commitMsg,
        timestamp: unixTimestamp,
    });

    const signResult = await signCommitPayload (payload);
    if (!signResult.ok) {
        throw {type: "gpg_failed", message: signResult.error};
    }

    const commitSha = await createSignedCommit ({
        treeSha,
        parentSha: head.sha,
        message: commitMsg,
        signature: signResult.signature,
        authorName,
        authorEmail,
        committerName,
        committerEmail,
        date: isoDate,
    });

    await updateRef (commitSha);

    return {ok: true, commitSha, signed: true, targetPath};
}

// ════════════════════════════════════════════════════════════
// Dispatch
// ════════════════════════════════════════════════════════════

export async function executePush (entries, settings) {
    const format = settings.push_format || "url_only";

    if (format === "full_object") {
        const signed = settings.gpg_enabled && await isSigningAvailable ();
        return executeFullObjectPush (entries, settings, signed);
    }

    // url_only
    if (settings.gpg_enabled && await isSigningAvailable ()) {
        return executeUrlOnlySignedPush (entries, settings);
    }
    return executeUrlOnlyUnsignedPush (entries, settings);
}
