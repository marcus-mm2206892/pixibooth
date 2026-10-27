"use client";

import { useEffect, useRef } from "react";
import type { CapturedPhoto, FilterId } from "@/lib/session";
import { SHOT_COUNT } from "@/lib/session";
import { popIn } from "@/lib/motion";
import { FilteredPhoto } from "./FilteredPhoto";
import { PixelStar } from "./PixelStar";

function SlotThumb({
  photo,
  index,
  filter,
  active,
}: {
  photo: CapturedPhoto | null;
  index: number;
  filter: FilterId;
  active: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const star = useRef<HTMLSpanElement>(null);
  const shownId = useRef(photo?.id);

  useEffect(() => {
    if (photo && photo.id !== shownId.current) {
      popIn(ref.current, 1.25);
      popIn(star.current, 2.2);
    }
    shownId.current = photo?.id;
  }, [photo]);

  const n = String(index + 1).padStart(2, "0");
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        ref={ref}
        className={`relative aspect-532/390 w-full overflow-hidden ${
          photo ? "border-[3px] border-pp-blue-deep" : active ? "border-[3px] border-pp-blue-deep animate-px-blink" : "border-2 border-dashed border-pp-blue-deep/70"
        }`}
      >
        {photo ? (
          <FilteredPhoto photo={photo} filter={filter} width={360} alt={`Photo ${index + 1}`} />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-helvetica text-[clamp(1.1rem,2.8vh,1.6rem)] text-pp-blue-deep/60">{n}</div>
        )}
      </div>
      <span
        ref={star}
        className={`flex items-center gap-1 font-helvetica text-sm ${photo || active ? "text-pp-blue-deep" : "text-pp-blue-deep/70"}`}
      >
        <PixelStar variant={photo ? "solid" : "outline"} size={11} color="currentColor" />
        {n} / {String(SHOT_COUNT).padStart(2, "0")}
      </span>
    </div>
  );
}

export function CaptureProgress({
  photos,
  filter,
  activeSlot,
}: {
  photos: Array<CapturedPhoto | null>;
  filter: FilterId;
  activeSlot: number | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5" aria-label="Photos taken">
      {photos.map((photo, i) => (
        <SlotThumb key={i} photo={photo} index={i} filter={filter} active={activeSlot === i} />
      ))}
    </div>
  );
}
