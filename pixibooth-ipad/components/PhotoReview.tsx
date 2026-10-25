"use client";

import { useState } from "react";
import { ArrowRight, Undo } from "pixelarticons/react";
import type { PhotoSession } from "@/lib/session";
import { SHOT_COUNT, ticketNumber } from "@/lib/session";
import { FilteredPhoto } from "./FilteredPhoto";
import { KioskShell } from "./KioskShell";
import { Button, ConfirmDialog, PixelFrame, ScreenTitle, useEnterAnimation } from "./ui";

const pad2 = (n: number) => String(n).padStart(2, "0");

export function PhotoReview({
  session,
  onRetake,
  onRetakeAll,
  onContinue,
}: {
  session: PhotoSession;
  onRetake: (index: number) => void;
  onRetakeAll: () => void;
  onContinue: () => void;
}) {
  const root = useEnterAnimation<HTMLDivElement>();
  const [confirmAll, setConfirmAll] = useState(false);

  return (
    <KioskShell rootRef={root} step={3} ticket={ticketNumber(session)}>
      <div data-enter className="shrink-0">
        <ScreenTitle label="03 / REVIEW" title="Look at these!" />
      </div>

      <div className="fit-box flex flex-1 items-center justify-center py-4">
        {/* 2×2 contact sheet of slot-shaped tiles; the grid itself keeps the slot aspect. */}
        <div className="fit-slot grid grid-cols-2 grid-rows-2 gap-4">
          {session.photos.map((photo, i) =>
            photo ? (
              <div key={photo.id} data-enter className="px-shadow-light min-h-0">
                <PixelFrame edge="bg-pp-blue" border={4} className="h-full" innerClassName="relative">
                  <FilteredPhoto photo={photo} filter={session.filter} width={800} alt={`Photo ${i + 1} of ${SHOT_COUNT}`} />
                  <span className="absolute left-0 top-0 bg-pp-blue px-2.5 py-1 font-pixel text-sm tracking-widest text-white">
                    {pad2(i + 1)} / {pad2(SHOT_COUNT)}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute bottom-3 right-3"
                    onClick={() => onRetake(i)}
                    aria-label={`Retake photo ${i + 1}`}
                  >
                    <Undo className="size-5" aria-hidden />
                    Retake {pad2(i + 1)}
                  </Button>
                </PixelFrame>
              </div>
            ) : (
              <div key={`empty-${i}`} className="border-2 border-dashed border-pp-blue-line" />
            ),
          )}
        </div>
      </div>

      <div data-enter className="flex shrink-0 flex-wrap items-center justify-between gap-4 pt-1">
        <Button variant="secondary" size="lg" onClick={() => setConfirmAll(true)}>
          <Undo className="size-6" aria-hidden />
          Retake all
        </Button>
        <Button size="xl" onClick={onContinue}>
          Looks good — see strip
          <ArrowRight className="size-8" aria-hidden />
        </Button>
      </div>

      <ConfirmDialog
        open={confirmAll}
        title="Retake all four?"
        body="All four photos will be deleted and you'll pose again. Your strip color and filter stay the same."
        confirmLabel="Retake all"
        cancelLabel="Keep these"
        onCancel={() => setConfirmAll(false)}
        onConfirm={() => {
          setConfirmAll(false);
          onRetakeAll();
        }}
      />
    </KioskShell>
  );
}
