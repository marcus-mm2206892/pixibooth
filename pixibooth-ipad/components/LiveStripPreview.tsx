"use client";

import { memo, useEffect, useRef } from "react";
import type { FilterId, TemplateColor } from "@/lib/session";
import { FILTERS } from "@/lib/filters";
import { stillRenderer } from "@/lib/dreamFilm";
import { TEMPLATES, renderStrip } from "@/lib/photostrip";
import { getSamplePhotos } from "@/lib/sampleScene";
import { coverCrop, get2d, makeCanvas, releaseCanvas } from "@/lib/canvas";

/** Resolution of the static layer (artwork + date, or the whole sample strip). */
const BASE_WIDTH = 600;
/** Live slot canvases: about a slot's on-screen size on an iPad at 2×, never the full camera frame. */
const SLOT_PX = 400;
/** The camera delivers ~30 fps; drawing more often only repeats frames. */
const FRAME_MS = 1000 / 30;
const EMPTY_SLOTS = [null, null, null, null];

/**
 * Style-screen strip preview, split in two so the camera stays smooth:
 *
 * - Static layer: the real `renderStrip` output (artwork, date; or sample photos
 *   when there's no camera). Rendered once per template/filter change, not per frame.
 * - Live layer: four small canvases over the photo windows. Each frame the camera
 *   is drawn once (cover-cropped and mirrored like the capture) and copied to the
 *   other three. These are GPU blits with no pixel read-back. Vintage
 *   uses the same CSS look as the camera screen's live view. Dream Film runs the
 *   real WebGL pipeline once per frame at slot size.
 *
 * The export path (renderStripPng) is unchanged, so saved photos and strips keep
 * full quality and the exact filters.
 */
export const LiveStripPreview = memo(function LiveStripPreview({
  stream,
  live,
  template,
  filter,
  mirror,
  date,
}: {
  stream: MediaStream | null;
  /** Camera is live: show it in the slots; otherwise the sample strip. */
  live: boolean;
  template: TemplateColor;
  filter: FilterId;
  mirror: boolean;
  date?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const slotsRef = useRef<HTMLDivElement>(null);
  const slotCanvases = useRef<Array<HTMLCanvasElement | null>>([]);
  const opts = useRef({ filter, mirror });
  const style = TEMPLATES[template];
  const { layout } = style;
  const liveLook = FILTERS[filter].live;

  useEffect(() => {
    opts.current = { filter, mirror };
  }, [filter, mirror]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    if (stream) video.play().catch(() => {});
  }, [stream]);

  // Static layer: only re-rendered when what it shows changes.
  const staticFilter: FilterId = live ? "none" : filter;
  useEffect(() => {
    let cancelled = false;
    const scratch = makeCanvas(BASE_WIDTH, BASE_WIDTH * 3);
    renderStrip(scratch, {
      photos: live ? EMPTY_SLOTS : getSamplePhotos(),
      template,
      filter: staticFilter,
      width: BASE_WIDTH,
      date: date ? new Date(date) : undefined,
    })
      .then(() => {
        const target = baseRef.current;
        if (cancelled || !target) return;
        // Same size as the scratch canvas: no resize, so nothing flashes blank.
        const ctx = get2d(target);
        ctx.clearRect(0, 0, target.width, target.height);
        ctx.drawImage(scratch, 0, 0);
      })
      .catch((err) => console.error("Strip preview failed", err))
      .finally(() => releaseCanvas(scratch));
    return () => {
      cancelled = true;
    };
  }, [live, template, staticFilter, date]);

  // Live layer: one camera draw per frame, copied into the four slots.
  useEffect(() => {
    if (!live) return;
    const box = slotsRef.current;
    let raf = 0;
    let last = 0;
    let shown = false;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return;
      const slots = slotCanvases.current.filter((c): c is HTMLCanvasElement => !!c);
      if (!slots.length) return;
      last = now;

      const { filter, mirror } = opts.current;
      const first = slots[0];
      const w = first.width;
      const h = first.height;
      const crop = coverCrop(video.videoWidth, video.videoHeight, w / h);
      // No WebGL: the slots show the plain camera; the saved strip still gets the real filter.
      const gpu = filter === "dreamfilm" ? stillRenderer() : null;
      let frame: CanvasImageSource;
      let rest = slots;
      if (gpu) {
        frame = gpu.render(video, { crop, outWidth: w, outHeight: h, mirror, seed: 7 });
      } else {
        const ctx = get2d(first);
        ctx.setTransform(mirror ? -1 : 1, 0, 0, 1, mirror ? w : 0, 0);
        ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        frame = first;
        rest = slots.slice(1);
      }
      for (const c of rest) {
        // Slots differ by a few px in height: cover-crop instead of stretching.
        const k = coverCrop(w, h, c.width / c.height);
        get2d(c).drawImage(frame, k.sx, k.sy, k.sw, k.sh, 0, 0, c.width, c.height);
      }
      if (!shown && box) {
        box.style.visibility = "visible";
        shown = true;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (box) box.style.visibility = "";
    };
  }, [live]);

  return (
    <div
      role="img"
      aria-label={`${style.label} strip with ${FILTERS[filter].label} filter`}
      className={`relative h-full w-full ${style.outlined ? "ring-1 ring-pp-blue-line" : ""}`}
      style={{ background: style.hex }}
    >
      <canvas ref={baseRef} width={BASE_WIDTH} height={BASE_WIDTH * 3} className="block h-full w-full" />
      {/* Hidden until the first camera frame is drawn, so empty slots never cover the artwork. */}
      <div ref={slotsRef} className="invisible absolute inset-0" aria-hidden>
        {layout.slots.map((slot, i) => (
          <div
            key={i}
            className="absolute overflow-hidden"
            style={{
              left: `${(slot.x / layout.width) * 100}%`,
              top: `${(slot.y / layout.height) * 100}%`,
              width: `${(slot.w / layout.width) * 100}%`,
              height: `${(slot.h / layout.height) * 100}%`,
            }}
          >
            <canvas
              ref={(el) => {
                slotCanvases.current[i] = el;
              }}
              width={SLOT_PX}
              height={Math.round((SLOT_PX * slot.h) / slot.w)}
              className="block h-full w-full"
              style={{ filter: liveLook.css }}
            />
            {liveLook.overlay && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: liveLook.overlay, mixBlendMode: liveLook.overlayBlend ?? "normal" }}
              />
            )}
          </div>
        ))}
      </div>
      {/* Frame source for the live slots; never shown, never captured. */}
      <video ref={videoRef} autoPlay playsInline muted aria-hidden className="pointer-events-none absolute size-px opacity-0" />
    </div>
  );
});
