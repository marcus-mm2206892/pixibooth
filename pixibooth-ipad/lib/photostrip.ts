// 2×6-inch photostrip geometry, the strip colors (official artwork) and the
// single compositing function used for the on-screen previews and the PNG.

import type { FilterId, TemplateColor } from "./session";
import type { PhotoSource } from "./photos";
import { stripDate } from "./session";
import { applyFilter } from "./filters";
import { canvasToBlob, coverCrop, get2d, makeCanvas, releaseCanvas } from "./canvas";

/** 600×1800 px = 2×6 in at 300 px/in. The PNG itself carries no print-size metadata. */
export const STRIP = {
  width: 600,
  height: 1800,
  /** Camera/capture aspect; the official frames are within 1–2% of it (photos are cover-cropped per frame). */
  slotWidth: 532,
  slotHeight: 390,
  /** Date stamp: right-aligned to the frames' right edge, on the artwork logo's center line. */
  dateRight: 569,
  dateCenterY: 1722,
} as const;

/** Photo windows of the official strip artwork, in 600×1800 px (measured; identical for every color). */
export const SLOTS = [
  { x: 33, y: 32, w: 536, h: 393 },
  { x: 33, y: 440, w: 536, h: 393 },
  { x: 33, y: 852, w: 536, h: 386 },
  { x: 33, y: 1256, w: 536, h: 393 },
] as const;

export const SLOT_ASPECT = STRIP.slotWidth / STRIP.slotHeight;

export const BRAND_NAME = "pixipocket";

export type LogoVariant = "black" | "white";

export const LOGO_SRC: Record<LogoVariant, string> = {
  black: "/brand/pixipocket-logo-black.png",
  white: "/brand/pixipocket-logo-white.png",
};

export type TemplateStyle = {
  id: TemplateColor;
  label: string;
  /** Main strip color (Cloudy Blue: its darkest stop); also the fill while the artwork loads. */
  hex: string;
  /** CSS background of the picker swatch. */
  swatch: string;
  /**
   * Official strip artwork, rasterized at 600×1800 from assets/color photo strips/<name> strip.svg
   * (canvas can't reliably draw those image-embedding SVGs on iPad Safari). The SVG's opaque strip
   * (viewBox 0,0.4 to 72,215) is scaled uniformly to 1800 px tall and centered, trimming ~2 px of
   * solid border per side; nothing is redrawn or stretched.
   */
  src: string;
  /** Date stamp color. */
  dateInk: string;
  /** Dark strip: light picker star / empty-slot tint. */
  dark: boolean;
};

const strip = (id: TemplateColor, label: string, hex: string, dateInk: string, dark: boolean, swatch = hex): TemplateStyle => ({
  id,
  label,
  hex,
  swatch,
  src: `/strips/${id}.png`,
  dateInk,
  dark,
});

/** The single source for every strip color: picker, previews, Keep screen and export all read from here. */
export const TEMPLATES: Record<TemplateColor, TemplateStyle> = {
  black: strip("black", "Black", "#000000", "#E8E8E8", true),
  white: strip("white", "White", "#FFFFFF", "#193158", false),
  cherry: strip("cherry", "Cherry Red", "#890000", "#E8E8E8", true),
  denim: strip("denim", "Denim Blue", "#063285", "#E8E8E8", true),
  vanilla: strip("vanilla", "Vanilla Cream", "#FEF2D9", "#412B28", false),
  cloudy: strip(
    "cloudy",
    "Cloudy Blue",
    "#83A6EA",
    "#063286",
    false,
    "linear-gradient(180deg, #DBE6FA 0%, #83A6EA 50%, #DBE6FA 100%)",
  ),
  sakura: strip("sakura", "Sakura Pink", "#FEDFE1", "#7E191F", false),
  matcha: strip("matcha", "Matcha Green", "#ACC98B", "#264D43", false),
  butter: strip("butter", "Butter Yellow", "#F5D979", "#594413", false),
  lavender: strip("lavender", "Lavender", "#D0C0F2", "#694C9D", false),
};

export const TEMPLATE_ORDER: TemplateColor[] = [
  "black",
  "white",
  "cherry",
  "denim",
  "vanilla",
  "cloudy",
  "sakura",
  "matcha",
  "butter",
  "lavender",
];

export type RenderStripOptions = {
  photos: Array<PhotoSource | null>;
  template: TemplateColor;
  filter: FilterId;
  /** Output width; height is always 3× width. Defaults to the 600 px print width. */
  width?: number;
  date?: Date;
};

const artwork = new Map<TemplateColor, Promise<HTMLImageElement | null>>();

/** Loads (once) the strip artwork PNG; resolves null if it can't load so export still works. */
function loadArtwork(template: TemplateColor): Promise<HTMLImageElement | null> {
  let pending = artwork.get(template);
  if (!pending) {
    const img = new Image();
    img.decoding = "async";
    img.src = TEMPLATES[template].src;
    pending = img.decode().then(
      () => img,
      () => {
        artwork.delete(template);
        return null;
      },
    );
    artwork.set(template, pending);
  }
  return pending;
}

function fontFamily(variable: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

/** `text` matters for CJK: web fonts are split by unicode-range, so only the glyph slices for that text load. */
async function ensureFont(spec: string, text?: string) {
  try {
    await document.fonts?.load(spec, text);
  } catch {
    // Canvas falls back to the next family in the stack.
  }
}

/** Renders the strip onto `canvas` (resized to width × 3·width) and returns it. */
export async function renderStrip(
  canvas: HTMLCanvasElement,
  { photos, template, filter, width = STRIP.width, date = new Date() }: RenderStripOptions,
): Promise<HTMLCanvasElement> {
  const s = width / STRIP.width;
  const style = TEMPLATES[template];
  const pixel = fontFamily("--font-dotgothic", "ui-monospace, monospace");
  const display = fontFamily("--font-barlow-condensed", "'Arial Narrow', sans-serif");
  const dateFont = `400 ${Math.round(20 * s)}px ${pixel}`;
  const fallbackFont = `800 ${Math.round(40 * s)}px ${display}`;
  const dateText = stripDate(date);
  const [art] = await Promise.all([
    loadArtwork(template),
    ensureFont(dateFont, dateText),
    ensureFont(fallbackFont, BRAND_NAME),
  ]);

  canvas.width = Math.round(width);
  canvas.height = Math.round(width * 3);
  const ctx = get2d(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // The official artwork (strip color, frames, logo). Photos go over its
  // placeholder windows; an empty slot keeps the artwork's placeholder.
  if (art) {
    ctx.drawImage(art, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = style.hex;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Filter each photo on its own canvas first, then composite, so the
  // artwork is never filtered. A source repeated across slots (the live
  // preview) is filtered once per slot size.
  const filtered = new Map<string, HTMLCanvasElement>();
  const ids = new Map<PhotoSource, number>();
  const slotFor = (photo: PhotoSource, slotW: number, slotH: number) => {
    if (!ids.has(photo)) ids.set(photo, ids.size);
    const key = `${ids.get(photo)}:${slotW}x${slotH}`;
    let slot = filtered.get(key);
    if (!slot) {
      slot = makeCanvas(slotW, slotH);
      const sctx = get2d(slot);
      sctx.imageSmoothingQuality = "high";
      const crop = coverCrop(photo.width, photo.height, slotW / slotH);
      sctx.drawImage(photo.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, slotW, slotH);
      applyFilter(sctx, slotW, slotH, filter, photo.seed);
      filtered.set(key, slot);
    }
    return slot;
  };

  SLOTS.forEach((slot, i) => {
    const photo = photos[i];
    if (!photo) return;
    const x = Math.round(slot.x * s);
    const y = Math.round(slot.y * s);
    const w = Math.round((slot.x + slot.w) * s) - x;
    const h = Math.round((slot.y + slot.h) * s) - y;
    ctx.drawImage(slotFor(photo, w, h), x, y);
  });
  filtered.forEach(releaseCanvas);

  // Footer: the logo is part of the artwork; the date sits bottom-right on its center line.
  const centerY = STRIP.dateCenterY * s;
  ctx.textBaseline = "middle";
  if (!art) {
    ctx.fillStyle = style.dateInk;
    ctx.font = fallbackFont;
    ctx.textAlign = "left";
    ctx.fillText(BRAND_NAME, SLOTS[0].x * s, centerY);
  }
  ctx.fillStyle = style.dateInk;
  ctx.font = dateFont;
  ctx.textAlign = "right";
  ctx.fillText(dateText, STRIP.dateRight * s, centerY);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  return canvas;
}

/** The downloadable 600×1800 PNG. */
export async function renderStripPng(options: Omit<RenderStripOptions, "width">): Promise<Blob> {
  const canvas = makeCanvas(STRIP.width, STRIP.height);
  try {
    await renderStrip(canvas, { ...options, width: STRIP.width });
    if (canvas.width !== STRIP.width || canvas.height !== STRIP.height) {
      throw new Error(`Strip rendered at ${canvas.width}×${canvas.height}, expected 600×1800`);
    }
    return await canvasToBlob(canvas, "image/png");
  } finally {
    releaseCanvas(canvas);
  }
}
