"use client";

import { useEffect, useRef, type RefObject } from "react";
import { DreamFilmRenderer } from "@/lib/dreamFilm";
import { coverCrop } from "@/lib/canvas";

/** Live-preview resolution cap and frame rate (the GPU pipeline runs per frame). */
const MAX_WIDTH = 1080;
const FRAME_MS = 1000 / 30;

/**
 * Draws the camera video through the real Dream Film pipeline, cover-cropped
 * to the frame exactly like the capture. Sits over the <video> element.
 */
export function DreamFilmLive({ videoRef, mirror }: { videoRef: RefObject<HTMLVideoElement | null>; mirror: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = DreamFilmRenderer.create(canvas);
    if (!renderer) return;
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const outWidth = Math.min(MAX_WIDTH, Math.round(rect.width * dpr));
      const outHeight = Math.round((outWidth * rect.height) / rect.width);
      renderer.render(video, {
        crop: coverCrop(video.videoWidth, video.videoHeight, outWidth / outHeight),
        outWidth,
        outHeight,
        seed: 7, // fixed: grain stays still instead of flickering
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [videoRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ transform: mirror ? "scaleX(-1)" : undefined }}
    />
  );
}
