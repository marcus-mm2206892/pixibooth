"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { ArrowRight, Camera, Expand, Reload } from "pixelarticons/react";
import type { BoothEngine, BoothState } from "@/lib/boothEngine";
import { ERROR_COPY } from "@/lib/cameraErrors";
import { riseIn } from "@/lib/motion";
import { enterFullscreen, needsFullscreen, onFullscreenChange } from "@/lib/fullscreen";
import { PhotostripPreview } from "./PhotostripPreview";
import { KioskShell } from "./KioskShell";
import { PixelStar } from "./PixelStar";
import { Button, PixelFrame, RegMarks, useEnterAnimation } from "./ui";

/**
 * Landing page. Also the booth's setup point: the camera is started here (and
 * full screen entered) so pressing Start goes straight into a session.
 */
export function WelcomeScreen({ state, engine }: { state: BoothState; engine: BoothEngine }) {
  const root = useEnterAnimation<HTMLDivElement>();
  const strip = useRef<HTMLDivElement>(null);
  const wantsFullscreen = useSyncExternalStore(onFullscreenChange, needsFullscreen, () => false);
  const { cameraStatus, error, cameraPermission } = state;
  const cameraReady = cameraStatus === "live";
  const errorCopy = error ? ERROR_COPY[error] : null;

  /** One tap covers both browser requirements: camera permission and full screen. */
  const setUp = () => {
    enterFullscreen();
    if (!cameraReady) void engine.startPreview();
  };

  useEffect(() => {
    const a = riseIn(strip.current, 250);
    return () => {
      a?.revert();
    };
  }, []);

  return (
    <KioskShell rootRef={root}>
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-6 landscape:grid-cols-[1.1fr_1fr] landscape:grid-rows-1 landscape:gap-10">
        <section className="flex flex-col items-center justify-center gap-10 px-2 py-4 text-center sm:px-6 landscape:items-start landscape:text-left">
          <h1 data-enter className="font-pixel text-[clamp(3.5rem,10vw,8rem)] leading-none text-pp-navy">
            PIXIBOOTH
          </h1>
          <div data-enter className="flex flex-col items-center gap-4 landscape:items-start">
            {cameraReady ? (
              <Button size="xl" onClick={() => engine.begin()}>
                <span className="animate-arcade-soft">Start photo session</span>
                <ArrowRight className="size-8" aria-hidden />
              </Button>
            ) : cameraStatus === "starting" ? (
              <Button size="xl" disabled>
                <Camera className="size-8" aria-hidden />
                Preparing camera…
              </Button>
            ) : (
              <>
                <Button size="xl" onClick={setUp}>
                  {errorCopy ? <Reload className="size-8" aria-hidden /> : <Camera className="size-8" aria-hidden />}
                  {errorCopy ? "Try camera again" : "Set up booth"}
                </Button>
                <p className="max-w-md text-sm text-pp-ink/75">
                  {errorCopy
                    ? `${errorCopy.title}. ${errorCopy.body}`
                    : cameraPermission === "denied"
                      ? ERROR_COPY.denied.body
                      : "Staff: tap once to allow the camera and go full screen. After that, sessions start instantly."}
                </p>
              </>
            )}
            {cameraReady && wantsFullscreen && (
              <Button variant="secondary" size="sm" onClick={() => enterFullscreen()}>
                <Expand className="size-4" aria-hidden />
                Full screen
              </Button>
            )}
          </div>
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

    </KioskShell>
  );
}
