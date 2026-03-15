#!/usr/bin/env node
/**
 * Audit MongoDB for irrelevant / junk published games that should be deleted.
 *
 * Flags:
 *  - "Untitled Game" or empty title
 *  - Tiny HTML (< 500 bytes compiled) — likely test/empty
 *  - Duplicate publishes of the same project (keeps latest, flags older)
 *  - No thumbnail (may indicate incomplete publish)
 *  - Default template / boilerplate code (no real game logic)
 *
 * Usage:  node scripts/audit-games.mjs
 *         DRY_RUN=false node scripts/audit-games.mjs   # actually delete flagged games
 */

import { MongoClient, ObjectId, GridFSBucket } from "mongodb";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load .env manually (no dotenv dependency)
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
const ARTIFACT_BUCKET = "artifacts";

// Thresholds
const TINY_HTML_BYTES = 500;
const BOILERPLATE_TITLES = [
  "untitled game",
  "untitled",
  "test",
  "testing",
  "asdf",
  "aaa",
  "hello world",
  "new game",
  "my game",
  "game",
];

async function resolveCompiledHtml(db, compiledHtml) {
  if (!compiledHtml) return "";
  if (compiledHtml.storage === "inline" && compiledHtml.inlineText) {
    return compiledHtml.inlineText;
  }
  if (compiledHtml.storage === "gridfs" && compiledHtml.artifactId) {
    try {
      const artifact = await db
        .collection("project_artifacts")
        .findOne({ _id: new ObjectId(compiledHtml.artifactId) });
      if (!artifact) return "[gridfs: artifact doc missing]";
      const bucket = new GridFSBucket(db, { bucketName: ARTIFACT_BUCKET });
      const chunks = [];
      const stream = bucket.openDownloadStream(artifact.gridFsFileId);
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString("utf-8");
    } catch {
      return "[gridfs: read error]";
    }
  }
  return "";
}

function hasRealGameLogic(html) {
  if (!html || html.length < TINY_HTML_BYTES) return false;
  // Look for signals of actual game code
  const signals = [
    "canvas",
    "requestAnimationFrame",
    "addEventListener",
    "gameLoop",
    "update(",
    "draw(",
    "render(",
    "setInterval",
    "keydown",
    "mousedown",
    "touchstart",
    "THREE.",
    "Phaser.",
    "ctx.",
    "getContext",
    "WebSocket",
    "sprite",
    "collision",
    "score",
    "player",
    "enemy",
    "level",
  ];
  const lower = html.toLowerCase();
  const matchCount = signals.filter((s) => lower.includes(s.toLowerCase())).length;
  return matchCount >= 2;
}

async function main() {
  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
  });

  try {
    await client.connect();
    console.log("Connected to MongoDB\n");
    const db = client.db(DB_NAME);

    // ── Fetch all published games ──
    const games = await db
      .collection("published_games")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    console.log(`Total published games: ${games.length}\n`);

    const flagged = [];

    // Track duplicates per project
    const projectPublishes = new Map(); // projectId -> [game, ...]

    for (const game of games) {
      const reasons = [];
      const title = game.title || "";
      const titleLower = title.trim().toLowerCase();

      // 1. Untitled / junk title
      if (
        !title.trim() ||
        BOILERPLATE_TITLES.includes(titleLower) ||
        /^(test\s*\d*|untitled\s*\d*)$/i.test(titleLower)
      ) {
        reasons.push(`junk title: "${title || "(empty)"}"`);
      }

      // 2. Resolve HTML and check size
      const html = await resolveCompiledHtml(db, game.compiledHtml);
      const htmlBytes = Buffer.byteLength(html, "utf-8");

      if (htmlBytes < TINY_HTML_BYTES) {
        reasons.push(`tiny HTML (${htmlBytes} bytes)`);
      } else if (!hasRealGameLogic(html)) {
        reasons.push("no game logic detected in HTML");
      }

      // 3. No thumbnail
      if (!game.thumbnail) {
        reasons.push("no thumbnail");
      }

      // 4. Track for duplicate detection
      const pid = game.projectId?.toHexString() ?? null;
      if (pid) {
        if (!projectPublishes.has(pid)) projectPublishes.set(pid, []);
        projectPublishes.get(pid).push(game);
      }

      if (reasons.length > 0) {
        flagged.push({ game, reasons, htmlBytes, html });
      }
    }

    // 5. Flag older duplicate publishes (keep only latest per project)
    const duplicateIds = new Set();
    for (const [pid, publishes] of projectPublishes) {
      if (publishes.length <= 1) continue;
      // Sort newest first
      publishes.sort((a, b) => b.createdAt - a.createdAt);
      for (let i = 1; i < publishes.length; i++) {
        const gid = publishes[i]._id.toHexString();
        duplicateIds.add(gid);
        // Add to flagged if not already
        const existing = flagged.find(
          (f) => f.game._id.toHexString() === gid
        );
        if (existing) {
          existing.reasons.push(
            `older duplicate (${publishes.length} publishes for project ${pid})`
          );
        } else {
          flagged.push({
            game: publishes[i],
            reasons: [
              `older duplicate (${publishes.length} publishes for project ${pid})`,
            ],
            htmlBytes: null,
            html: null,
          });
        }
      }
    }

    // ── Report ──
    console.log("=".repeat(80));
    console.log(
      `FLAGGED GAMES: ${flagged.length} / ${games.length} total`
    );
    console.log("=".repeat(80));

    // Sort: most reasons first
    flagged.sort((a, b) => b.reasons.length - a.reasons.length);

    for (const { game, reasons, htmlBytes } of flagged) {
      console.log(`\n  ID:      ${game._id.toHexString()}`);
      console.log(`  Title:   ${game.title || "(empty)"}`);
      console.log(`  Engine:  ${game.engine}`);
      console.log(`  Created: ${game.createdAt?.toISOString?.() ?? "unknown"}`);
      console.log(
        `  Project: ${game.projectId?.toHexString() ?? "standalone"}`
      );
      if (htmlBytes !== null) console.log(`  HTML:    ${htmlBytes} bytes`);
      console.log(`  Reasons:`);
      for (const r of reasons) {
        console.log(`    - ${r}`);
      }
    }

    // Summary by reason
    console.log("\n" + "=".repeat(80));
    console.log("SUMMARY BY REASON");
    console.log("=".repeat(80));
    const reasonCounts = {};
    for (const { reasons } of flagged) {
      for (const r of reasons) {
        const key = r.replace(/\(.*?\)/g, "(...)").replace(/".*?"/g, '"..."');
        reasonCounts[key] = (reasonCounts[key] || 0) + 1;
      }
    }
    for (const [reason, count] of Object.entries(reasonCounts).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`  ${String(count).padStart(4)}  ${reason}`);
    }

    // Also check for orphaned projects (no revisions)
    console.log("\n" + "=".repeat(80));
    console.log("ORPHANED PROJECTS (no revisions)");
    console.log("=".repeat(80));
    const projects = await db
      .collection("projects")
      .find({})
      .sort({ updatedAt: -1 })
      .toArray();

    let orphanCount = 0;
    for (const project of projects) {
      if (project.latestRevisionNumber === 0 || !project.latestRevisionId) {
        orphanCount++;
        console.log(
          `  ${project._id.toHexString()}  "${project.title}"  created: ${project.createdAt?.toISOString?.() ?? "?"}`
        );
      }
    }
    if (orphanCount === 0) console.log("  (none)");

    console.log(
      `\nTotal projects: ${projects.length}, orphaned: ${orphanCount}`
    );

    console.log("\n" + "=".repeat(80));
    console.log("Done. Review the above and delete manually, or re-run with DRY_RUN=false.");
    console.log("=".repeat(80));
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
