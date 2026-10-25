"use client";

import { useRef } from "react";
import { ArrowLeft, ArrowRight } from "pixelarticons/react";
import type { PhotoSession, TemplateColor } from "@/lib/session";
import { ticketNumber } from "@/lib/session";
import { TEMPLATES, TEMPLATE_ORDER } from "@/lib/photostrip";
import { bump } from "@/lib/motion";
import { PhotostripPreview } from "./PhotostripPreview";
import { KioskShell } from "./KioskShell";
import { PixelStar } from "./PixelStar";
import { Button, PixelFrame, PixelTag, ScreenTitle, useEnterAnimation } from "./ui";

export function TemplatePicker({
  session,
  onSelect,
  onBack,
  onNext,
}: {
  session: PhotoSession;
  onSelect: (t: TemplateColor) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const root = useEnterAnimation<HTMLDivElement>();
  const cards = useRef<Record<string, HTMLButtonElement | null>>({});
  const template = session.template;

  return (
    <KioskShell rootRef={root} step={1} ticket={ticketNumber(session)}>
      <div data-enter className="flex shrink-0 items-end justify-between gap-4">
        <ScreenTitle label="01 / SELECT" title="Choose your strip" />
        <Button variant="ghost" size="md" onClick={onBack}>
          <ArrowLeft className="size-5" aria-hidden />
          Back
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 gap-6 py-4">
        {/* Larger selected preview on landscape screens. */}
        <div data-enter className="hidden min-h-0 w-[24%] flex-col items-center gap-3 landscape:flex">
          <PixelFrame edge="bg-pp-blue-line" fill="bg-pp-blue-soft" border={2} className="min-h-0 w-full flex-1" innerClassName="fit-box flex items-center justify-center p-4">
            <div className="fit-strip">
              <PhotostripPreview photos="sample" template={template} filter="none" date={session.createdAt} width={360} />
            </div>
          </PixelFrame>
          <PixelTag>
            <PixelStar size={12} /> {TEMPLATES[template].label.toUpperCase()}
          </PixelTag>
        </div>

        <div
          role="radiogroup"
          aria-label="Strip color"
          className="grid min-h-0 flex-1 grid-cols-4 grid-rows-2 gap-3 sm:gap-4"
        >
          {TEMPLATE_ORDER.map((t) => {
            const selected = t === template;
            return (
              <button
                key={t}
                ref={(el) => {
                  cards.current[t] = el;
                }}
                data-enter
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={TEMPLATES[t].label}
                onClick={() => {
                  onSelect(t);
                  bump(cards.current[t]);
                }}
                className="min-h-0 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-pp-blue-dark"
              >
                <PixelFrame
                  edge={selected ? "bg-pp-blue" : "bg-pp-blue-line"}
                  fill={selected ? "bg-pp-blue-soft" : "bg-white"}
                  border={selected ? 4 : 2}
                  className="h-full"
                  innerClassName="relative flex flex-col items-center gap-2 p-2 sm:p-3"
                >
                  {selected && (
                    <span className="absolute right-1.5 top-1.5 z-10">
                      <PixelStar variant="duo" size={22} color="var(--pp-blue)" accent="#FFFFFF" />
                    </span>
                  )}
                  <div className="fit-box flex w-full flex-1 items-center justify-center">
                    <div className="fit-strip">
                      <PhotostripPreview photos="sample" template={t} filter="none" date={session.createdAt} width={180} />
                    </div>
                  </div>
                  <span className="flex w-full items-center justify-center gap-1.5">
                    <span
                      className="size-3.5 shrink-0 ring-1 ring-pp-blue/30"
                      style={{ background: TEMPLATES[t].background }}
                      aria-hidden
                    />
                    <span className="truncate font-display text-base font-bold uppercase tracking-wide text-pp-ink sm:text-lg">
                      {TEMPLATES[t].label}
                    </span>
                  </span>
                  <span className={`font-pixel text-[11px] tracking-widest ${selected ? "text-pp-blue" : "invisible"}`}>
                    ★ SELECTED
                  </span>
                </PixelFrame>
              </button>
            );
          })}
        </div>
      </div>

      <div data-enter className="flex shrink-0 justify-end pt-1">
        <Button size="xl" onClick={onNext}>
          Next: choose filter
          <ArrowRight className="size-8" aria-hidden />
        </Button>
      </div>
    </KioskShell>
  );
}
