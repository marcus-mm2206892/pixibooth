"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Close, Download } from "pixelarticons/react";
import { canShareFiles, downloadAll, downloadBlob, isTouchDevice, saveFiles, type NamedBlob } from "@/lib/downloads";
import { bump, popIn } from "@/lib/motion";
import { PixelStar } from "./PixelStar";
import { Button, Jp } from "./ui";

/** A finished file plus an object URL for showing it (owned and revoked by the caller). */
export type ViewerItem = NamedBlob & { url: string };

const pad2 = (n: number) => String(n).padStart(2, "0");
/** Swipe this share of the width (or flick faster than this, px/ms) to change photo. */
const SWIPE_DISTANCE = 0.18;
const SWIPE_VELOCITY = 0.45;

/**
 * Full-screen viewer for the session's images: swipe or use the arrows to page
 * through, tap a thumbnail to jump, and save the current one (or all of them).
 * Saving uses the share sheet ("Save Image" → Photos) where the browser allows
 * it; elsewhere on phones the images stay long-pressable for "Save to Photos".
 */
export function PhotoViewer({
  items,
  kind,
  onClose,
}: {
  items: ViewerItem[];
  kind: "photos" | "strip";
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState(0);
  const [saved, setSaved] = useState<Set<number>>(() => new Set());
  // Decided once on open (only ever rendered client-side, after a tap).
  const [longPress] = useState(() => isTouchDevice() && !canShareFiles(items));
  const panel = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLParagraphElement>(null);
  const gesture = useRef<{ x: number; y: number; t: number; axis: "x" | "y" | null } | null>(null);

  const count = items.length;
  const go = useCallback((next: number) => setIndex(Math.max(0, Math.min(count - 1, next))), [count]);

  useEffect(() => {
    popIn(panel.current, 0.94);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === "ArrowRight") go(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, onClose]);

  const markSaved = (indices: number[]) =>
    setSaved((prev) => {
      const next = new Set(prev);
      indices.forEach((i) => next.add(i));
      return next;
    });

  const save = (indices: number[]) => {
    const files = indices.map((i) => items[i]);
    if (longPress) {
      // No share sheet: a download only reaches Files, so point at the long-press too.
      bump(hint.current);
      if (files.length === 1) downloadBlob(files[0].blob, files[0].filename);
      else downloadAll(files);
      return;
    }
    void saveFiles(files).then((outcome) => {
      if (outcome === "shared" || outcome === "downloaded") markSaved(indices);
    });
  };

  // ── Swipe ────────────────────────────────────────────────────────────────
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    gesture.current = { x: e.clientX, y: e.clientY, t: performance.now(), axis: null };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (g.axis !== "x") return;
    const pastEdge = (index === 0 && dx > 0) || (index === count - 1 && dx < 0);
    setDrag(pastEdge ? dx / 3 : dx);
  };
  const onPointerEnd = (e: ReactPointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.axis === "x") {
      const dx = e.clientX - g.x;
      const velocity = dx / Math.max(1, performance.now() - g.t);
      const width = track.current?.clientWidth ?? 1;
      if (dx < -width * SWIPE_DISTANCE || velocity < -SWIPE_VELOCITY) go(index + 1);
      else if (dx > width * SWIPE_DISTANCE || velocity > SWIPE_VELOCITY) go(index - 1);
    }
    setDrag(0);
  };

  const isStrip = kind === "strip";
  const title = isStrip ? "Your photo strip" : "Your photos";
  const jpTitle = isStrip ? "フォトストリップ" : "写真をダウンロード";
  const isSaved = saved.has(index);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-pp-navy/90 px-dots-faint p-6 phone:p-0"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        className="flex h-full max-h-[56rem] w-full max-w-5xl flex-col gap-4 text-white phone:max-h-none phone:gap-3 phone:p-3"
      >
        {/* Header: title, counter, close. */}
        <header className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-label text-sm font-bold tracking-[0.18em] text-pp-blue-light phone:text-[0.65rem]">
              {isStrip ? "2×6 PRINT" : `PHOTO ${pad2(index + 1)} / ${pad2(count)}`} <Jp className="ml-2 opacity-80">{jpTitle}</Jp>
            </p>
            <h2 className="mt-0.5 flex items-center gap-2 font-pixel text-3xl uppercase leading-tight phone:text-xl">
              {title}
              <PixelStar size={22} color="#FFFFFF" />
            </h2>
          </div>
          <Button variant="inverse" size="sm" aria-label="Close" onClick={onClose} faceClassName="px-2.5">
            <Close className="size-6" aria-hidden />
          </Button>
        </header>

        {/* Slides. Horizontal drags page; vertical ones are left to the browser. */}
        <div
          ref={track}
          className="relative min-h-0 flex-1 touch-pan-y overflow-hidden select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <div
            className="flex h-full"
            style={{
              transform: `translateX(calc(${-index * 100}% + ${drag}px))`,
              transition: drag ? "none" : "transform 340ms cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
          >
            {items.map((item, i) => (
              <div
                key={item.filename}
                className="flex h-full w-full shrink-0 items-center justify-center px-16 py-2 phone:px-2"
                aria-hidden={i !== index}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- blob URL, kept long-pressable */}
                <img
                  src={item.url}
                  alt={isStrip ? "Your photo strip" : `Photo ${i + 1} of ${count}`}
                  draggable={false}
                  className={`allow-callout block max-h-full max-w-full bg-white object-contain shadow-[8px_10px_0_rgba(0,0,0,0.35)] ${
                    isStrip ? "" : "border-[6px] border-white phone:border-4"
                  } ${i === index ? "" : "opacity-60"}`}
                />
              </div>
            ))}
          </div>

          {count > 1 && (
            <>
              <Button
                variant="inverse"
                size="md"
                aria-label="Previous photo"
                disabled={index === 0}
                onClick={() => go(index - 1)}
                className="absolute left-0 top-1/2 -translate-y-1/2 disabled:opacity-0 phone:hidden"
                faceClassName="px-2"
              >
                <ChevronLeft className="size-8" aria-hidden />
              </Button>
              <Button
                variant="inverse"
                size="md"
                aria-label="Next photo"
                disabled={index === count - 1}
                onClick={() => go(index + 1)}
                className="absolute right-0 top-1/2 -translate-y-1/2 disabled:opacity-0 phone:hidden"
                faceClassName="px-2"
              >
                <ChevronRight className="size-8" aria-hidden />
              </Button>
            </>
          )}
        </div>

        {/* Thumbnails double as the page dots. */}
        {count > 1 && (
          <div className="flex items-center justify-center gap-3 phone:gap-2" role="tablist" aria-label="Choose a photo">
            <Button
              variant="ghost-inverse"
              size="sm"
              aria-label="Previous photo"
              disabled={index === 0}
              onClick={() => go(index - 1)}
              className="hidden phone:inline-flex"
              faceClassName="px-1"
            >
              <ChevronLeft className="size-6" aria-hidden />
            </Button>
            {items.map((item, i) => (
              <button
                key={item.filename}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Photo ${i + 1}`}
                onClick={() => go(i)}
                className={`relative h-16 w-20 shrink-0 overflow-hidden border-[3px] transition-[opacity,transform] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white phone:h-11 phone:w-14 ${
                  i === index ? "-translate-y-1 border-white" : "border-pp-blue-line/50 opacity-55"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- blob URL thumbnail */}
                <img src={item.url} alt="" draggable={false} className="block h-full w-full object-cover" />
                <span className="absolute left-0 top-0 bg-pp-navy px-1 font-pixel text-[0.6rem] leading-tight text-white">
                  {pad2(i + 1)}
                </span>
                {saved.has(i) && (
                  <span className="absolute bottom-0 right-0 bg-white px-1 font-pixel text-[0.6rem] leading-tight text-pp-navy">
                    ✓
                  </span>
                )}
              </button>
            ))}
            <Button
              variant="ghost-inverse"
              size="sm"
              aria-label="Next photo"
              disabled={index === count - 1}
              onClick={() => go(index + 1)}
              className="hidden phone:inline-flex"
              faceClassName="px-1"
            >
              <ChevronRight className="size-6" aria-hidden />
            </Button>
          </div>
        )}

        {longPress && (
          <p
            ref={hint}
            className="mx-auto flex max-w-xl items-center justify-center gap-2 bg-white px-4 py-2 text-center font-pixel text-base leading-snug text-pp-navy phone:text-sm"
          >
            <PixelStar size={14} color="var(--pp-blue)" />
            Press and hold the {isStrip ? "strip" : "photo"}, then tap “Save to Photos”
          </p>
        )}

        {/* Actions. */}
        <div className="flex flex-wrap items-center justify-center gap-4 pb-1 phone:gap-3">
          <Button variant="inverse" size="lg" onClick={() => save([index])} className="phone:flex-1" faceClassName="phone:min-h-12 phone:text-base">
            <Download className="size-7 phone:size-5" aria-hidden />
            {isSaved ? (
              "Saved!"
            ) : isStrip ? (
              "Save strip"
            ) : (
              <>
                Save<span className="phone:hidden"> photo</span> {pad2(index + 1)}
              </>
            )}
          </Button>
          {count > 1 && (
            <Button
              variant="outline-inverse"
              size="lg"
              onClick={() => save(items.map((_, i) => i))}
              className="phone:flex-1"
              faceClassName="phone:min-h-12 phone:text-base"
            >
              Save all {count}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
