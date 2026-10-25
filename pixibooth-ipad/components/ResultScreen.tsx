"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Download, Expand, Share } from "pixelarticons/react";
import type { FilterId, PhotoSession, TemplateColor } from "@/lib/session";
import { stripDate, ticketNumber } from "@/lib/session";
import { STRIP, TEMPLATES, TEMPLATE_ORDER } from "@/lib/photostrip";
import { FILTERS, FILTER_ORDER } from "@/lib/filters";
import { PhotostripPreview } from "./PhotostripPreview";
import { FilteredPhoto } from "./FilteredPhoto";
import { ImageViewer } from "./ImageViewer";
import { KioskShell } from "./KioskShell";
import { PixelStar } from "./PixelStar";
import { StarCelebration } from "./StarCelebration";
import { useSessionExports } from "./useSessionExports";
import { Button, Chip, PixelFrame, RegMarks, ScreenTitle, useEnterAnimation } from "./ui";

/** The printed strip on a blue-white "ID card" backdrop (backdrop is UI only, never exported). */
export function StripCard({ session, celebrate = false }: { session: PhotoSession; celebrate?: boolean }) {
  return (
    <PixelFrame
      edge="bg-pp-blue-line"
      fill="bg-pp-blue-soft"
      border={2}
      className="h-full w-full"
      innerClassName="relative flex flex-col items-center gap-3 px-6 pb-5 pt-4"
    >
      <RegMarks />
      <p className="flex w-full items-center justify-between font-pixel text-xs tracking-widest text-pp-blue">
        <span>NO. {ticketNumber(session)}</span>
        <span>2×6 PRINT</span>
      </p>
      <div className="fit-box relative flex w-full flex-1 items-center justify-center">
        {celebrate && <StarCelebration />}
        <div className="fit-strip drop-shadow-[5px_6px_0_rgba(10,45,105,0.35)]">
          <PhotostripPreview
            photos={session.photos}
            template={session.template}
            filter={session.filter}
            date={session.createdAt}
          />
        </div>
      </div>
      <p className="font-pixel text-xs tracking-widest text-pp-blue/80">{stripDate(new Date(session.createdAt))}</p>
    </PixelFrame>
  );
}

export function ResultScreen({
  session,
  onTemplate,
  onFilter,
  onBack,
  onFinish,
}: {
  session: PhotoSession;
  onTemplate: (t: TemplateColor) => void;
  onFilter: (f: FilterId) => void;
  onBack: () => void;
  onFinish: () => void;
}) {
  const root = useEnterAnimation<HTMLDivElement>();
  const exports = useSessionExports(session);
  const [viewing, setViewing] = useState(false);
  const { photos, template, filter } = session;

  return (
    <KioskShell rootRef={root} step={4} ticket={ticketNumber(session)}>
      <div className="flex min-h-0 flex-1 flex-col gap-5 sm:flex-row sm:gap-8">
        <div data-enter className="flex min-h-56 flex-1 sm:max-w-[38%]">
          <StripCard session={session} celebrate />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 pb-2 pt-1">
          <div data-enter>
            <ScreenTitle label="04 / KEEP" title="Your strip" />
          </div>

          <section data-enter>
            <h2 className="mb-2 font-pixel text-sm tracking-[0.2em] text-pp-blue">STRIP COLOR</h2>
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Strip color">
              {TEMPLATE_ORDER.map((t) => {
                const selected = t === template;
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onTemplate(t)}
                    className="min-h-12 text-left focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-pp-blue-dark"
                  >
                    <PixelFrame
                      edge={selected ? "bg-pp-blue" : "bg-pp-blue-line"}
                      border={selected ? 3 : 2}
                      step={3}
                      className="h-full"
                      innerClassName={`flex items-center gap-2 px-2 py-2 ${selected ? "bg-pp-blue-soft" : ""}`}
                    >
                      <span
                        className="flex size-6 shrink-0 items-center justify-center ring-1 ring-pp-blue/25"
                        style={{ background: TEMPLATES[t].background, color: TEMPLATES[t].logo === "white" ? "#fff" : "#111" }}
                        aria-hidden
                      >
                        {selected && <PixelStar size={12} />}
                      </span>
                      <span className="truncate font-display text-sm font-bold uppercase leading-tight tracking-wide text-pp-ink">
                        {TEMPLATES[t].label}
                      </span>
                    </PixelFrame>
                  </button>
                );
              })}
            </div>
          </section>

          <section data-enter>
            <h2 className="mb-2 font-pixel text-sm tracking-[0.2em] text-pp-blue">FILTER</h2>
            <div className="flex flex-wrap gap-x-2.5 gap-y-3.5" role="radiogroup" aria-label="Filter">
              {FILTER_ORDER.map((f) => (
                <Chip key={f} selected={f === filter} onClick={() => onFilter(f)}>
                  {FILTERS[f].label}
                </Chip>
              ))}
            </div>
          </section>

          <section data-enter className="flex flex-col gap-4">
            <Button size="xl" className="w-full" disabled={!exports.stripFile} onClick={onFinish}>
              Finish &amp; view QR
              <ArrowRight className="size-8" aria-hidden />
            </Button>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" size="md" disabled={!exports.stripFile} onClick={exports.saveStrip}>
                {exports.touchShare ? <Share className="size-5" aria-hidden /> : <Download className="size-5" aria-hidden />}
                {exports.touchShare ? "Save photo strip" : "Download photo strip"}
              </Button>
              {exports.touchShare && (
                <Button variant="secondary" size="md" disabled={!exports.stripFile} onClick={exports.downloadStrip}>
                  <Download className="size-5" aria-hidden />
                  Download
                </Button>
              )}
              <Button variant="secondary" size="md" disabled={!exports.stripFile} onClick={() => setViewing(true)}>
                <Expand className="size-5" aria-hidden />
                View
              </Button>
            </div>
            <p className="font-pixel text-xs tracking-wider text-pp-ink/70">
              PNG · {STRIP.width} × {STRIP.height} PX · 2×6 IN AT 300 PPI
              {exports.saved === "strip" && <span className="ml-2 text-pp-blue">★ SAVED</span>}
            </p>
          </section>

          <section data-enter>
            <h2 className="mb-2 font-pixel text-sm tracking-[0.2em] text-pp-blue">INDIVIDUAL PHOTOS</h2>
            <div className="grid grid-cols-4 gap-3">
              {photos.map((photo, i) =>
                photo ? (
                  <div key={photo.id} className="flex flex-col gap-2.5">
                    <div className="aspect-532/390 overflow-hidden border-2 border-pp-blue">
                      <FilteredPhoto photo={photo} filter={filter} width={260} alt={`Photo ${i + 1}`} />
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!exports.photoFiles}
                      aria-label={`${exports.touchShare ? "Save" : "Download"} photo ${i + 1}`}
                      onClick={() => exports.savePhoto(i)}
                    >
                      {exports.saved === `photo-${i}` ? (
                        <Check className="size-4" aria-hidden />
                      ) : (
                        <Download className="size-4" aria-hidden />
                      )}
                      {String(i + 1).padStart(2, "0")}
                    </Button>
                  </div>
                ) : null,
              )}
            </div>
          </section>

          <div data-enter>
            <Button variant="ghost" size="md" onClick={onBack}>
              <ArrowLeft className="size-5" aria-hidden />
              Back to photos
            </Button>
          </div>
        </div>
      </div>

      {viewing && exports.stripFile && (
        <ImageViewer file={exports.stripFile} touch={exports.touchShare} onClose={() => setViewing(false)} />
      )}
    </KioskShell>
  );
}
