/**
 * Shared, pure audio-feature extraction + similarity scoring.
 *
 * This module is imported by BOTH sides of the extension:
 *   - `indexer.ts` (standalone Node CLI) computes features for every library sample.
 *   - `extension.ts` (sandboxed Live extension) computes features for the clicked clip.
 *
 * Because both sides run the exact same code on PCM data, their feature vectors are
 * directly comparable. Keep this file free of any filesystem / SDK / sandbox-sensitive
 * imports — it only does math on decoded channel data.
 */

/** Bump when the feature layout changes so a stale index can be detected/rebuilt. */
export const FEATURE_VERSION = 1;

/** A compact acoustic fingerprint of a one-shot sample. All fields are plain numbers. */
export interface Features {
  /** Spectral centroid in Hz — perceived "brightness". */
  centroid: number;
  /** Frequency below which 85% of spectral energy lies, in Hz. */
  rolloff: number;
  /** Estimated fundamental (dominant low-frequency partial) in Hz — kick "tuning". */
  fundamental: number;
  /** Zero crossings as a fraction of total samples (0..1) — noisiness/pitch proxy. */
  zcr: number;
  /** Time from the amplitude peak to -20 dB, in seconds — punch/decay. */
  decay: number;
  /** Effective sounding length (5%..95% cumulative energy), in seconds. */
  length: number;
  /** Fraction of spectral energy above 2 kHz (0..1) — body vs. click balance. */
  highRatio: number;
}

const ZERO_FEATURES: Features = {
  centroid: 0,
  rolloff: 0,
  fundamental: 0,
  zcr: 0,
  decay: 0,
  length: 0,
  highRatio: 0,
};

/** Mix an arbitrary number of channels down to a single mono Float64Array. */
function toMono(channels: Float32Array[]): Float64Array {
  if (channels.length === 0) return new Float64Array(0);
  const len = channels[0]!.length;
  const out = new Float64Array(len);
  for (const ch of channels) {
    const n = Math.min(len, ch.length);
    for (let i = 0; i < n; i++) out[i] = out[i]! + ch[i]!;
  }
  const inv = 1 / channels.length;
  for (let i = 0; i < len; i++) out[i]! *= inv;
  return out;
}

/** In-place iterative radix-2 Cooley–Tukey FFT. `re`/`im` length must be a power of two. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!; re[i] = re[j]!; re[j] = tr;
      const ti = im[i]!; im[i] = im[j]!; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cwr = 1;
      let cwi = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const vr = re[b]! * cwr - im[b]! * cwi;
        const vi = re[b]! * cwi + im[b]! * cwr;
        re[b] = re[a]! - vr;
        im[b] = im[a]! - vi;
        re[a] = re[a]! + vr;
        im[a] = im[a]! + vi;
        const ncwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = ncwr;
      }
    }
  }
}

const FFT_SIZE = 4096;

/** Accumulate a Hann-windowed magnitude spectrum over the loud portion of the signal. */
function magnitudeSpectrum(mono: Float64Array, sampleRate: number): Float64Array {
  const half = FFT_SIZE >> 1;
  const mag = new Float64Array(half);

  // Find the onset: first sample above a small threshold, so we analyse the body, not leading silence.
  let onset = 0;
  for (let i = 0; i < mono.length; i++) {
    if (Math.abs(mono[i]!) > 0.02) { onset = i; break; }
  }

  // Up to 4 overlapping frames from the onset cover the transient + early decay of a one-shot.
  const hop = FFT_SIZE >> 1;
  let frames = 0;
  for (let f = 0; f < 4; f++) {
    const start = onset + f * hop;
    if (start + FFT_SIZE > mono.length && f > 0) break;

    const re = new Float64Array(FFT_SIZE);
    const im = new Float64Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) {
      const s = start + i < mono.length ? mono[start + i]! : 0;
      // Hann window.
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
      re[i] = s * w;
    }
    fft(re, im);
    for (let k = 0; k < half; k++) {
      mag[k]! += Math.hypot(re[k]!, im[k]!);
    }
    frames++;
  }

  if (frames > 1) {
    for (let k = 0; k < half; k++) mag[k]! /= frames;
  }
  return mag;
}

/** Compute a {@link Features} fingerprint from decoded PCM channel data. */
export function computeFeatures(channels: Float32Array[], sampleRate: number): Features {
  const mono = toMono(channels);
  const n = mono.length;
  if (n === 0 || sampleRate <= 0) return { ...ZERO_FEATURES };

  // --- Peak-normalise so loudness doesn't dominate similarity. ---
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(mono[i]!);
    if (a > peak) peak = a;
  }
  if (peak > 0) {
    const inv = 1 / peak;
    for (let i = 0; i < n; i++) mono[i]! *= inv;
  }

  // --- Zero-crossing rate (fraction of samples). ---
  let crossings = 0;
  for (let i = 1; i < n; i++) {
    if ((mono[i]! >= 0) !== (mono[i - 1]! >= 0)) crossings++;
  }
  const zcr = crossings / n;

  // --- Amplitude envelope via short windowed RMS, for decay + effective length. ---
  const win = Math.max(1, Math.floor(sampleRate * 0.005)); // 5 ms windows
  const env: number[] = [];
  for (let i = 0; i < n; i += win) {
    const end = Math.min(i + win, n);
    let sumSq = 0;
    for (let j = i; j < end; j++) sumSq += mono[j]! * mono[j]!;
    env.push(Math.sqrt(sumSq / (end - i)));
  }
  let envPeak = 0;
  let envPeakIdx = 0;
  for (let i = 0; i < env.length; i++) {
    if (env[i]! > envPeak) { envPeak = env[i]!; envPeakIdx = i; }
  }
  // Decay: peak -> -20 dB (0.1 of peak).
  let decay = 0;
  if (envPeak > 0) {
    const target = envPeak * 0.1;
    let idx = env.length - 1;
    for (let i = envPeakIdx; i < env.length; i++) {
      if (env[i]! <= target) { idx = i; break; }
    }
    decay = ((idx - envPeakIdx) * win) / sampleRate;
  }
  // Effective length: span between 5% and 95% of cumulative energy.
  let totalE = 0;
  for (let i = 0; i < env.length; i++) totalE += env[i]! * env[i]!;
  let length = n / sampleRate;
  if (totalE > 0) {
    let cum = 0;
    let lo = 0;
    let hi = env.length - 1;
    let setLo = false;
    for (let i = 0; i < env.length; i++) {
      cum += env[i]! * env[i]!;
      const frac = cum / totalE;
      if (!setLo && frac >= 0.05) { lo = i; setLo = true; }
      if (frac >= 0.95) { hi = i; break; }
    }
    length = Math.max(0, ((hi - lo) * win) / sampleRate);
  }

  // --- Spectral features. ---
  const mag = magnitudeSpectrum(mono, sampleRate);
  const half = mag.length;
  const binHz = sampleRate / FFT_SIZE;

  let energy = 0;
  let weighted = 0;
  let highEnergy = 0;
  for (let k = 1; k < half; k++) {
    const m = mag[k]!;
    const hz = k * binHz;
    energy += m;
    weighted += m * hz;
    if (hz > 2000) highEnergy += m;
  }
  const centroid = energy > 0 ? weighted / energy : 0;
  const highRatio = energy > 0 ? highEnergy / energy : 0;

  // Rolloff: lowest frequency below which 85% of energy lies.
  let rolloff = 0;
  if (energy > 0) {
    const cut = energy * 0.85;
    let cum = 0;
    for (let k = 1; k < half; k++) {
      cum += mag[k]!;
      if (cum >= cut) { rolloff = k * binHz; break; }
    }
  }

  // Fundamental: strongest bin in the 20–250 Hz band (kick body).
  let fundamental = 0;
  let fMag = 0;
  const loK = Math.max(1, Math.floor(20 / binHz));
  const hiK = Math.min(half - 1, Math.ceil(250 / binHz));
  for (let k = loK; k <= hiK; k++) {
    if (mag[k]! > fMag) { fMag = mag[k]!; fundamental = k * binHz; }
  }

  return { centroid, rolloff, fundamental, zcr, decay, length, highRatio };
}

const EPS = 1e-6;
const log2 = (x: number) => Math.log2(Math.max(x, EPS));

/**
 * Weighted acoustic distance between two fingerprints. Lower = more similar.
 * Frequency dimensions are compared in log space (octaves) so they're perceptually fair.
 */
export function audioDistance(a: Features, b: Features): number {
  const dCentroid = (log2(a.centroid) - log2(b.centroid)) * 0.9;
  const dRolloff = (log2(a.rolloff) - log2(b.rolloff)) * 0.6;
  const dFund = (log2(a.fundamental) - log2(b.fundamental)) * 1.3;
  const dZcr = (a.zcr - b.zcr) * 14;
  const dDecay = (a.decay - b.decay) * 1.1;
  const dLen = (log2(a.length + 0.01) - log2(b.length + 0.01)) * 0.4;
  const dHigh = (a.highRatio - b.highRatio) * 1.6;
  return Math.hypot(dCentroid, dRolloff, dFund, dZcr, dDecay, dLen, dHigh);
}

/** Lowercase alphanumeric tokens from a filename, for the heuristic boost. */
export function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/** Fraction of the source's tokens that also appear in the candidate (0..1). */
export function tokenOverlap(sourceTokens: string[], candidateTokens: string[]): number {
  if (sourceTokens.length === 0) return 0;
  const set = new Set(candidateTokens);
  let hits = 0;
  for (const t of sourceTokens) if (set.has(t)) hits++;
  return hits / sourceTokens.length;
}

/**
 * Final blended score: audio distance nudged down by name/folder agreement.
 * Audio similarity stays the dominant signal; the heuristic only breaks ties.
 */
export function matchScore(
  sourceFeatures: Features,
  sourceTokens: string[],
  sourceFolder: string,
  candidateFeatures: Features,
  candidateTokens: string[],
  candidateFolder: string,
): number {
  const audio = audioDistance(sourceFeatures, candidateFeatures);
  const overlap = tokenOverlap(sourceTokens, candidateTokens);
  const sameFolder = sourceFolder && sourceFolder === candidateFolder ? 1 : 0;
  return audio - 0.15 * overlap - 0.1 * sameFolder;
}

/** Controls how quickly the similarity label falls off with distance. Display-only; tune to taste. */
const SIMILARITY_DECAY = 0.5;

/**
 * Map a {@link matchScore} (lower = closer; 0 = identical) to a 0–100% similarity label.
 * Exponential decay: a near-identical match reads ~100% and weak matches taper toward 0.
 * Purely for display on take-lane names — it does NOT affect ranking.
 */
export function similarityPercent(score: number): number {
  const pct = 100 * Math.exp(-SIMILARITY_DECAY * Math.max(0, score));
  return Math.max(0, Math.min(100, Math.round(pct)));
}
