"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, Camera, Reload } from "pixelarticons/react";
import type { BoothEngine, BoothState } from "@/lib/boothEngine";
import type { FilterId } from "@/lib/session";
import { ticketNumber } from "@/lib/session";
import type { PhotoSource } from "@/lib/photos";
import { FILTERS, FILTER_ORDER, applyFilter } from "@/lib/filters";
import { SLOT_ASPECT, TEMPLATES, TEMPLATE_ORDER, renderStrip } from "@/lib/photostrip";
import { getSamplePhotos } from "@/lib/sampleScene";
import { coverCrop, get2d, makeCanvas, releaseCanvas } from "@/lib/canvas";
import { ERROR_COPY } from "@/lib/cameraErrors";
import { bump } from "@/lib/motion";
import { KioskShell } from "./KioskShell";
import { PixelStar } from "./PixelStar";
import { Button, Jp, PixelFrame, PixelTag, ScreenTitle, useEnterAnimation } from "./ui";

const FRAME_W = 480;
const FRAME_H = Math.round(FRAME_W / SLOT_ASPECT);
/** Live strip preview refresh, ~10 fps. */
const STRIP_INTERVAL_MS = 100;

/** Copies the current video frame into `canvas`, center-cover-cropped and mirrored like the capture. */
function grabFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, mirror: boolean) {
  const ctx = get2d(canvas);
  const crop = coverCrop(video.videoWidth, video.videoHeight, canvas.width / canvas.height);
  ctx.save();
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/** The illustrated sample photo run through the real export filter. */
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

/**
 * Step 1: strip color + filter on one screen. The strip preview is drawn from
 * the live camera with the real export renderer, so customers see themselves
 * in the exact color and filter they'll get.
 */
export function StyleScreen({ state, engine }: { state: BoothState; engine: BoothEngine }) {
  const root = useEnterAnimation<HTMLDivElement>();
  const { session, stream, cameraStatus, error, mirror } = state;
  const { template, filter } = session;
  const videoRef = useRef<HTMLVideoElement>(null);
  const stripRef = useRef<HTMLCanvasElement>(null);
  const cards = useRef<Record<string, HTMLElement | null>>({});
  const opts = useRef({ template, filter, mirror, createdAt: session.createdAt });

  useEffect(() => {
    opts.current = { template, filter, mirror, createdAt: session.createdAt };
  }, [template, filter, mirror, session.createdAt]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    if (stream) video.play().catch(() => {});
  }, [stream]);

  // Renders the strip ~10 fps from the camera, or once per change with sample art.
  useEffect(() => {
    const frame = makeCanvas(FRAME_W, FRAME_H);
    const live: PhotoSource = { image: frame, width: FRAME_W, height: FRAME_H, seed: 7 };
    const samples = getSamplePhotos();
    let raf = 0;
    let last = 0;
    let busy = false;
    let lastKey = "";

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (busy || now - last < STRIP_INTERVAL_MS) return;
      last = now;
      const video = videoRef.current;
      const hasFrame =
        !!video && !!video.srcObject && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0;
      const { template, filter, mirror, createdAt } = opts.current;
      const key = `${hasFrame}|${template}|${filter}`;
      if (!hasFrame && key === lastKey) return;
      lastKey = key;
      if (hasFrame) grabFrame(video!, frame, mirror);
      const strip = stripRef.current;
      if (!strip) return;
      busy = true;
      renderStrip(strip, {
        photos: hasFrame ? [live, live, live, live] : samples,
        template,
        filter,
        width: 360,
        date: createdAt ? new Date(createdAt) : undefined,
      })
        .catch((err) => console.error("Live strip preview failed", err))
        .finally(() => {
          busy = false;
        });
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      releaseCanvas(frame);
    };
  }, []);

  const liveNow = cameraStatus === "live" && !!stream;
  const errorCopy = error ? ERROR_COPY[error] : null;

  return (
    <KioskShell rootRef={root} step={1} ticket={ticketNumber(session)}>
      <div className="style-layout min-h-0 flex-1">
        {/* Live preview of the finished strip: the full height of the screen. */}
        <section data-enter style={{ gridArea: "preview" }} className="flex min-h-0 flex-col gap-2" aria-label="Strip preview">
          <div className="fit-box relative flex flex-1 items-center justify-center">
            <div className="fit-strip drop-shadow-[5px_6px_0_rgba(10,45,105,0.3)]">
              <canvas
                ref={stripRef}
                width={360}
                height={1080}
                role="img"
                aria-label={`${TEMPLATES[template].label} strip with ${FILTERS[filter].label} filter`}
                className={`block h-full w-full ${template === "white" ? "ring-1 ring-pp-blue-line" : ""}`}
                style={{ background: TEMPLATES[template].background }}
              />
            </div>
            {/* Frame source for the preview; never shown, never captured. */}
            <video ref={videoRef} autoPlay playsInline muted aria-hidden className="pointer-events-none absolute size-px opacity-0" />
          </div>

          <div className="flex min-h-10 flex-wrap items-center justify-center gap-2 text-center">
            {liveNow ? (
              <PixelTag>
                <span className="animate-px-blink size-2 bg-white" aria-hidden />
                LIVE PREVIEW <Jp className="ml-1">ライブ</Jp>
              </PixelTag>
            ) : cameraStatus === "starting" ? (
              <p className="font-pixel text-sm text-pp-navy">STARTING CAMERA… TAP ALLOW IF ASKED</p>
            ) : (
              <>
                <p className="w-full text-xs text-pp-ink/75">
                  {errorCopy ? `${errorCopy.title}. Showing a sample.` : "Showing a sample."}
                </p>
                <Button variant="secondary" size="sm" onClick={() => engine.startPreview()}>
                  {errorCopy ? <Reload className="size-4" aria-hidden /> : <Camera className="size-4" aria-hidden />}
                  {errorCopy ? "Try camera again" : "Show me in the preview"}
                </Button>
              </>
            )}
          </div>
        </section>

        <div data-enter style={{ gridArea: "head" }} className="flex items-start justify-between gap-4">
          <ScreenTitle label="01 / STYLE" jp="スタイルを選ぶ" title="Style your strip" />
          <Button variant="ghost" size="md" onClick={() => engine.goHome()}>
            <ArrowLeft className="size-5" aria-hidden />
            Back
          </Button>
        </div>

        {/* Strip colors: rounded squares; the selected one blinks like an arcade cursor. */}
        <section data-enter style={{ gridArea: "colors" }} className="flex min-h-0 flex-col gap-3">
          <h2 className="flex flex-wrap items-baseline gap-x-3 font-label text-base font-bold uppercase tracking-[0.18em] text-pp-blue">
            Strip color <Jp className="opacity-80">色</Jp>
            <span className="font-pixel text-lg normal-case tracking-normal text-pp-navy">{TEMPLATES[template].label}</span>
          </h2>
          <div role="radiogroup" aria-label="Strip color" className="grid grid-cols-4 justify-items-start gap-4 landscape:flex landscape:flex-wrap landscape:gap-5">
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
                  className={`relative flex size-16 shrink-0 items-center justify-center rounded-xl short:size-14 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-pp-navy ${
                    selected ? "ring-[3px] ring-pp-navy blink-ring" : "ring-1 ring-pp-navy/20"
                  }`}
                  style={{ background: style.background }}
                >
                  {selected && (
                    <>
                      <PixelStar size={18} color={style.logo === "white" ? "#FFFFFF" : "var(--pp-navy)"} />
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Filters: three cards with the illustrated sample. */}
        <section data-enter style={{ gridArea: "filters" }} className="flex min-h-0 flex-col gap-3">
          <h2 className="font-label text-base font-bold uppercase tracking-[0.18em] text-pp-blue">
            Filter <Jp className="ml-1 opacity-80">フィルター</Jp>
          </h2>
          <div className="fit-box flex flex-1 items-start justify-start portrait:overflow-y-auto portrait:[container-type:normal]">
            <div role="radiogroup" aria-label="Photo filter" className="filter-grid" style={{ "--cols": FILTER_ORDER.length } as React.CSSProperties}>
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
                    className="relative text-left focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-pp-navy"
                  >
                    <PixelFrame
                      edge={selected ? "bg-pp-navy blink-edge" : "bg-pp-blue-line"}
                      fill={selected ? "bg-pp-blue-soft" : "bg-white"}
                      border={selected ? 4 : 2}
                      innerClassName="flex items-center gap-3 p-2.5 landscape:flex-col landscape:items-stretch landscape:gap-2"
                    >
                      <div className="relative w-[40%] shrink-0 landscape:w-full">
                        <FilterSample filter={f} />
                        {selected && (
                          <span className="animate-arcade absolute left-0 top-0 bg-pp-navy px-2 py-0.5 font-pixel text-xs tracking-widest text-white">
                            ★ SELECTED
                          </span>
                        )}
                      </div>
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2 px-1">
                        <span className="min-w-0">
                          <span className="block truncate font-label text-xl font-bold uppercase leading-tight tracking-wide text-pp-navy">
                            {info.label}
                          </span>
                          <span className="block truncate text-sm text-pp-ink/70">{info.description}</span>
                        </span>
                        {selected && <PixelStar size={20} color="var(--pp-navy)" />}
                      </span>
                    </PixelFrame>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <div data-enter style={{ gridArea: "cta" }} className="flex flex-wrap items-center justify-between gap-4">
          <p className="font-pixel text-sm text-pp-navy portrait:hidden">
            {TEMPLATES[template].label.toUpperCase()} · {FILTERS[filter].label.toUpperCase()}
          </p>
          <Button size="xl" className="portrait:w-full" onClick={() => engine.showCamera()}>
            <Camera className="size-8" aria-hidden />
            Continue to camera
          </Button>
        </div>
      </div>
    </KioskShell>
  );
}
