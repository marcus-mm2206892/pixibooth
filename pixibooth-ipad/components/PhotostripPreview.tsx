"use client";

import { useEffect, useRef } from "react";
import type { CapturedPhoto, PhotoFilter, TemplateColor } from "@/lib/session";
import { decodePhoto } from "@/lib/photos";
import { frameHeight, renderStrip, STRIP, TEMPLATES } from "@/lib/photostrip";
import { getSamplePhotos } from "@/lib/sampleScene";
import { get2d, makeCanvas, releaseCanvas } from "@/lib/canvas";

/**
 * Strip preview drawn by the same `renderStrip` used for the PNG export, so
 * what customers see is exactly what they download. `photos="sample"` fills
 * the slots with illustrated sample art (template picker, welcome screen).
 */
export function PhotostripPreview({
  photos,
  template,
  filter,
  date,
  width = STRIP.width,
  className = "",
}: {
  photos: Array<CapturedPhoto | null> | "sample";
  template: TemplateColor;
  /** The customer's pick; frames with a built-in filter use theirs instead (see renderStrip). */
  filter: PhotoFilter;
  date?: number;
  width?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const height = frameHeight(template, width);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sources =
        photos === "sample"
          ? getSamplePhotos()
          : await Promise.all(photos.map((p) => (p ? decodePhoto(p) : null)));
      if (cancelled) return;
      const scratch = makeCanvas(width, frameHeight(template, width));
      await renderStrip(scratch, { photos: sources, template, filter, width, date: date ? new Date(date) : undefined });
      const target = canvasRef.current;
      if (!cancelled && target) {
        target.width = scratch.width;
        target.height = scratch.height;
        get2d(target).drawImage(scratch, 0, 0);
      }
      releaseCanvas(scratch);
    })().catch((err) => console.error("Strip preview failed", err));
    return () => {
      cancelled = true;
    };
  }, [photos, template, filter, width, date]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      role="img"
      aria-label={`${TEMPLATES[template].label} ${TEMPLATES[template].print} print preview`}
      className={`block h-full w-full ${TEMPLATES[template].outlined ? "ring-1 ring-pp-blue-line" : ""} ${className}`}
      style={{ background: TEMPLATES[template].hex }}
    />
  );
}
