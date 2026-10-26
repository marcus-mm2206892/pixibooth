"use client";

import { useState } from "react";
import { ArrowRight, Check, Undo } from "pixelarticons/react";
import type { PhotoSession } from "@/lib/session";
import { MAX_RETAKES, ticketNumber } from "@/lib/session";
import { FilteredPhoto } from "./FilteredPhoto";
import { KioskShell } from "./KioskShell";
import { MockQr } from "./MockQr";
import { PhotostripPreview } from "./PhotostripPreview";
import { PixelStar } from "./PixelStar";
import { StarCelebration } from "./StarCelebration";
import { Button, Jp, PixelFrame, RegMarks, useEnterAnimation } from "./ui";

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Step 3, the last screen of the session. Left: the finished strip plus one
 * optional single-photo retake. Right: QR and Finish. Both panels are framed
 * at the same height so their edges line up.
 */
export function KeepScreen({
  session,
  onRetake,
  onFinish,
}: {
  session: PhotoSession;
  onRetake: (index: number) => void;
  onFinish: () => void;
}) {
  const root = useEnterAnimation<HTMLDivElement>();
  const [selected, setSelected] = useState<number | null>(null);
  const retakesLeft = Math.max(0, MAX_RETAKES - session.retakesUsed);

  return (
    <KioskShell rootRef={root} step={3} ticket={ticketNumber(session)}>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-5 landscape:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] landscape:grid-rows-1 landscape:gap-6">
        {/* Left panel: the strip and the one-time retake. */}
        <section data-enter className="flex min-h-0">
          <PixelFrame
            edge="bg-pp-blue-line"
            fill="bg-pp-blue-soft"
            border={2}
            className="w-full"
            innerClassName="relative grid min-h-0 grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] grid-rows-[auto_minmax(0,1fr)] gap-x-6 gap-y-4 p-4"
          >
            <RegMarks />

            {/* The one rule, impossible to miss. */}
            <div
              className={`col-span-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-center ${
                retakesLeft > 0 ? "bg-pp-navy text-white" : "bg-pp-blue-light text-pp-navy"
              }`}
            >
              <PixelStar size={18} color={retakesLeft > 0 ? "#FFFFFF" : "var(--pp-navy)"} />
              <p className="font-pixel text-xl uppercase leading-tight">
                {retakesLeft > 0 ? (
                  <>
                    You may only retake <span className="bg-white px-1.5 text-pp-navy">one frame</span>
                  </>
                ) : (
                  "Retake used · your strip is final"
                )}
              </p>
              <Jp className="text-base opacity-80">{retakesLeft > 0 ? "撮り直しは1枚だけ" : "撮り直し済み"}</Jp>
            </div>

            <div className="flex min-h-0 flex-col items-center gap-2">
              <div className="fit-box relative flex w-full flex-1 items-center justify-center">
                <StarCelebration />
                <div className="fit-strip drop-shadow-[5px_6px_0_rgba(10,45,105,0.35)]">
                  <PhotostripPreview
                    photos={session.photos}
                    template={session.template}
                    filter={session.filter}
                    date={session.createdAt}
                  />
                </div>
              </div>
              <p className="font-label text-sm font-bold tracking-[0.18em] text-pp-navy">
                NO. {ticketNumber(session)} · 2×6 PRINT
              </p>
            </div>

            {/* Pick a single photo, then confirm with one button. */}
            <div className="flex min-h-0 flex-col gap-3">
              <p className="text-base leading-snug text-pp-ink">
                {retakesLeft > 0
                  ? "Not happy with a photo? Tap the one you want to redo, then press Retake."
                  : "All four photos are kept. Looking good!"}
              </p>
              <div className="fit-box flex flex-1 items-start justify-center">
                <div role="radiogroup" aria-label="Choose one photo to retake" className="fit-slot grid grid-cols-2 grid-rows-2 gap-3">
                  {session.photos.map((photo, i) => {
                    if (!photo) return null;
                    const chosen = selected === i;
                    return (
                      <button
                        key={photo.id}
                        type="button"
                        role="radio"
                        aria-checked={chosen}
                        aria-label={`Photo ${i + 1}`}
                        disabled={retakesLeft === 0}
                        onClick={() => setSelected(chosen ? null : i)}
                        className={`relative min-h-0 border-[3px] transition-opacity disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-pp-navy ${
                          chosen ? "border-pp-blue" : selected !== null ? "border-pp-navy opacity-55" : "border-pp-navy"
                        }`}
                      >
                        <span className="block h-full w-full overflow-hidden">
                          <FilteredPhoto photo={photo} filter={session.filter} width={360} alt="" />
                        </span>
                        {chosen && (
                          <span aria-hidden className="animate-arcade pointer-events-none absolute -inset-2 border-4 border-pp-blue" />
                        )}
                        <span className="absolute left-0 top-0 bg-pp-navy px-2 py-0.5 font-pixel text-sm text-white">
                          {pad2(i + 1)}
                        </span>
                        {chosen && (
                          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-pp-blue/90 py-1.5 font-pixel text-sm text-white">
                            <Undo className="size-4" aria-hidden />
                            RETAKE THIS ONE
                          </span>
                        )}
                        {retakesLeft === 0 && (
                          <span className="absolute bottom-1 right-1 flex items-center gap-1 bg-white/90 px-1.5 font-pixel text-xs text-pp-navy">
                            <Check className="size-3.5" aria-hidden />
                            KEPT
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              {retakesLeft > 0 && (
                <Button
                  size="lg"
                  className="w-full"
                  disabled={selected === null}
                  onClick={() => selected !== null && onRetake(selected)}
                >
                  <Undo className="size-6" aria-hidden />
                  {selected === null ? "Tap a photo to choose" : `Retake photo ${pad2(selected + 1)}`}
                </Button>
              )}
            </div>
          </PixelFrame>
        </section>

        {/* Right panel: QR and Finish, same height as the left panel. */}
        <section data-enter className="flex min-h-0">
          <PixelFrame
            edge="bg-pp-blue-line"
            border={2}
            className="w-full"
            innerClassName="relative flex min-h-0 flex-col items-center justify-center gap-4 p-5 text-center portrait:flex-row portrait:flex-wrap portrait:gap-x-8"
          >
            <RegMarks />
            <div className="portrait:w-full">
              <p className="font-label text-base font-bold tracking-[0.18em] text-pp-blue">
                03 / KEEP <Jp className="ml-2 opacity-80">完成！</Jp>
              </p>
              <h1 className="mt-1 flex items-center justify-center gap-3 font-pixel text-3xl uppercase leading-tight text-pp-navy short:text-2xl">
                Your strip is ready
                <PixelStar size={24} color="var(--pp-blue)" />
              </h1>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="px-shadow">
                <PixelFrame edge="bg-pp-navy" border={6} step={6} innerClassName="relative p-3">
                  <MockQr
                    seed={session.id}
                    className="w-[clamp(170px,min(36vh,28vw),300px)] portrait:w-[min(20vh,34vw,230px)]"
                  />
                </PixelFrame>
              </div>
              <p className="font-pixel text-lg uppercase text-pp-navy">Scan to download your photos here</p>
              <Jp className="text-sm text-pp-blue">写真のダウンロードはこちら</Jp>
            </div>

            <Button size="xl" className="w-full max-w-sm portrait:w-auto" onClick={onFinish}>
              <span className="animate-arcade-soft">Finish</span>
              <ArrowRight className="size-8" aria-hidden />
            </Button>
          </PixelFrame>
        </section>
      </div>
    </KioskShell>
  );
}
