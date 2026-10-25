"use client";

import { useEffect, useRef } from "react";
import { ArrowRight } from "pixelarticons/react";
import { riseIn } from "@/lib/motion";
import { PhotostripPreview } from "./PhotostripPreview";
import { KioskShell, STEPS_JA } from "./KioskShell";
import { PixelStar } from "./PixelStar";
import { Button, Jp, PixelFrame, RegMarks, useEnterAnimation } from "./ui";

const TICKET = ["01 / STRIP", "02 / FILTER", "03 / SNAP", "04 / KEEP"];

export function WelcomeScreen({ onStart }: { onStart: () => void }) {
  const root = useEnterAnimation<HTMLDivElement>();
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const a = riseIn(strip.current, 250);
    return () => {
      a?.revert();
    };
  }, []);

  return (
    <KioskShell rootRef={root}>
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-6 landscape:grid-cols-[1.15fr_1fr] landscape:grid-rows-1 landscape:gap-10">
        <section className="relative flex flex-col justify-center px-2 py-4 sm:px-6">
          <p data-enter className="flex items-center gap-2 font-label text-lg font-bold tracking-[0.18em] text-pp-blue">
            <PixelStar size={16} color="var(--pp-blue)" />
            4-CUT MEMORY BOOTH
            <Jp className="ml-2 opacity-80">4カット写真</Jp>
          </p>
          <h1
            data-enter
            className="mt-4 font-pixel text-5xl uppercase leading-[1.08] text-pp-navy sm:text-6xl lg:text-7xl"
          >
            Your little moment, in four frames
          </h1>
          <p data-enter className="mt-5 font-pixel text-lg tracking-wider text-pp-ink">
            4 PHOTOS · 1 STRIP · LOTS OF MEMORIES
          </p>
          <div data-enter className="mt-9">
            <Button size="xl" onClick={onStart}>
              Start photo session
              <ArrowRight className="size-8" aria-hidden />
            </Button>
            <p className="mt-3 font-pixel text-sm text-pp-blue">
              <Jp>ようこそ！タップしてスタート</Jp>
            </p>
          </div>
          <p data-enter className="mt-6 max-w-md text-sm text-pp-ink/75">
            Photos stay on this device for your session only. Nothing is uploaded.
          </p>
        </section>

        <section data-enter className="relative min-h-0">
          <PixelFrame
            edge="bg-pp-blue"
            fill="bg-pp-navy"
            border={4}
            step={6}
            className="h-full"
            innerClassName="relative overflow-hidden"
          >
            <PixelStar
              color="rgba(24,84,184,0.45)"
              size="112%"
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            />
            <PixelStar variant="sparkle" size={22} color="#FFFFFF" className="absolute left-[12%] top-[14%]" />
            <PixelStar variant="sparkle" size={14} color="#FFFFFF" className="absolute bottom-[18%] right-[10%]" />
            <PixelStar
              variant="duo"
              size={42}
              color="#FFFFFF"
              accent="var(--pp-navy)"
              className="absolute right-[9%] top-[9%]"
            />
            <RegMarks className="border-white/50" />
            <div className="fit-box absolute inset-[7%] flex items-center justify-center">
              <div ref={strip} className="fit-strip -rotate-3 drop-shadow-[6px_8px_0_rgba(0,0,0,0.45)]">
                <PhotostripPreview photos="sample" template="white" filter="none" width={300} />
              </div>
            </div>
          </PixelFrame>
        </section>
      </div>

      <div data-enter className="mt-5 shrink-0">
        <PixelFrame
          edge="bg-pp-navy"
          border={2}
          step={3}
          innerClassName="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2.5"
        >
          {TICKET.map((t, i) => (
            <span key={t} className="flex items-center gap-4 font-pixel text-sm tracking-widest text-pp-navy sm:text-base">
              <span>
                {t} <Jp className="ml-1 opacity-75">{STEPS_JA[i]}</Jp>
              </span>
              {i < TICKET.length - 1 && <ArrowRight className="size-4 text-pp-blue-line" aria-hidden />}
            </span>
          ))}
        </PixelFrame>
      </div>
    </KioskShell>
  );
}
