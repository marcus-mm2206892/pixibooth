"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Reload } from "pixelarticons/react";
import type { CameraErrorKind } from "@/lib/camera";
import { ERROR_COPY } from "@/lib/cameraErrors";
import { riseIn } from "@/lib/motion";
import { enterFullscreen } from "@/lib/fullscreen";
import { PhotostripPreview } from "./PhotostripPreview";
import { KioskShell } from "./KioskShell";
import { PixelStar } from "./PixelStar";
import { Button, PixelFrame, RegMarks, useEnterAnimation } from "./ui";

export function WelcomeScreen({
  onStart,
  checkCameraAccess,
}: {
  onStart: () => void;
  checkCameraAccess: () => Promise<CameraErrorKind | null>;
}) {
  const root = useEnterAnimation<HTMLDivElement>();
  const strip = useRef<HTMLDivElement>(null);
  // The camera prompt happens here, before Start goes full screen, so it never interrupts it.
  const [access, setAccess] = useState<"checking" | "allowed" | CameraErrorKind>("checking");

  const check = useCallback(() => {
    void checkCameraAccess().then((error) => setAccess(error ?? "allowed"));
  }, [checkCameraAccess]);

  useEffect(check, [check]);

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
          {/* Start (and full screen) only appear once the camera is allowed. */}
          {access === "allowed" ? (
            <Button
              size="xl"
              onClick={() => {
                enterFullscreen();
                onStart();
              }}
            >
              <span className="animate-arcade-soft">Start photo session</span>
              <ArrowRight className="size-8" aria-hidden />
            </Button>
          ) : access === "checking" ? (
            <p className="font-pixel text-sm text-pp-navy" role="status">
              CHECKING CAMERA… TAP ALLOW IF ASKED
            </p>
          ) : (
            <div className="flex max-w-md flex-col items-center gap-3 landscape:items-start" role="status">
              <p className="text-sm text-pp-ink/80">
                <strong className="text-pp-navy">{ERROR_COPY[access].title}.</strong> {ERROR_COPY[access].body}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setAccess("checking");
                  check();
                }}
              >
                <Reload className="size-4" aria-hidden />
                Try again
              </Button>
            </div>
          )}
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
