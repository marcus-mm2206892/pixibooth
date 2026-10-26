// Photo filters, implemented with plain 2D-canvas operations (pixel math,
// compositing, gradients) so they render identically in Safari and Chrome.
// `ctx.filter` is avoided on purpose: Safari support is unreliable, so a
// CSS-filtered preview would not match the exported PNG.

import type { FilterId } from "./session";
import { get2d, makeCanvas, mulberry32, releaseCanvas } from "./canvas";
import type { DreamFilmPreset } from "./dreamFilm";
import { DREAM_FILM, DREAMY, gradePixel, stillRenderer } from "./dreamFilm";

/** Live-camera approximation (CSS only); the saved photo uses `applyFilter`. */
export type LivePreview = {
  css: string;
  /** Optional CSS background layered over the video. */
  overlay?: string;
  overlayBlend?: "normal" | "soft-light" | "screen" | "multiply";
  /** Rendered live through the real WebGL pipeline (this preset) instead of CSS. */
  gpu?: DreamFilmPreset;
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
    label: "Auto",
    description: "Original color",
    live: { css: "none" },
  },
  vintage: {
    id: "vintage",
    label: "Vintage",
    description: "Warm B&W, vignette",
    live: {
      css: "grayscale(1) sepia(0.22) contrast(1.18) brightness(0.96)",
      overlay: "radial-gradient(ellipse at center, rgba(20,16,12,0) 42%, rgba(20,16,12,0.4) 100%)",
    },
  },
  dreamy: {
    id: "dreamy",
    label: "Dreamy",
    description: "Soft glowing light",
    // Same WebGL pipeline live and in saved photos, so they always match.
    live: { css: "none", gpu: DREAMY },
  },
  dreamfilm: {
    id: "dreamfilm",
    label: "Dream Film",
    description: "Creamy analog glow",
    // The live preview runs the same WebGL pipeline as the saved photo.
    live: { css: "none", gpu: DREAM_FILM },
  },
};

// Dream Film (lib/dreamFilm.ts) is kept but not offered right now; add "dreamfilm" back here to show it.
export const FILTER_ORDER: FilterId[] = ["none", "vintage", "dreamy"];

type Rgb = [number, number, number];

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
  if (filter === "dreamfilm" || filter === "dreamy") {
    const preset = filter === "dreamy" ? DREAMY : DREAM_FILM;
    const renderer = stillRenderer();
    if (renderer) {
      const out = renderer.render(ctx.canvas, {
        crop: { sx: 0, sy: 0, sw: width, sh: height },
        outWidth: width,
        outHeight: height,
        seed,
        preset,
      });
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(out, 0, 0, width, height);
    } else {
      dreamFilmCpu(ctx, width, height, seed, preset);
    }
    return;
  }
  vintageDuotone(ctx, width, height);
  vignette(ctx, width, height, "20, 16, 12", 0.42, 0.42);
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

/**
 * CPU fallback for Dream Film when WebGL is unavailable: same stages and
 * values; blurs use the downscale approximation, so it is close, not identical.
 */
function dreamFilmCpu(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, P: DreamFilmPreset) {
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const smooth = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < d.length; i += 4) {
    const c = gradePixel([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255], P);
    d[i] = c[0] * 255;
    d[i + 1] = c[1] * 255;
    d[i + 2] = c[2] * 255;
  }
  ctx.putImageData(image, 0, 0);

  const bloom = brightPass(ctx.canvas, w, h);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = P.bloom.enabled ? P.bloom.opacity : 0;
  ctx.drawImage(bloom, 0, 0, w, h);
  ctx.restore();
  releaseCanvas(bloom);

  const out = ctx.getImageData(0, 0, w, h);
  const o = out.data;
  const rand = mulberry32(seed);
  const edgeW = P.edgeFade.widthFraction * Math.min(w, h);
  const hex = parseInt(P.edgeFade.color.slice(1), 16);
  const ec = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  const fade = (dist: number) => Math.pow(smooth(0, 1, 1 - Math.min(1, dist / edgeW)), P.edgeFade.falloffPower);
  for (let y = 0; y < h; y++) {
    const ay = fade(Math.min(y, h - 1 - y));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const n = P.grain.enabled ? (rand() + rand() + rand() - 1.5) * 2 * P.grain.luminanceStdDev * 255 : 0;
      const a = (P.edgeFade.enabled ? P.edgeFade.maxOpacity : 0) * (1 - (1 - fade(Math.min(x, w - 1 - x))) * (1 - ay));
      for (let k = 0; k < 3; k++) o[i + k] = clamp((o[i + k] + n) * (1 - a) + ec[k] * a);
    }
  }
  ctx.putImageData(out, 0, 0);
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
