#!/usr/bin/env node
/**
 * Find orphaned artifacts in MongoDB that are not referenced by any
 * project revision, published game, audio job, or mesh job.
 *
 * Checks:
 *  1. project_artifacts whose projectId points to a deleted project
 *  2. project_artifacts whose revisionId points to a deleted revision
 *  3. project_artifacts not referenced by ANY revision, published game, audio job, or mesh job
 *  4. GridFS files in artifacts.files with no matching project_artifacts doc
 *  5. generated_audio_jobs referencing missing artifacts
 *  6. generated_mesh_jobs referencing missing artifacts
 *
 * Usage:
 *   node scripts/audit-artifacts.mjs              # audit only (dry run)
 *   node scripts/audit-artifacts.mjs --cleanup    # delete orphaned artifacts + GridFS data
 */

import { MongoClient, ObjectId, GridFSBucket } from "mongodb";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const envFile = readFileSync(resolve(__dirname, "../.env"), "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

const MONGODB_URI = process.env.MONGODB_URI_DIRECT || process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Set MONGODB_URI or MONGODB_URI_DIRECT in .env");
  process.exit(1);
}

const DB_NAME = "gameforge";
const CLEANUP = process.argv.includes("--cleanup");
const BATCH_SIZE = 50;

function oid(v) {
  return typeof v === "string" ? v : v?.toHexString?.() ?? String(v);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
  });

  try {
    await client.connect();
    console.log("Connected to MongoDB\n");
    const db = client.db(DB_NAME);

    // ── Load all data ──
    console.log("Loading collections...");

    const [artifacts, revisions, publishedGames, projects, audioJobs, meshJobs, gridfsFiles] =
      await Promise.all([
        db.collection("project_artifacts").find({}).toArray(),
        db.collection("project_revisions").find({}).toArray(),
        db.collection("published_games").find({}).toArray(),
        db.collection("projects").find({}).toArray(),
        db.collection("generated_audio_jobs").find({}).toArray(),
        db.collection("generated_mesh_jobs").find({}).toArray(),
        db.collection("artifacts.files").find({}).toArray(),
      ]);

    console.log(`  project_artifacts:    ${artifacts.length}`);
    console.log(`  project_revisions:    ${revisions.length}`);
    console.log(`  published_games:      ${publishedGames.length}`);
    console.log(`  projects:             ${projects.length}`);
    console.log(`  generated_audio_jobs: ${audioJobs.length}`);
    console.log(`  generated_mesh_jobs:  ${meshJobs.length}`);
    console.log(`  artifacts.files:      ${gridfsFiles.length}`);

    // ── Build reference sets ──
    // All artifact IDs that are actively referenced somewhere
    const referencedArtifactIds = new Set();

    // All project/revision IDs that exist
    const existingProjectIds = new Set(projects.map((p) => oid(p._id)));
    const existingRevisionIds = new Set(revisions.map((r) => oid(r._id)));

    // 1. Collect artifact refs from revisions (compiledHtml + chatTranscript)
    for (const rev of revisions) {
      if (rev.compiledHtml?.storage === "gridfs" && rev.compiledHtml.artifactId) {
        referencedArtifactIds.add(String(rev.compiledHtml.artifactId));
      }
      if (rev.chatTranscript?.storage === "gridfs" && rev.chatTranscript.artifactId) {
        referencedArtifactIds.add(String(rev.chatTranscript.artifactId));
      }
    }

    // 2. Collect artifact refs from published games (compiledHtml)
    for (const game of publishedGames) {
      if (game.compiledHtml?.storage === "gridfs" && game.compiledHtml.artifactId) {
        referencedArtifactIds.add(String(game.compiledHtml.artifactId));
      }
    }

    // 3. Collect artifact refs from audio jobs
    for (const job of audioJobs) {
      if (job.artifactId) {
        referencedArtifactIds.add(String(job.artifactId));
      }
    }

    // 4. Collect artifact refs from mesh jobs
    for (const job of meshJobs) {
      if (job.artifactId) {
        referencedArtifactIds.add(String(job.artifactId));
      }
      if (job.thumbnailArtifactId) {
        referencedArtifactIds.add(String(job.thumbnailArtifactId));
      }
    }

    // 5. Scan all revision HTML for /api/images/{id} and /api/sound-files/{id} references
    for (const rev of revisions) {
      // Check inline compiledHtml
      const html = rev.compiledHtml?.inlineText ?? "";
      if (html) {
        const imageRefs = [...html.matchAll(/\/api\/images\/([a-f0-9-]+)/g)];
        for (const m of imageRefs) referencedArtifactIds.add(m[1]);
        const soundRefs = [...html.matchAll(/\/api\/sound-files\/([a-f0-9]+)/g)];
        for (const m of soundRefs) referencedArtifactIds.add(m[1]);
      }
      // Check audio track dataUrl references
      for (const track of rev.audioTracks ?? []) {
        const match = track.dataUrl?.match?.(/\/api\/sound-files\/([a-f0-9]+)$/);
        if (match) referencedArtifactIds.add(match[1]);
      }
    }

    // 6. Scan published game HTML for image/sound refs (for gridfs-stored HTML, check artifact ref)
    for (const game of publishedGames) {
      const html = game.compiledHtml?.inlineText ?? "";
      if (html) {
        const imageRefs = [...html.matchAll(/\/api\/images\/([a-f0-9-]+)/g)];
        for (const m of imageRefs) referencedArtifactIds.add(m[1]);
        const soundRefs = [...html.matchAll(/\/api\/sound-files\/([a-f0-9]+)/g)];
        for (const m of soundRefs) referencedArtifactIds.add(m[1]);
      }
    }

    console.log(`\nTotal referenced artifact IDs: ${referencedArtifactIds.size}`);

    // ── Analysis ──
    const orphanedArtifacts = [];        // artifacts with no references
    const deadProjectRefs = [];          // artifacts pointing to non-existent projects
    const deadRevisionRefs = [];         // artifacts pointing to non-existent revisions
    const orphanedGridfsFiles = [];      // gridfs files with no artifact doc

    // Existing artifact IDs for GridFS cross-check
    const existingArtifactIds = new Set(artifacts.map((a) => oid(a._id)));

    // Check each artifact
    for (const artifact of artifacts) {
      const aid = oid(artifact._id);
      const issues = [];

      // Check if referenced anywhere
      if (!referencedArtifactIds.has(aid)) {
        issues.push("NOT REFERENCED by any revision, game, audio job, or mesh job");
        orphanedArtifacts.push({ artifact, issues });
      }

      // Check project reference
      if (artifact.projectId && !existingProjectIds.has(oid(artifact.projectId))) {
        deadProjectRefs.push(artifact);
        issues.push(`projectId ${oid(artifact.projectId)} does not exist`);
      }

      // Check revision reference
      if (artifact.revisionId && !existingRevisionIds.has(oid(artifact.revisionId))) {
        deadRevisionRefs.push(artifact);
        issues.push(`revisionId ${oid(artifact.revisionId)} does not exist`);
      }

      if (issues.length > 0 && !orphanedArtifacts.find((o) => oid(o.artifact._id) === aid)) {
        orphanedArtifacts.push({ artifact, issues });
      } else if (issues.length > 0) {
        // Merge issues
        const existing = orphanedArtifacts.find((o) => oid(o.artifact._id) === aid);
        if (existing) {
          for (const i of issues) {
            if (!existing.issues.includes(i)) existing.issues.push(i);
          }
        }
      }
    }

    // Check GridFS files for orphans
    for (const gf of gridfsFiles) {
      const gfId = oid(gf._id);
      if (!existingArtifactIds.has(gfId)) {
        orphanedGridfsFiles.push(gf);
      }
    }

    // Check audio/mesh jobs for broken artifact refs
    const brokenAudioRefs = [];
    for (const job of audioJobs) {
      if (job.artifactId && !existingArtifactIds.has(String(job.artifactId))) {
        brokenAudioRefs.push(job);
      }
    }

    const brokenMeshRefs = [];
    for (const job of meshJobs) {
      if (job.artifactId && !existingArtifactIds.has(String(job.artifactId))) {
        brokenMeshRefs.push({ job, field: "artifactId" });
      }
      if (job.thumbnailArtifactId && !existingArtifactIds.has(String(job.thumbnailArtifactId))) {
        brokenMeshRefs.push({ job, field: "thumbnailArtifactId" });
      }
    }

    // ── Report ──
    let totalOrphanBytes = 0;

    console.log("\n" + "=".repeat(80));
    console.log(`ORPHANED ARTIFACTS: ${orphanedArtifacts.length} / ${artifacts.length} total`);
    console.log("=".repeat(80));

    if (orphanedArtifacts.length === 0) {
      console.log("  (none)");
    } else {
      // Group by kind
      const byKind = {};
      for (const { artifact, issues } of orphanedArtifacts) {
        const kind = artifact.kind || "unknown";
        if (!byKind[kind]) byKind[kind] = [];
        byKind[kind].push({ artifact, issues });
      }

      for (const [kind, items] of Object.entries(byKind)) {
        const kindBytes = items.reduce((sum, i) => sum + (i.artifact.byteLength || 0), 0);
        totalOrphanBytes += kindBytes;
        console.log(`\n  [${kind}] — ${items.length} orphaned (${formatBytes(kindBytes)})`);
        for (const { artifact, issues } of items) {
          console.log(`    ${oid(artifact._id)}  ${formatBytes(artifact.byteLength || 0).padStart(10)}  created=${artifact.createdAt?.toISOString?.() ?? "?"}`);
          console.log(`      project=${artifact.projectId ? oid(artifact.projectId) : "null"}  revision=${artifact.revisionId ? oid(artifact.revisionId) : "null"}`);
          for (const issue of issues) {
            console.log(`      -> ${issue}`);
          }
        }
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log(`ORPHANED GRIDFS FILES: ${orphanedGridfsFiles.length} / ${gridfsFiles.length} total`);
    console.log("=".repeat(80));

    if (orphanedGridfsFiles.length === 0) {
      console.log("  (none)");
    } else {
      let gridfsOrphanBytes = 0;
      for (const gf of orphanedGridfsFiles) {
        gridfsOrphanBytes += gf.length || 0;
        console.log(`    ${oid(gf._id)}  ${formatBytes(gf.length || 0).padStart(10)}  filename="${gf.filename}"  uploaded=${gf.uploadDate?.toISOString?.() ?? "?"}`);
      }
      totalOrphanBytes += gridfsOrphanBytes;
      console.log(`  Total orphaned GridFS: ${formatBytes(gridfsOrphanBytes)}`);
    }

    console.log("\n" + "=".repeat(80));
    console.log(`BROKEN AUDIO JOB REFS: ${brokenAudioRefs.length}`);
    console.log("=".repeat(80));
    if (brokenAudioRefs.length === 0) {
      console.log("  (none)");
    } else {
      for (const job of brokenAudioRefs) {
        console.log(`    ${job._id}  name="${job.name}"  artifactId=${job.artifactId}  status=${job.status}`);
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log(`BROKEN MESH JOB REFS: ${brokenMeshRefs.length}`);
    console.log("=".repeat(80));
    if (brokenMeshRefs.length === 0) {
      console.log("  (none)");
    } else {
      for (const { job, field } of brokenMeshRefs) {
        console.log(`    ${job._id}  name="${job.name}"  ${field}=${job[field]}  status=${job.status}`);
      }
    }

    // ── Summary ──
    console.log("\n" + "=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`  Orphaned artifacts (no references):  ${orphanedArtifacts.length}`);
    console.log(`  Dead project refs on artifacts:       ${deadProjectRefs.length}`);
    console.log(`  Dead revision refs on artifacts:      ${deadRevisionRefs.length}`);
    console.log(`  Orphaned GridFS files:                ${orphanedGridfsFiles.length}`);
    console.log(`  Broken audio job artifact refs:       ${brokenAudioRefs.length}`);
    console.log(`  Broken mesh job artifact refs:        ${brokenMeshRefs.length}`);
    console.log(`  Total reclaimable space:              ${formatBytes(totalOrphanBytes)}`);
    console.log("=".repeat(80));

    // ── Cleanup ──
    if (!CLEANUP) {
      console.log("\nDry run complete. Re-run with --cleanup to delete orphaned artifacts.");
    } else if (orphanedArtifacts.length === 0 && orphanedGridfsFiles.length === 0) {
      console.log("\nNothing to clean up.");
    } else {
      console.log("\n" + "=".repeat(80));
      console.log("CLEANUP — deleting orphaned artifacts and GridFS data");
      console.log("=".repeat(80));

      const bucket = new GridFSBucket(db, { bucketName: "artifacts" });
      const artifactsColl = db.collection("project_artifacts");

      // 1. Delete orphaned project_artifacts + their GridFS files
      const orphanIds = orphanedArtifacts.map((o) => o.artifact._id);
      let deletedArtifacts = 0;
      let deletedGridfs = 0;
      let failedGridfs = 0;

      for (let i = 0; i < orphanIds.length; i += BATCH_SIZE) {
        const batch = orphanIds.slice(i, i + BATCH_SIZE);

        // Delete GridFS files for this batch (each artifact uses _id as gridFsFileId)
        for (const artifactId of batch) {
          try {
            await bucket.delete(artifactId);
            deletedGridfs++;
          } catch (err) {
            // GridFS file may already be missing
            if (!err.message?.includes("not found")) {
              failedGridfs++;
              console.error(`    GridFS delete failed for ${oid(artifactId)}: ${err.message}`);
            } else {
              deletedGridfs++; // count as "cleaned" if already gone
            }
          }
        }

        // Delete the artifact docs
        const result = await artifactsColl.deleteMany({ _id: { $in: batch } });
        deletedArtifacts += result.deletedCount;

        const progress = Math.min(i + BATCH_SIZE, orphanIds.length);
        process.stdout.write(`\r  Artifacts: ${progress}/${orphanIds.length} processed`);
      }

      console.log(""); // newline after progress

      // 2. Delete orphaned GridFS files (no matching artifact doc)
      let deletedOrphanGridfs = 0;
      for (const gf of orphanedGridfsFiles) {
        try {
          await bucket.delete(gf._id);
          deletedOrphanGridfs++;
        } catch (err) {
          if (!err.message?.includes("not found")) {
            console.error(`    Orphan GridFS delete failed for ${oid(gf._id)}: ${err.message}`);
          }
        }
      }

      console.log("\n" + "=".repeat(80));
      console.log("CLEANUP RESULTS");
      console.log("=".repeat(80));
      console.log(`  Artifact docs deleted:         ${deletedArtifacts}`);
      console.log(`  GridFS files deleted:          ${deletedGridfs}`);
      console.log(`  Orphan GridFS files deleted:   ${deletedOrphanGridfs}`);
      if (failedGridfs > 0) {
        console.log(`  GridFS delete failures:        ${failedGridfs}`);
      }
      console.log(`  Space reclaimed:               ~${formatBytes(totalOrphanBytes)}`);
      console.log("=".repeat(80));
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
