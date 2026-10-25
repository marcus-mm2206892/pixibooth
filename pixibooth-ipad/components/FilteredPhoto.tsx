"use client";

import { useEffect, useRef } from "react";
import type { CapturedPhoto, FilterId } from "@/lib/session";
import { decodePhoto, drawFilteredPhoto } from "@/lib/photos";
import { get2d, makeCanvas, releaseCanvas } from "@/lib/canvas";
import { SLOT_ASPECT } from "@/lib/photostrip";

/** A captured photo rendered through the real (canvas) filter, at `width` px. */
export function FilteredPhoto({
  photo,
  filter,
  width = 640,
  className = "",
  alt,
}: {
  photo: CapturedPhoto;
  filter: FilterId;
  width?: number;
  className?: string;
  alt: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const height = Math.round(width / SLOT_ASPECT);

  useEffect(() => {
    let cancelled = false;
    decodePhoto(photo)
      .then((source) => {
        const target = canvasRef.current;
        if (cancelled || !target) return;
        const scratch = makeCanvas(width, height);
        drawFilteredPhoto(scratch, source, filter);
        get2d(target).drawImage(scratch, 0, 0);
        releaseCanvas(scratch);
      })
      .catch((err) => console.error("Photo preview failed", err));
    return () => {
      cancelled = true;
    };
  }, [photo, filter, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      role="img"
      aria-label={alt}
      className={`block h-full w-full bg-black/10 object-cover ${className}`}
    />
  );
}
