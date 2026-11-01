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

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Where things go on one strip artwork. Every coordinate is in the layout's own
 * 1:3 space (`width` × `height`); the renderer scales it to the output width.
 */
export type StripLayout = {
  width: number;
  height: number;
  /** Part of the artwork image that fills the strip (uniform scale). Omitted: the whole image. */
  art?: { sx: number; sy: number; sw: number; sh: number };
  /** Photo windows; photos are cover-cropped into them. */
  slots: readonly Rect[];
  date: {
    /** Right edge of the text. */
    right: number;
    /** Vertical anchor: the text's middle, or the bottom of its glyphs (to sit on printed text's line). */
    y: number;
    anchor: "middle" | "ink-bottom";
    size: number;
    /** Text never starts left of this; the font shrinks to fit. */
    minLeft?: number;
  };
  /** Downloaded PNG width in px (height is always 3×). */
  exportWidth: number;
};

/** The ten color strips share one layout (600×1800 artwork). */
const COLOR_LAYOUT: StripLayout = {
  width: STRIP.width,
  height: STRIP.height,
  slots: SLOTS,
  date: { right: STRIP.dateRight, y: STRIP.dateCenterY, anchor: "middle", size: 20 },
  exportWidth: STRIP.width,
};

/**
 * Pocket ID: the supplied 1047×3131 artwork (public/strips/pocket-id.jpg), used as is.
 * It is 0.3% wider than 1:3, so 1.67 px of grid paper is trimmed from each side
 * rather than stretching it. Measurements are in artwork pixels:
 * photo windows are the insides of the blue borders (x 64–984; 672 px tall), and
 * the date sits right-aligned in the white box on the 撮影記録 line (glyphs y 2972–2999,
 * 30 px DotGothic, right edge on フォトセッション料金's at x 982).
 */
const POCKET_ID_TRIM = (1047 - 3131 / 3) / 2;
const pocketX = (x: number) => x - POCKET_ID_TRIM;
const POCKET_ID_LAYOUT: StripLayout = {
  width: 3131 / 3,
  height: 3131,
  art: { sx: POCKET_ID_TRIM, sy: 0, sw: 3131 / 3, sh: 3131 },
  slots: [60, 766, 1472, 2178].map((y) => ({ x: pocketX(64), y, w: 921, h: 672 })),
  date: { right: pocketX(982), y: 2999, anchor: "ink-bottom", size: 30, minLeft: pocketX(660) },
  // Native resolution, so the artwork is not downscaled in the download.
  exportWidth: 1044,
};

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
  /** Light edges that need a thin outline to stand off a white page. */
  outlined: boolean;
  layout: StripLayout;
};

const strip = (id: TemplateColor, label: string, hex: string, dateInk: string, dark: boolean, swatch = hex): TemplateStyle => ({
  id,
  label,
  hex,
  swatch,
  src: `/strips/${id}.png`,
  dateInk,
  dark,
  outlined: id === "white",
  layout: COLOR_LAYOUT,
});

/** Blue graph-paper picker icon for Pocket ID: light minor grid, blue major lines clear of the centre star. */
const POCKET_ID_SWATCH = (() => {
  const minor = [3, 9, 15, 21].flatMap((v) => [`M${v} 0V24`, `M0 ${v}H24`]).join("");
  const major = [6, 12, 18].flatMap((v) => (v === 12 ? [] : [`M${v} 0V24`, `M0 ${v}H24`])).join("");
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>` +
    `<path d='${minor}M12 0V24M0 12H24' stroke='#B4C8FB' stroke-width='0.5'/>` +
    `<path d='${major}' stroke='#2D5FF0' stroke-width='0.9'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / 100% 100% no-repeat, #FFFFFF`;
})();

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
  pocketid: {
    id: "pocketid",
    label: "Pocket ID",
    hex: "#FFFFFF",
    swatch: POCKET_ID_SWATCH,
    src: "/strips/pocket-id.jpg",
    dateInk: "#000000",
    dark: false,
    outlined: true,
    layout: POCKET_ID_LAYOUT,
  },
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
  "pocketid",
];

export type RenderStripOptions = {
  photos: Array<PhotoSource | null>;
  template: TemplateColor;
  filter: FilterId;
  /** Output width; height is always 3× width. Defaults to the template's export width. */
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
  { photos, template, filter, width, date = new Date() }: RenderStripOptions,
): Promise<HTMLCanvasElement> {
  const style = TEMPLATES[template];
  const layout = style.layout;
  width ??= layout.exportWidth;
  const s = width / layout.width;
  const pixel = fontFamily("--font-dotgothic", "ui-monospace, monospace");
  const display = fontFamily("--font-barlow-condensed", "'Arial Narrow', sans-serif");
  const dateFont = `400 ${Math.round(layout.date.size * s)}px ${pixel}`;
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
  if (art && layout.art) {
    const { sx, sy, sw, sh } = layout.art;
    ctx.drawImage(art, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  } else if (art) {
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

  layout.slots.forEach((slot, i) => {
    const photo = photos[i];
    if (!photo) return;
    const x = Math.round(slot.x * s);
    const y = Math.round(slot.y * s);
    const w = Math.round((slot.x + slot.w) * s) - x;
    const h = Math.round((slot.y + slot.h) * s) - y;
    ctx.drawImage(slotFor(photo, w, h), x, y);
  });
  filtered.forEach(releaseCanvas);

  // Footer: the logo is part of the artwork; the date goes where the layout says.
  const spec = layout.date;
  const right = spec.right * s;
  ctx.textBaseline = "middle";
  if (!art) {
    ctx.fillStyle = style.dateInk;
    ctx.font = fallbackFont;
    ctx.textAlign = "left";
    ctx.fillText(BRAND_NAME, layout.slots[0].x * s, spec.y * s);
  }
  ctx.fillStyle = style.dateInk;
  ctx.font = dateFont;
  if (spec.minLeft !== undefined) {
    const room = right - spec.minLeft * s;
    const textWidth = ctx.measureText(dateText).width;
    if (textWidth > room) ctx.font = `400 ${Math.floor(spec.size * s * (room / textWidth))}px ${pixel}`;
  }
  ctx.textAlign = "right";
  if (spec.anchor === "ink-bottom") {
    ctx.textBaseline = "alphabetic";
    const descent = ctx.measureText(dateText).actualBoundingBoxDescent || 0;
    ctx.fillText(dateText, right, spec.y * s - descent);
  } else {
    ctx.fillText(dateText, right, spec.y * s);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  return canvas;
}

/** The downloadable PNG: 600×1800 for the color strips, the artwork's native 1044×3132 for Pocket ID. */
export async function renderStripPng(options: Omit<RenderStripOptions, "width">): Promise<Blob> {
  const width = TEMPLATES[options.template].layout.exportWidth;
  const canvas = makeCanvas(width, width * 3);
  try {
    await renderStrip(canvas, { ...options, width });
    if (canvas.width !== width || canvas.height !== width * 3) {
      throw new Error(`Strip rendered at ${canvas.width}×${canvas.height}, expected ${width}×${width * 3}`);
    }
    return await canvasToBlob(canvas, "image/png");
  } finally {
    releaseCanvas(canvas);
  }
}
