"use client";

import { useState } from "react";
import { ArrowRight, Check, Reload, Undo } from "pixelarticons/react";
import type { PhotoSession } from "@/lib/session";
import { MAX_RETAKES, stripDate, ticketNumber } from "@/lib/session";
import { FilteredPhoto } from "./FilteredPhoto";
import { KioskShell } from "./KioskShell";
import { MockQr } from "./MockQr";
import { PhotostripPreview } from "./PhotostripPreview";
import { PixelStar } from "./PixelStar";
import { StarCelebration } from "./StarCelebration";
import { Button, ConfirmDialog, Jp, PixelFrame, RegMarks, useEnterAnimation } from "./ui";

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Step 3, the last screen of the session. Left: the finished strip plus one
 * optional single-photo retake. Right: QR, Finish and New Session.
 */
export function KeepScreen({
  session,
  onRetake,
  onFinish,
  onNewSession,
}: {
  session: PhotoSession;
  onRetake: (index: number) => void;
  onFinish: () => void;
  onNewSession: () => void;
}) {
  const root = useEnterAnimation<HTMLDivElement>();
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const retakesLeft = Math.max(0, MAX_RETAKES - session.retakesUsed);

  return (
    <KioskShell rootRef={root} step={3} ticket={ticketNumber(session)}>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-6 landscape:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] landscape:grid-rows-1 landscape:gap-8">
        {/* Left panel: the strip and the one-time retake. */}
        <section data-enter className="flex min-h-0">
          <PixelFrame
            edge="bg-pp-blue-line"
            fill="bg-pp-blue-soft"
            border={2}
            className="w-full"
            innerClassName="relative grid min-h-0 grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] gap-6 p-5"
          >
            <RegMarks />
            <div className="flex min-h-0 flex-col items-center gap-2">
              <p className="flex w-full items-center justify-between font-label text-sm font-bold tracking-[0.18em] text-pp-navy">
                <span>NO. {ticketNumber(session)}</span>
                <span>2×6 PRINT</span>
              </p>
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
              <p className="font-pixel text-xs text-pp-navy/80">{stripDate(new Date(session.createdAt))}</p>
            </div>

            {/* One retake: pick a single photo, then confirm with one button. */}
            <div className="flex min-h-0 flex-col gap-3">
              <div>
                <p className="flex items-center gap-2 font-label text-lg font-bold uppercase tracking-[0.18em] text-pp-blue">
                  <Reload className="size-5" aria-hidden />
                  {retakesLeft > 0 ? `${retakesLeft} retake left` : "Retake used"}
                </p>
                <p className="mt-1 text-base leading-snug text-pp-ink">
                  {retakesLeft > 0 ? (
                    <>
                      Not happy with a photo? Choose <strong className="text-pp-blue">one</strong> to redo.
                    </>
                  ) : (
                    "Your strip is final. Looking good!"
                  )}{" "}
                  <Jp className="text-pp-blue">{retakesLeft > 0 ? "撮り直しは1枚だけ" : "撮り直し済み"}</Jp>
                </p>
              </div>
              <div className="fit-box flex flex-1 items-center justify-center">
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
                        className={`relative min-h-0 overflow-hidden border-[3px] transition-[box-shadow,opacity] disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-pp-navy ${
                          chosen
                            ? "border-pp-blue shadow-[0_0_0_4px_var(--pp-blue-light)]"
                            : selected !== null
                              ? "border-pp-navy opacity-55"
                              : "border-pp-navy"
                        }`}
                      >
                        <FilteredPhoto photo={photo} filter={session.filter} width={360} alt="" />
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

        {/* Right panel: QR, finish, new session. */}
        <section className="flex min-h-0 flex-col items-center justify-center gap-4 text-center">
          <div data-enter>
            <p className="font-label text-base font-bold tracking-[0.18em] text-pp-blue">
              03 / KEEP <Jp className="ml-2 opacity-80">完成！</Jp>
            </p>
            <h1 className="mt-1 flex items-center justify-center gap-3 font-pixel text-3xl uppercase leading-tight text-pp-navy sm:text-4xl">
              Your strip is ready
              <PixelStar size={26} color="var(--pp-blue)" />
            </h1>
          </div>

          {/* QR above the buttons in landscape; side by side in portrait. */}
          <div className="flex w-full flex-col items-center gap-4 portrait:flex-row portrait:justify-center portrait:gap-8">
          <div data-enter className="flex flex-col items-center gap-3">
            <div className="px-shadow">
              <PixelFrame edge="bg-pp-navy" border={6} step={6} innerClassName="relative p-3">
                <MockQr seed={session.id} className="w-[clamp(180px,min(38vh,30vw),300px)] portrait:w-[min(22vh,36vw,240px)]" />
              </PixelFrame>
            </div>
            <div>
              <p className="font-pixel text-lg uppercase text-pp-navy">Scan to download your photos here</p>
              <Jp className="text-sm text-pp-blue">写真のダウンロードはこちら</Jp>
            </div>
          </div>

          <div data-enter className="flex w-full max-w-sm flex-col gap-4 portrait:max-w-xs">
            <Button size="xl" className="w-full" onClick={onFinish}>
              Finish
              <ArrowRight className="size-8" aria-hidden />
            </Button>
            <Button variant="secondary" size="md" className="w-full" onClick={() => setConfirmNew(true)}>
              <Reload className="size-5" aria-hidden />
              Start new session
            </Button>
          </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirmNew}
        title="Start a new session?"
        body="This strip and all four photos will be cleared from this device."
        confirmLabel="Clear & start new"
        cancelLabel="Not yet"
        onCancel={() => setConfirmNew(false)}
        onConfirm={() => {
          setConfirmNew(false);
          onNewSession();
        }}
      />
    </KioskShell>
  );
}
