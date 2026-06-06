/**
 * Standalone library indexer — runs as a normal Node process (NOT the sandboxed
 * extension), so it has full filesystem access to crawl the folder you point at.
 *
 * Usage:
 *   npm run index -- "<sampleFolder>" ["<outputDir>"]
 *       Crawl <sampleFolder>, write index.json into <outputDir> (default: cwd).
 *       Point <outputDir> at the extension's storage directory (printed by the
 *       extension on launch) so the extension can read it.
 *
 *   npm run index -- --nn "<index.json>" "<sampleFile>"
 *       Verification helper: print the 3 nearest neighbours of <sampleFile>
 *       against an existing index.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import decodeAudio from "audio-decode";

import { computeFeatures, FEATURE_VERSION, matchScore, tokenize, type Features } from "./features.js";
import { INDEX_FILENAME, type IndexEntry, type SampleIndex } from "./index-format.js";

const AUDIO_EXTS = new Set([".wav", ".aif", ".aiff", ".flac", ".mp3", ".ogg", ".m4a"]);

async function* walk(dir: string): AsyncGenerator<string> {
  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    console.warn(`  ! cannot read ${dir}: ${(e as Error).message}`);
    return;
  }
  for (const d of dirents) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) {
      yield* walk(full);
    } else if (d.isFile() && AUDIO_EXTS.has(path.extname(d.name).toLowerCase())) {
      yield full;
    }
  }
}

interface Analysis {
  features: Features;
  durationSec: number;
}

async function analyseFile(file: string): Promise<Analysis | null> {
  try {
    const buf = await fs.readFile(file);
    const decoded = await decodeAudio(buf);
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
      decoded.getChannelData(i),
    );
    return {
      features: computeFeatures(channels, decoded.sampleRate),
      durationSec: decoded.duration,
    };
  } catch (e) {
    console.warn(`  ! skip ${path.basename(file)}: ${(e as Error).message}`);
    return null;
  }
}

function entryFor(file: string, analysis: Analysis): IndexEntry {
  const name = path.basename(file);
  return {
    path: path.resolve(file),
    name,
    folder: path.basename(path.dirname(file)),
    tokens: tokenize(name),
    durationSec: analysis.durationSec,
    features: analysis.features,
  };
}

async function buildIndex(folder: string, outputDir: string): Promise<void> {
  const root = path.resolve(folder);
  const stat = await fs.stat(root).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    console.error(`Not a folder: ${root}`);
    process.exit(1);
  }

  console.log(`Indexing ${root} …`);
  const entries: IndexEntry[] = [];
  let scanned = 0;
  for await (const file of walk(root)) {
    scanned++;
    const analysis = await analyseFile(file);
    if (analysis) entries.push(entryFor(file, analysis));
    if (scanned % 25 === 0) console.log(`  …${scanned} files scanned, ${entries.length} indexed`);
  }

  const index: SampleIndex = {
    featureVersion: FEATURE_VERSION,
    root,
    count: entries.length,
    entries,
  };

  await fs.mkdir(outputDir, { recursive: true });
  const outPath = path.join(outputDir, INDEX_FILENAME);
  await fs.writeFile(outPath, JSON.stringify(index));
  console.log(`\nDone: ${entries.length} samples indexed (${scanned} scanned).`);
  console.log(`Wrote ${outPath}`);
  console.log(
    `\nIf this isn't the extension's storage directory, copy index.json there ` +
      `(the extension prints its storage path on launch).`,
  );
}

async function nearestNeighbours(indexPath: string, sampleFile: string): Promise<void> {
  const index = JSON.parse(await fs.readFile(indexPath, "utf-8")) as SampleIndex;
  const analysis = await analyseFile(sampleFile);
  if (!analysis) {
    console.error("Could not decode the query sample.");
    process.exit(1);
  }
  const features = analysis.features;
  const srcTokens = tokenize(path.basename(sampleFile));
  const srcFolder = path.basename(path.dirname(sampleFile));
  const srcResolved = path.resolve(sampleFile);

  const ranked = index.entries
    .filter((e) => e.path !== srcResolved)
    .map((e) => ({
      e,
      score: matchScore(features, srcTokens, srcFolder, e.features, e.tokens, e.folder),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  console.log(`\n3 nearest to ${path.basename(sampleFile)}:`);
  for (const { e, score } of ranked) {
    console.log(`  ${score.toFixed(3)}  ${e.name}  (${e.folder})`);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === "--nn") {
    if (!argv[1] || !argv[2]) {
      console.error('Usage: npm run index -- --nn "<index.json>" "<sampleFile>"');
      process.exit(1);
    }
    await nearestNeighbours(argv[1], argv[2]);
    return;
  }
  if (!argv[0]) {
    console.error('Usage: npm run index -- "<sampleFolder>" ["<outputDir>"]');
    process.exit(1);
  }
  await buildIndex(argv[0], argv[1] ?? process.cwd());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
