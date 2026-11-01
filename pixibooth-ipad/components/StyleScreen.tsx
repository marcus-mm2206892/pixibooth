"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, Reload } from "pixelarticons/react";
import type { BoothEngine, BoothState } from "@/lib/boothEngine";
import type { FilterId } from "@/lib/session";
import { TIMING, ticketNumber } from "@/lib/session";
import { FILTERS, FILTER_ORDER } from "@/lib/filters";
import { TEMPLATES, TEMPLATE_ORDER } from "@/lib/photostrip";
import { ERROR_COPY } from "@/lib/cameraErrors";
import { bump } from "@/lib/motion";
import { KioskShell } from "./KioskShell";
import { LiveStripPreview } from "./LiveStripPreview";
import { PixelStar } from "./PixelStar";
import {
  ArtButton,
  BLINK_MS,
  Button,
  Jp,
  PixelFrame,
  PixelTag,
  ScreenTitle,
  useBlinkSchedule,
  useEnterAnimation,
  type BlinkWindow,
} from "./ui";

/** Example photo for each filter, shown on the filter cards. */
const FILTER_PREVIEW: Record<FilterId, string> = {
  none: "/filters/auto.jpg",
  vintage: "/filters/vintage.jpg",
  dreamfilm: "/filters/dreamfilm.jpg",
};

function FilterSample({ filter }: { filter: FilterId }) {
  return (
    <Image
      src={FILTER_PREVIEW[filter]}
      alt=""
      width={532}
      height={390}
      sizes="(orientation: landscape) 20vw, 40vw"
      loading="eager"
      className="block aspect-532/390 w-full object-cover phone:aspect-auto phone:h-full"
    />
  );
}

/** Continue to camera: 3 bounces at 10 s, 30 s and 55 s into the time limit. */
const CONTINUE_BLINKS: readonly BlinkWindow[] = [10_000, 30_000, 55_000].map((t) => [t, t + 3 * BLINK_MS] as const);

/**
 * Step 1: strip color + filter on one screen. The strip preview shows the live
 * camera in the real strip artwork (see LiveStripPreview), so customers see
 * themselves in the color and filter they'll get.
 */
export function StyleScreen({ state, engine }: { state: BoothState; engine: BoothEngine }) {
  const root = useEnterAnimation<HTMLDivElement>();
  const { session, stream, cameraStatus, error, mirror } = state;
  const { template, filter } = session;
  const cards = useRef<Record<string, HTMLElement | null>>({});
  const colorRow = useRef<HTMLDivElement>(null);
  const filterRow = useRef<HTMLDivElement>(null);
  const colorEdges = useScrollEdges(colorRow);
  const filterEdges = useScrollEdges(filterRow);

  const liveNow = cameraStatus === "live" && !!stream;
  const errorCopy = error ? ERROR_COPY[error] : null;

  // Time limit: when it runs out, continue with whatever is selected (as soon as the camera is live).
  const [timeUp, setTimeUp] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setTimeUp(true), TIMING.styleSelectMs);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (timeUp && liveNow) engine.showCamera();
  }, [timeUp, liveNow, engine]);
  // Same start as the time limit (mount); picking colors or filters doesn't restart it.
  const blinkContinue = useBlinkSchedule("style", CONTINUE_BLINKS);

  return (
    <KioskShell
      rootRef={root}
      step={1}
      ticket={ticketNumber(session)}
      timer={{ ms: TIMING.styleSelectMs, runKey: session.createdAt }}
    >
      {/* Size container so the strip column can be exactly as wide as the strip. */}
      <div className="fit-box flex min-h-0 flex-1">
      <div className="style-layout h-full w-full">
        {/* Live preview of the finished strip: the full height of the screen. */}
        <section data-enter style={{ gridArea: "preview" }} className="flex min-h-0 flex-col gap-2" aria-label="Strip preview">
          <div className="fit-box relative flex flex-1 items-center justify-center">
            {/* The strip is an opaque rectangle, so a box-shadow looks identical to the old
                drop-shadow filter but isn't re-rasterized on every live camera frame. */}
            <div className="fit-strip shadow-[5px_6px_0_rgba(10,45,105,0.3)]">
              <LiveStripPreview
                stream={stream}
                live={liveNow}
                template={template}
                filter={filter}
                mirror={mirror}
                date={session.createdAt || undefined}
              />
            </div>
          </div>

          <div className="flex min-h-10 flex-wrap items-center justify-center gap-2 text-center phone:min-h-0 phone:gap-1">
            {liveNow ? (
              <PixelTag className="phone:px-1.5 phone:text-[0.65rem]">
                <span className="animate-px-blink size-2 bg-white" aria-hidden />
                LIVE <span className="phone:hidden">PREVIEW</span> <Jp className="ml-1 phone:hidden">ライブ</Jp>
              </PixelTag>
            ) : cameraStatus === "starting" ? (
              <p className="font-pixel text-sm text-pp-navy phone:text-[0.65rem]">STARTING CAMERA… TAP ALLOW IF ASKED</p>
            ) : (
              <>
                <p className="w-full text-xs text-pp-ink/75 phone:text-[0.65rem]">
                  {errorCopy ? `${errorCopy.title}. Showing a sample.` : "Showing a sample."}
                </p>
                <Button variant="secondary" size="sm" faceClassName="phone:min-h-9 phone:px-2 phone:text-xs" onClick={() => engine.startPreview()}>
                  {errorCopy ? <Reload className="size-4" aria-hidden /> : <Camera className="size-4" aria-hidden />}
                  {errorCopy ? "Try camera again" : "Show me in the preview"}
                </Button>
              </>
            )}
          </div>
        </section>

        <div data-enter style={{ gridArea: "head" }} className="flex items-start justify-between gap-4">
          <ScreenTitle label="01 / STYLE" jp="スタイルを選ぶ" title="Style your strip" />
          <Button variant="ghost" size="md" faceClassName="phone:min-h-9 phone:px-2 phone:text-base" onClick={() => engine.goHome()}>
            <ArrowLeft className="size-5" aria-hidden />
            Back
          </Button>
        </div>

        {/* Strip colors: rounded squares (one row when wide); the selected one blinks like an arcade cursor. */}
        <section data-enter style={{ gridArea: "colors" }} className="flex min-h-0 flex-col gap-3 phone:gap-1.5">
          <h2 className="flex flex-wrap items-baseline gap-x-3 font-label text-base font-bold uppercase tracking-[0.18em] text-pp-blue phone:gap-x-2 phone:text-xs">
            Strip color <Jp className="opacity-80">色</Jp>
            <span className="font-pixel text-lg normal-case tracking-normal text-pp-navy phone:text-sm">{TEMPLATES[template].label}</span>
          </h2>
          <div className="relative">
          <div ref={colorRow} role="radiogroup" aria-label="Strip color" className="grid grid-cols-4 justify-items-start gap-4 phone:grid-cols-5 phone:gap-2 phone-portrait:flex phone-portrait:snap-x phone-portrait:overflow-x-auto phone-portrait:overscroll-x-contain phone-portrait:scroll-px-1 phone-portrait:p-1 wide:flex wide:items-start wide:gap-[clamp(10px,1.5vw,20px)] [@media(max-height:500px)]:flex [@media(max-height:500px)]:flex-wrap">
            {TEMPLATE_ORDER.map((t) => {
              const selected = t === template;
              const style = TEMPLATES[t];
              return (
                <button
                  key={t}
                  ref={(el) => {
                    cards.current[t] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={style.label}
                  title={style.label}
                  onClick={() => {
                    engine.setTemplate(t);
                    bump(cards.current[t]);
                  }}
                  className={`relative flex size-16 shrink-0 items-center justify-center rounded-xl phone:size-9 phone:rounded-lg phone-portrait:size-11 phone-portrait:snap-start wide:aspect-square wide:size-auto wide:min-w-0 wide:shrink wide:basis-[clamp(56px,9.5vh,92px)] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-pp-navy ${
                    selected ? "animate-ring-blink" : "ring-1 ring-pp-navy/20"
                  }`}
                  style={{ background: style.swatch }}
                >
                  {selected && <PixelStar size={14} color={style.dark ? "#FFFFFF" : "var(--pp-navy)"} />}
                </button>
              );
            })}
          </div>
          <ScrollHints edges={colorEdges} />
          </div>
        </section>

        {/* Filters: three cards with the illustrated sample. */}
        <section data-enter style={{ gridArea: "filters" }} className="flex min-h-0 flex-col gap-3 phone:gap-1.5">
          {/* Wide: label + cards centred in the space left between the colors and the button. */}
          <div className="fit-box flex flex-1 flex-col items-start justify-start gap-3 wide:justify-center narrow:overflow-y-auto narrow:[container-type:normal] phone:gap-1.5">
            <h2 className="font-label text-base font-bold uppercase tracking-[0.18em] text-pp-blue phone:text-xs">
              Filter <Jp className="ml-1 opacity-80">フィルター</Jp>
            </h2>
            <div className="relative w-full">
            <div ref={filterRow} role="radiogroup" aria-label="Photo filter" className="filter-grid" style={{ "--cols": FILTER_ORDER.length } as React.CSSProperties}>
              {FILTER_ORDER.map((f) => {
                const selected = f === filter;
                const info = FILTERS[f];
                return (
                  <button
                    key={f}
                    ref={(el) => {
                      cards.current[f] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={info.label}
                    onClick={() => {
                      engine.setFilter(f);
                      bump(cards.current[f]);
                    }}
                    className="relative text-left phone:min-h-0 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-pp-navy"
                  >
                    <PixelFrame
                      edge={selected ? "bg-pp-navy animate-edge-blink" : "bg-pp-blue-line"}
                      fill={selected ? "bg-pp-blue-soft" : "bg-white"}
                      border={selected ? 4 : 2}
                      className="phone:h-full"
                      innerClassName="flex items-center gap-3 p-2.5 phone:gap-2 phone:p-1.5 wide:flex-col wide:items-stretch wide:gap-2"
                    >
                      <div className="relative w-[40%] max-w-50 shrink-0 phone:aspect-532/390 phone:h-full phone:w-auto phone:max-w-[45%] wide:w-full wide:max-w-none">
                        <FilterSample filter={f} />
                        {selected && (
                          <span className="animate-arcade absolute left-0 top-0 bg-pp-navy px-2 py-0.5 font-pixel text-xs tracking-widest text-white phone:px-1 phone:py-0 phone:text-[0.55rem]">
                            ★ SELECTED
                          </span>
                        )}
                      </div>
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2 px-1 phone:gap-1 phone:px-0">
                        <span className="min-w-0">
                          <span className="block truncate font-label text-xl font-bold uppercase leading-tight tracking-wide text-pp-navy phone:text-sm wide:text-2xl">
                            {info.label}
                          </span>
                          <span className="block truncate text-base text-pp-ink/70 phone:text-[0.7rem]">{info.description}</span>
                        </span>
                        {selected && <PixelStar size={20} color="var(--pp-navy)" className="phone:hidden" />}
                      </span>
                    </PixelFrame>
                  </button>
                );
              })}
            </div>
            <ScrollHints edges={filterEdges} />
            </div>
          </div>
        </section>

        <div data-enter style={{ gridArea: "cta" }} className="flex flex-wrap items-center justify-between gap-4 phone:flex-nowrap phone:gap-3">
          {liveNow ? (
            <p className="font-pixel text-lg text-pp-navy narrow:hidden phone:text-sm">
              {TEMPLATES[template].label.toUpperCase()} · {FILTERS[filter].label.toUpperCase()}
            </p>
          ) : (
            <p className="max-w-md text-base text-pp-ink/80 narrow:w-full narrow:text-center phone:w-auto phone:flex-1 phone:text-left phone:text-xs" role="status">
              {errorCopy ? errorCopy.body : "Allow camera access to continue."}
            </p>
          )}
          <ArtButton
            src="/ui/continue-button.svg"
            label="Continue to camera"
            width={360}
            height={115}
            className={`h-[clamp(76px,12vh,112px)] narrow:mx-auto narrow:h-auto narrow:w-full narrow:max-w-110 phone:h-16 phone:w-auto [@media(max-height:500px)]:h-12 ${
              blinkContinue && liveNow ? "animate-soft-bounce" : ""
            }`}
            disabled={!liveNow}
            onClick={() => engine.showCamera()}
          />
        </div>
      </div>
      </div>
    </KioskShell>
  );
}

type Edges = { left: boolean; right: boolean };

/** Whether a horizontally scrolling row has more content off its left / right edge. */
function useScrollEdges(ref: RefObject<HTMLElement | null>): Edges {
  const [edges, setEdges] = useState<Edges>({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 2;
      const right = el.scrollLeft < el.scrollWidth - el.clientWidth - 2;
      setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      resize.disconnect();
    };
  }, [ref]);
  return edges;
}

/** Fade + chevron on each side of a swipeable row that still has more to see. Never blocks taps. */
function ScrollHints({ edges }: { edges: Edges }) {
  const side = "pointer-events-none absolute inset-y-0 z-10 flex w-9 items-center text-pp-navy transition-opacity duration-200";
  return (
    <span aria-hidden className="contents">
      <span className={`${side} left-0 justify-start bg-linear-to-r from-white via-white/80 to-transparent ${edges.left ? "opacity-100" : "opacity-0"}`}>
        <ChevronLeft className="size-6" />
      </span>
      <span className={`${side} right-0 justify-end bg-linear-to-l from-white via-white/80 to-transparent ${edges.right ? "opacity-100" : "opacity-0"}`}>
        <ChevronRight className="size-6" />
      </span>
    </span>
  );
}
