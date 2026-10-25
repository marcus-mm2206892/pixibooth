"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, Camera } from "pixelarticons/react";
import type { FilterId, PhotoSession } from "@/lib/session";
import { ticketNumber } from "@/lib/session";
import { FILTERS, FILTER_ORDER, applyFilter } from "@/lib/filters";
import { getSamplePhotos } from "@/lib/sampleScene";
import { get2d } from "@/lib/canvas";
import { bump } from "@/lib/motion";
import { KioskShell } from "./KioskShell";
import { PixelStar } from "./PixelStar";
import { Button, PixelFrame, ScreenTitle, useEnterAnimation } from "./ui";

/** The same representative sample photo, run through the real export filter. */
function FilterSample({ filter }: { filter: FilterId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const sample = getSamplePhotos()[0];
    canvas.width = sample.width;
    canvas.height = sample.height;
    const ctx = get2d(canvas);
    ctx.drawImage(sample.image, 0, 0);
    applyFilter(ctx, sample.width, sample.height, filter, sample.seed);
  }, [filter]);
  return <canvas ref={ref} aria-hidden className="block aspect-532/390 w-full" />;
}

export function FilterPicker({
  session,
  onSelect,
  onBack,
  onNext,
}: {
  session: PhotoSession;
  onSelect: (f: FilterId) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const root = useEnterAnimation<HTMLDivElement>();
  const cards = useRef<Record<string, HTMLButtonElement | null>>({});
  const filter = session.filter;

  return (
    <KioskShell rootRef={root} step={2} ticket={ticketNumber(session)}>
      <div data-enter className="flex shrink-0 items-end justify-between gap-4">
        <ScreenTitle label="02 / FILTER" title="Pick a filter" />
        <Button variant="ghost" size="md" onClick={onBack}>
          <ArrowLeft className="size-5" aria-hidden />
          Back
        </Button>
      </div>
      <p data-enter className="mt-1 text-pp-ink/75">
        Optional. Applied to all four photos, and you can still change it after shooting.
      </p>

      <div className="fit-box flex flex-1 items-center justify-center px-1 py-4">
        <div role="radiogroup" aria-label="Photo filter" className="filter-grid">
          {FILTER_ORDER.map((f) => {
            const selected = f === filter;
            const info = FILTERS[f];
            return (
              <button
                key={f}
                ref={(el) => {
                  cards.current[f] = el;
                }}
                data-enter
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  onSelect(f);
                  bump(cards.current[f]);
                }}
                className="text-left focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-pp-blue-dark"
              >
                <PixelFrame
                  edge={selected ? "bg-pp-blue" : "bg-pp-blue-line"}
                  fill={selected ? "bg-pp-blue-soft" : "bg-white"}
                  border={selected ? 4 : 2}
                  innerClassName="flex flex-col gap-2.5 p-2.5"
                >
                  <div className="relative">
                    <FilterSample filter={f} />
                    {selected && (
                      <span className="absolute left-2 top-2 bg-pp-blue px-2 py-0.5 font-pixel text-xs tracking-widest text-white">
                        ★ SELECTED
                      </span>
                    )}
                  </div>
                  <span className="flex items-start justify-between gap-2 px-1">
                    <span className="min-w-0">
                      <span className="block truncate font-display text-xl font-bold uppercase leading-tight tracking-wide text-pp-blue">
                        {info.label}
                      </span>
                      <span className="block truncate text-sm leading-snug text-pp-ink/75">{info.description}</span>
                    </span>
                    {selected && <PixelStar size={20} color="var(--pp-blue)" className="mt-1" />}
                  </span>
                </PixelFrame>
              </button>
            );
          })}
        </div>
      </div>

      <div data-enter className="flex shrink-0 justify-end pt-1">
        <Button size="xl" onClick={onNext}>
          <Camera className="size-8" aria-hidden />
          Continue to camera
        </Button>
      </div>
    </KioskShell>
  );
}
