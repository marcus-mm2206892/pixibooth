// Photo filters, implemented with plain 2D-canvas operations (pixel math,
// compositing, gradients) so they render identically in Safari and Chrome.
// `ctx.filter` is avoided on purpose: Safari support is unreliable, so a
// CSS-filtered preview would not match the exported PNG.

import type { FilterId } from "./session";
import { get2d, makeCanvas, mulberry32, releaseCanvas } from "./canvas";

/** Live-camera approximation (CSS only); the saved photo uses `applyFilter`. */
export type LivePreview = {
  css: string;
  /** Optional CSS background layered over the video. */
  overlay?: string;
  overlayBlend?: "normal" | "soft-light" | "screen" | "multiply";
  /** Blurred, screened copy of the video for the bloom look. */
  glow?: boolean;
};

export type FilterInfo = {
  id: FilterId;
  label: string;
  description: string;
  live: LivePreview;
};

export const FILTERS: Record<FilterId, FilterInfo> = {
  none: {
    id: "none",
    label: "Original",
    description: "True color",
    live: { css: "none" },
  },
  vintage: {
    id: "vintage",
    label: "Vintage Film",
    description: "Warm B&W, vignette",
    live: {
      css: "grayscale(1) sepia(0.22) contrast(1.18) brightness(0.96)",
      overlay: "radial-gradient(ellipse at center, rgba(20,16,12,0) 42%, rgba(20,16,12,0.4) 100%)",
    },
  },
  dreamy: {
    id: "dreamy",
    label: "Dreamy Glow",
    description: "Soft glowing light",
    live: {
      css: "brightness(1.05) contrast(0.92) saturate(0.96)",
      overlay: "radial-gradient(ellipse at center, rgba(255,240,248,0) 55%, rgba(255,240,248,0.25) 100%)",
      glow: true,
    },
  },
  flash: {
    id: "flash",
    label: "Disposable Flash",
    description: "Punchy & warm",
    live: {
      css: "contrast(1.16) saturate(1.06) sepia(0.06) brightness(1.03)",
      overlay: "radial-gradient(ellipse at center, rgba(20,12,4,0) 45%, rgba(20,12,4,0.38) 100%)",
    },
  },
  pastel: {
    id: "pastel",
    label: "Soft Pastel",
    description: "Light & delicate",
    live: { css: "contrast(0.84) brightness(1.1) saturate(0.82)" },
  },
  cool: {
    id: "cool",
    label: "Cool Film",
    description: "Cool blue shadows",
    live: { css: "saturate(0.9) contrast(1.02)", overlay: "rgba(40, 100, 190, 0.35)", overlayBlend: "soft-light" },
  },
  mono: {
    id: "mono",
    label: "Monochrome ID",
    description: "Crisp B&W",
    live: { css: "grayscale(1) contrast(1.14)" },
  },
};

export const FILTER_ORDER: FilterId[] = ["none", "vintage", "dreamy", "flash", "pastel", "cool", "mono"];

type Rgb = [number, number, number];

type Grade = {
  saturation: number;
  contrast: number;
  /** Output black and white points (fade = black above 0). */
  black: number;
  white: number;
  /** Added mostly to dark tones / mostly to bright tones. */
  shadowTint?: Rgb;
  highlightTint?: Rgb;
  mono?: boolean;
  /** Fine grain amplitude (0 = none). Deterministic per photo seed. */
  grain?: number;
};

const GRADES: Record<Exclude<FilterId, "none" | "vintage">, Grade> = {
  dreamy: { saturation: 0.95, contrast: 0.9, black: 14, white: 255, highlightTint: [8, 3, 10] },
  flash: { saturation: 1.06, contrast: 1.16, black: 4, white: 255, highlightTint: [10, 5, -6], grain: 8 },
  pastel: {
    saturation: 0.82,
    contrast: 0.84,
    black: 36,
    white: 250,
    shadowTint: [6, 2, 10],
    highlightTint: [5, 0, 7],
  },
  cool: {
    saturation: 0.9,
    contrast: 1.02,
    black: 12,
    white: 252,
    shadowTint: [-8, 6, 20],
    highlightTint: [0, 2, 4],
    grain: 5,
  },
  mono: { saturation: 0, contrast: 1.14, black: 8, white: 250, mono: true, grain: 4 },
};

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Applies `filter` in place to the w×h region of `ctx`, starting at 0,0. */
export function applyFilter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  filter: FilterId,
  seed = 1,
): void {
  if (filter === "none") return;
  if (filter === "dreamy") {
    // Bloom is computed from the ungraded image so it follows real highlights.
    const bloom = brightPass(ctx.canvas, width, height);
    grade(ctx, width, height, GRADES.dreamy, seed);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.6;
    ctx.drawImage(bloom, 0, 0, width, height);
    ctx.restore();
    releaseCanvas(bloom);
    vignette(ctx, width, height, "255, 240, 248", 0.22, 0.55);
    return;
  }
  if (filter === "vintage") {
    vintageDuotone(ctx, width, height);
    vignette(ctx, width, height, "20, 16, 12", 0.42, 0.42);
    return;
  }
  grade(ctx, width, height, GRADES[filter], seed);
  if (filter === "flash") vignette(ctx, width, height, "20, 12, 4", 0.36, 0.42);
}

function grade(ctx: CanvasRenderingContext2D, w: number, h: number, g: Grade, seed: number) {
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const rand = mulberry32(seed);
  const range = (g.white - g.black) / 255;
  const st = g.shadowTint ?? [0, 0, 0];
  const ht = g.highlightTint ?? [0, 0, 0];
  const grain = g.grain ?? 0;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let gr = d[i + 1];
    let b = d[i + 2];
    const lum = 0.299 * r + 0.587 * gr + 0.114 * b;
    if (g.mono) {
      r = gr = b = lum;
    } else {
      r = lum + (r - lum) * g.saturation;
      gr = lum + (gr - lum) * g.saturation;
      b = lum + (b - lum) * g.saturation;
    }
    r = (r - 128) * g.contrast + 128;
    gr = (gr - 128) * g.contrast + 128;
    b = (b - 128) * g.contrast + 128;
    const t = lum / 255;
    const sw = (1 - t) * (1 - t);
    const hw = t * t;
    r += st[0] * sw + ht[0] * hw;
    gr += st[1] * sw + ht[1] * hw;
    b += st[2] * sw + ht[2] * hw;
    const n = grain ? (rand() - 0.5) * grain : 0;
    d[i] = clamp(g.black + clamp(r) * range + n);
    d[i + 1] = clamp(g.black + clamp(gr) * range + n);
    d[i + 2] = clamp(g.black + clamp(b) * range + n);
  }
  ctx.putImageData(image, 0, 0);
}

// ── Vintage Film: a port of the team's Canva recipe ─────────────────────────
// Duotone "Custom" (highlights ≈ #F6F4EF, shadows #1E1C1B, full intensity),
// then Adjust: Temperature 25, Tint 8, Brightness −51, Highlights +100,
// Shadows −100, Whites 90, Vibrance 35, Vignette 40 (vignette is applied by the caller).

/** Luminance tone curve standing in for Brightness −51 / Highlights +100 / Shadows −100 / Whites 90. */
const VINTAGE_CURVE: Array<[number, number]> = [
  [0, 0],
  [0.15, 0.04],
  [0.3, 0.14],
  [0.5, 0.38],
  [0.7, 0.7],
  [0.85, 0.91],
  [1, 1],
];

const VINTAGE_LUT = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    let k = 1;
    while (k < VINTAGE_CURVE.length - 1 && x > VINTAGE_CURVE[k][0]) k++;
    const [x0, y0] = VINTAGE_CURVE[k - 1];
    const [x1, y1] = VINTAGE_CURVE[k];
    lut[i] = y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return lut;
})();

const DUO_SHADOW: Rgb = [0x1e, 0x1c, 0x1b];
const DUO_HIGHLIGHT: Rgb = [0xf6, 0xf4, 0xef];
/** Temperature +25 / Tint +8 as channel gains. */
const WARM: Rgb = [1.04, 0.985, 0.93];
const VIBRANCE = 0.35;

function vintageDuotone(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    const t = VINTAGE_LUT[lum];
    let r = (DUO_SHADOW[0] + (DUO_HIGHLIGHT[0] - DUO_SHADOW[0]) * t) * WARM[0];
    let g = (DUO_SHADOW[1] + (DUO_HIGHLIGHT[1] - DUO_SHADOW[1]) * t) * WARM[1];
    let b = (DUO_SHADOW[2] + (DUO_HIGHLIGHT[2] - DUO_SHADOW[2]) * t) * WARM[2];
    // Vibrance: boosts the (weak) warm cast more where it is least saturated.
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max > 0 ? (max - min) / max : 0;
    const boost = 1 + VIBRANCE * (1 - sat);
    const mean = (r + g + b) / 3;
    r = mean + (r - mean) * boost;
    g = mean + (g - mean) * boost;
    b = mean + (b - mean) * boost;
    d[i] = clamp(r);
    d[i + 1] = clamp(g);
    d[i + 2] = clamp(b);
  }
  ctx.putImageData(image, 0, 0);
}

/** Keeps only bright pixels, then blurs them: a glow that leaves faces crisp. */
function brightPass(source: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const small = makeCanvas(Math.max(8, w / 4), Math.max(8, h / 4));
  const sctx = get2d(small);
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(source, 0, 0, w, h, 0, 0, small.width, small.height);
  const image = sctx.getImageData(0, 0, small.width, small.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const k = Math.min(1, Math.max(0, (lum - 160) / 95));
    d[i] *= k;
    d[i + 1] *= k;
    d[i + 2] *= k;
  }
  sctx.putImageData(image, 0, 0);
  const blurred = softBlur(small, w, h);
  releaseCanvas(small);
  return blurred;
}

/** Cheap cross-browser blur: downscale twice, then smooth upscale. */
function softBlur(source: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const tiny = makeCanvas(Math.max(4, w / 24), Math.max(4, h / 24));
  const tctx = get2d(tiny);
  tctx.imageSmoothingQuality = "high";
  tctx.drawImage(source, 0, 0, tiny.width, tiny.height);
  const mid = makeCanvas(Math.max(4, w / 6), Math.max(4, h / 6));
  const mctx = get2d(mid);
  mctx.imageSmoothingQuality = "high";
  mctx.drawImage(tiny, 0, 0, mid.width, mid.height);
  const out = makeCanvas(w, h);
  const octx = get2d(out);
  octx.imageSmoothingQuality = "high";
  octx.drawImage(mid, 0, 0, w, h);
  releaseCanvas(tiny);
  releaseCanvas(mid);
  return out;
}

function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, rgb: string, strength: number, start: number) {
  const radius = Math.hypot(w, h) / 2;
  const gradient = ctx.createRadialGradient(w / 2, h / 2, radius * start, w / 2, h / 2, radius);
  gradient.addColorStop(0, `rgba(${rgb}, 0)`);
  gradient.addColorStop(1, `rgba(${rgb}, ${strength})`);
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
