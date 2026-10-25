// Illustrated sample "photos" (two friends under party confetti) used to show
// strip colors and filters before any real photo exists. Never exported.

import type { PhotoSource } from "./photos";
import { makeCanvas, mulberry32, get2d } from "./canvas";
import { SLOT_ASPECT } from "./photostrip";

type Palette = { skyTop: string; skyBottom: string; hairA: string; hairB: string; shirtA: string; shirtB: string };

const PALETTES: Palette[] = [
  { skyTop: "#7DC2EE", skyBottom: "#FFE3C4", hairA: "#2B1D16", hairB: "#5A3A22", shirtA: "#1854B8", shirtB: "#FFFFFF" },
  { skyTop: "#C9B6F0", skyBottom: "#FFD6E2", hairA: "#1E1A1A", hairB: "#8A5A3A", shirtA: "#FFFFFF", shirtB: "#E6505F" },
  { skyTop: "#8FD3C8", skyBottom: "#FFF2C9", hairA: "#3A2418", hairB: "#1B1B1B", shirtA: "#F4C542", shirtB: "#1854B8" },
  { skyTop: "#5E8FE0", skyBottom: "#DDEBFF", hairA: "#6B4226", hairB: "#241A14", shirtA: "#FFFFFF", shirtB: "#F7B9CE" },
];

const SKIN = ["#F2C6A0", "#D9A27C", "#F6D2B5", "#B9825E"];

export function drawSampleScene(ctx: CanvasRenderingContext2D, w: number, h: number, variant = 0) {
  const p = PALETTES[variant % PALETTES.length];
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, p.skyTop);
  sky.addColorStop(0.75, p.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Bright light source (lets bloom/flash filters show their character).
  ctx.fillStyle = "#FFF6D6";
  ctx.beginPath();
  ctx.arc(w * 0.84, h * 0.2, h * 0.1, 0, Math.PI * 2);
  ctx.fill();

  const rand = mulberry32(11 + variant);
  const confetti = ["#E6505F", "#F4C542", "#1854B8", "#FFFFFF", "#7DC2EE"];
  for (let i = 0; i < 34; i++) {
    ctx.save();
    ctx.translate(rand() * w, rand() * h * 0.55);
    ctx.rotate(rand() * Math.PI);
    ctx.fillStyle = confetti[i % confetti.length];
    ctx.fillRect(0, 0, w * 0.012, w * 0.024);
    ctx.restore();
  }

  const tilt = [-0.06, 0.05, -0.02, 0.08][variant % 4];
  friend(ctx, w * 0.36, h, h, SKIN[variant % 4], p.hairA, p.shirtA, tilt);
  friend(ctx, w * 0.64, h, h, SKIN[(variant + 2) % 4], p.hairB, p.shirtB, -tilt);
}

function friend(
  ctx: CanvasRenderingContext2D,
  cx: number,
  bottom: number,
  h: number,
  skin: string,
  hair: string,
  shirt: string,
  tilt: number,
) {
  const head = h * 0.2;
  const cy = bottom - h * 0.42;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  // Shoulders.
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.ellipse(0, h * 0.42, head * 1.55, head * 1.15, 0, Math.PI, 0);
  ctx.fill();
  // Hair back.
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.ellipse(0, head * 0.15, head * 1.08, head * 1.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // Face.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(0, head * 0.2, head * 0.82, head * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  // Fringe.
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.ellipse(0, -head * 0.55, head * 0.9, head * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes, blush, smile.
  ctx.fillStyle = "#1B1B1B";
  ctx.beginPath();
  ctx.arc(-head * 0.32, head * 0.12, head * 0.08, 0, Math.PI * 2);
  ctx.arc(head * 0.32, head * 0.12, head * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(230, 90, 110, 0.35)";
  ctx.beginPath();
  ctx.ellipse(-head * 0.48, head * 0.4, head * 0.16, head * 0.09, 0, 0, Math.PI * 2);
  ctx.ellipse(head * 0.48, head * 0.4, head * 0.16, head * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#7A3B2E";
  ctx.lineWidth = Math.max(1.5, head * 0.06);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, head * 0.42, head * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

let samples: PhotoSource[] | null = null;

/** Four cached sample photos at slot aspect, usable anywhere a PhotoSource is. */
export function getSamplePhotos(): PhotoSource[] {
  if (!samples) {
    const w = 640;
    const h = Math.round(w / SLOT_ASPECT);
    samples = [0, 1, 2, 3].map((variant) => {
      const canvas = makeCanvas(w, h);
      drawSampleScene(get2d(canvas), w, h, variant);
      return { image: canvas, width: w, height: h, seed: 101 + variant };
    });
  }
  return samples;
}
