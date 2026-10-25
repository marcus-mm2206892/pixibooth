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
          photo ? "border-[3px] border-white" : active ? "border-[3px] border-white animate-px-blink" : "border-2 border-dashed border-white/40"
        }`}
      >
        {photo ? (
          <FilteredPhoto photo={photo} filter={filter} width={240} alt={`Photo ${index + 1}`} />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-pixel text-lg text-white/50">{n}</div>
        )}
      </div>
      <span
        ref={star}
        className={`flex items-center gap-1 font-pixel text-xs tracking-wider ${photo || active ? "text-white" : "text-white/50"}`}
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
    <div className="grid grid-cols-4 gap-2.5" aria-label="Photos taken">
      {photos.map((photo, i) => (
        <SlotThumb key={i} photo={photo} index={i} filter={filter} active={activeSlot === i} />
      ))}
    </div>
  );
}
