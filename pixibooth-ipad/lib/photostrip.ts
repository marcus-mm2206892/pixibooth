// 2×6-inch photostrip geometry and the single compositing function used for
// template thumbnails, the on-screen preview and the downloaded PNG.

import type { FilterId, TemplateColor } from "./session";
import type { PhotoSource } from "./photos";
import { stripDate } from "./session";
import { applyFilter } from "./filters";
import { canvasToBlob, coverCrop, get2d, makeCanvas, releaseCanvas } from "./canvas";

/** 600×1800 px = 2×6 in at 300 px/in. The PNG itself carries no print-size metadata. */
export const STRIP = {
  width: 600,
  height: 1800,
  marginX: 34,
  marginTop: 36,
  slotWidth: 532,
  slotHeight: 390,
  gap: 28,
  footerTop: 1680,
  footerHeight: 120,
  /** Logo height inside the 120 px footer; width follows the asset's aspect ratio. */
  logoHeight: 92,
} as const;

export const SLOT_YS = [36, 454, 872, 1290] as const;
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
  background: string;
  /** Footer logo + date variant chosen for contrast on this background. */
  logo: LogoVariant;
};

export const TEMPLATES: Record<TemplateColor, TemplateStyle> = {
  white: { id: "white", label: "White", background: "#FFFFFF", logo: "black" },
  red: { id: "red", label: "Classic Red", background: "#C92B3A", logo: "white" },
  black: { id: "black", label: "Black", background: "#161616", logo: "white" },
  cobalt: { id: "cobalt", label: "Cobalt Blue", background: "#1854B8", logo: "white" },
  powder: { id: "powder", label: "Baby Blue", background: "#BFDFFF", logo: "black" },
  pink: { id: "pink", label: "Blush Pink", background: "#F7B9CE", logo: "black" },
  lavender: { id: "lavender", label: "Lavender", background: "#CFC0F2", logo: "black" },
  yellow: { id: "yellow", label: "Butter Yellow", background: "#F5D979", logo: "black" },
};

export const TEMPLATE_ORDER: TemplateColor[] = [
  "white",
  "red",
  "black",
  "cobalt",
  "powder",
  "pink",
  "lavender",
  "yellow",
];

const INK: Record<LogoVariant, string> = { black: "#111111", white: "#FFFFFF" };

export type RenderStripOptions = {
  photos: Array<PhotoSource | null>;
  template: TemplateColor;
  filter: FilterId;
  /** Output width; height is always 3× width. Defaults to the 600 px print width. */
  width?: number;
  date?: Date;
};

const logos = new Map<LogoVariant, Promise<HTMLImageElement | null>>();

/** Loads (once) the real logo PNG; resolves null if it can't load so export still works. */
function loadLogo(variant: LogoVariant): Promise<HTMLImageElement | null> {
  let pending = logos.get(variant);
  if (!pending) {
    const img = new Image();
    img.decoding = "async";
    img.src = LOGO_SRC[variant];
    pending = img.decode().then(
      () => img,
      () => {
        logos.delete(variant);
        return null;
      },
    );
    logos.set(variant, pending);
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
  const [logo] = await Promise.all([
    loadLogo(style.logo),
    ensureFont(dateFont, dateText),
    ensureFont(fallbackFont, BRAND_NAME),
  ]);

  canvas.width = Math.round(width);
  canvas.height = Math.round(width * 3);
  const ctx = get2d(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.fillStyle = style.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const slotW = Math.round(STRIP.slotWidth * s);
  const slotH = Math.round(STRIP.slotHeight * s);
  const x = Math.round(STRIP.marginX * s);

  // Filter each photo on its own canvas first, then composite, so the
  // background and footer are never filtered. A source repeated across slots
  // (the live preview) is filtered once.
  const filtered = new Map<PhotoSource, HTMLCanvasElement>();
  const slotFor = (photo: PhotoSource) => {
    let slot = filtered.get(photo);
    if (!slot) {
      slot = makeCanvas(slotW, slotH);
      const sctx = get2d(slot);
      sctx.imageSmoothingQuality = "high";
      const crop = coverCrop(photo.width, photo.height, slotW / slotH);
      sctx.drawImage(photo.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, slotW, slotH);
      applyFilter(sctx, slotW, slotH, filter, photo.seed);
      filtered.set(photo, slot);
    }
    return slot;
  };

  SLOT_YS.forEach((slotY, i) => {
    const y = Math.round(slotY * s);
    const photo = photos[i];
    if (photo) {
      ctx.drawImage(slotFor(photo), x, y);
    } else {
      ctx.fillStyle = style.logo === "white" ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.08)";
      ctx.fillRect(x, y, slotW, slotH);
    }
  });
  filtered.forEach(releaseCanvas);

  // Footer: the logo as large as the footer allows on the left, the date
  // right-aligned on the same center line.
  const ink = INK[style.logo];
  const centerY = (STRIP.footerTop + STRIP.footerHeight / 2) * s;
  const logoH = STRIP.logoHeight * s;
  ctx.fillStyle = ink;
  ctx.textBaseline = "middle";
  if (logo) {
    const logoW = logoH * (logo.naturalWidth / logo.naturalHeight);
    ctx.drawImage(logo, x, centerY - logoH / 2, logoW, logoH);
  } else {
    ctx.font = fallbackFont;
    ctx.textAlign = "left";
    ctx.fillText(BRAND_NAME, x, centerY);
  }
  ctx.font = dateFont;
  ctx.textAlign = "right";
  ctx.fillText(dateText, canvas.width - x, centerY);
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
