/** Shape of the `index.json` written by the indexer and read by the extension. */
import type { Features } from "./features.js";

export const INDEX_FILENAME = "index.json";

export interface IndexEntry {
  /** Absolute path to the sample on disk (used by importIntoProject host-side). */
  path: string;
  /** File name without directory. */
  name: string;
  /** Immediate parent folder name (for the same-folder heuristic boost). */
  folder: string;
  /** Lowercase filename tokens (for the name-overlap heuristic boost). */
  tokens: string[];
  /** Full decoded duration in seconds — used to compute placement length in beats. */
  durationSec: number;
  /** Acoustic fingerprint. */
  features: Features;
}

export interface SampleIndex {
  /** Feature-layout version; must match FEATURE_VERSION or the index should be rebuilt. */
  featureVersion: number;
  /** The root folder that was indexed. */
  root: string;
  /** Number of entries (convenience). */
  count: number;
  entries: IndexEntry[];
}
