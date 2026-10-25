"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  FlipHorizontal2,
  Pause,
  Play,
  Reload,
  Repeat,
  Volume2,
  VolumeX,
} from "pixelarticons/react";
import type { BoothEngine, BoothState } from "@/lib/boothEngine";
import { isCapturePhase } from "@/lib/boothEngine";
import type { CameraErrorKind } from "@/lib/camera";
import { FILTERS } from "@/lib/filters";
import { FALLBACK_POSE } from "@/lib/poses";
import { SHOT_COUNT, TIMING, nextEmptySlot, ticketNumber } from "@/lib/session";
import { popIn, shutterFlash } from "@/lib/motion";
import { CaptureProgress } from "./CaptureProgress";
import { KioskShell } from "./KioskShell";
import { PixelStar } from "./PixelStar";
import { Button, ConfirmDialog, PixelFrame, PixelTag } from "./ui";

const ERROR_COPY: Record<CameraErrorKind, { title: string; body: string }> = {
  insecure: {
    title: "The camera needs a secure (HTTPS) page",
    body: "Browsers only allow the camera on https:// pages or on http://localhost. If you opened this from another device using the Mac's IP address, use the HTTPS link instead (see the README).",
  },
  unsupported: {
    title: "This browser can't use the camera",
    body: "Open the booth in Safari on iPad, or in Safari or Chrome on a Mac.",
  },
  denied: {
    title: "Camera access is turned off",
    body: "iPad: tap “aA” in the address bar › Website Settings › Camera › Allow (or Settings › Apps › Safari › Camera). Mac Safari: Safari › Settings for This Website › Camera › Allow. Chrome: click the camera icon in the address bar. Then tap Try Again.",
  },
  "not-found": {
    title: "No camera found",
    body: "Connect or enable a camera on this device, then tap Try Again.",
  },
  "in-use": {
    title: "The camera is busy",
    body: "Another app or tab may be using it (FaceTime, Zoom, Photo Booth). Close it, then tap Try Again.",
  },
  ended: {
    title: "The camera disconnected",
    body: "Any photos already taken are safe. Reconnect the camera to keep going.",
  },
  "capture-failed": {
    title: "That photo didn't save",
    body: "Your other photos are safe. Tap Try Again to retake it.",
  },
  unknown: {
    title: "Something went wrong with the camera",
    body: "Tap Try Again. If it keeps happening, reload the page.",
  },
};

const pad2 = (n: number) => String(n).padStart(2, "0");

export function CameraBooth({ state, engine }: { state: BoothState; engine: BoothEngine }) {
  const { phase, stream, session, activeSlot, countdown, mode, retakeSlot, mirror, settings } = state;
  const { photos, filter, poses } = session;
  const videoRef = useRef<HTMLVideoElement>(null);
  const glowRef = useRef<HTMLVideoElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const starRef = useRef<HTMLSpanElement>(null);
  const lastFlash = useRef(state.flashCount);
  const [playingStream, setPlayingStream] = useState<MediaStream | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const capturing = isCapturePhase(phase);
  const videoReady = !!stream && playingStream === stream;
  const taken = photos.filter(Boolean).length;
  const isRetake = mode === "retake" && retakeSlot !== null;
  const idle = phase === "camera-ready" || phase === "camera-setup";
  const live = FILTERS[filter].live;

  useEffect(() => {
    engine.attachPreview(videoRef.current);
    return () => engine.attachPreview(null);
  }, [engine]);

  useEffect(() => {
    for (const video of [videoRef.current, glowRef.current]) {
      if (!video) continue;
      if (video.srcObject !== stream) video.srcObject = stream;
      if (stream) video.play().catch(() => {});
    }
  }, [stream, filter]);

  useEffect(() => {
    if (state.flashCount === lastFlash.current) return;
    lastFlash.current = state.flashCount;
    shutterFlash(flashRef.current);
    popIn(starRef.current, 2.4);
  }, [state.flashCount]);

  useEffect(() => {
    if (countdown === null) return;
    popIn(countRef.current, 1.6);
    popIn(badgeRef.current, 1.4);
  }, [countdown]);

  // ── back / cancel routing ──
  const canGoBack = !isRetake && taken === 0 && !capturing && phase !== "paused";
  const requestCancel = () => {
    if (isRetake) {
      engine.cancelRetake();
      return;
    }
    if (canGoBack) {
      engine.showFilters();
      return;
    }
    engine.pause("user");
    setConfirmCancel(true);
  };
  const backLabel = isRetake ? "Back to photos" : canGoBack ? "Back" : "Cancel session";

  // Slot whose pose is shown: the one counting down, or the next during a break.
  const poseSlot = capturing || phase === "paused" ? activeSlot : isRetake ? retakeSlot : nextEmptySlot(photos);
  const pose = poseSlot !== null && poseSlot >= 0 ? (poses[poseSlot] ?? FALLBACK_POSE) : FALLBACK_POSE;
  const shotNumber = (activeSlot ?? 0) + 1;
  const remaining = SHOT_COUNT - taken;
  const primaryLabel = isRetake
    ? `Retake photo ${pad2(retakeSlot + 1)}`
    : taken === 0
      ? `Take ${SHOT_COUNT} photos`
      : `Take ${remaining} more`;

  let tag: string;
  switch (phase) {
    case "countdown":
    case "capturing":
      tag = isRetake ? `RETAKE ${pad2(shotNumber)} / ${pad2(SHOT_COUNT)}` : `SHOT ${pad2(shotNumber)} / ${pad2(SHOT_COUNT)}`;
      break;
    case "pose-break":
      tag = "NICE! ★ NEXT POSE";
      break;
    case "paused":
      tag = "PAUSED";
      break;
    case "error":
      tag = "CHECK CAMERA";
      break;
    case "camera-setup":
      tag = state.cameraStatus === "starting" ? "STARTING…" : "CAMERA OFF";
      break;
    default:
      tag = "READY!";
  }

  const errorCopy = state.error ? ERROR_COPY[state.error] : ERROR_COPY.unknown;

  return (
    <KioskShell step={3} tone="blue" ticket={ticketNumber(session)}>
      {/* Toolbar: back on the left, idle-only camera controls on the right. */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <Button variant="ghost-inverse" size="md" onClick={requestCancel}>
          <ArrowLeft className="size-5" aria-hidden />
          {backLabel}
        </Button>
        {phase === "camera-ready" && (
          <div className="flex flex-wrap gap-3">
            <Button
              variant={settings.sound ? "inverse" : "outline-inverse"}
              size="sm"
              aria-pressed={settings.sound}
              onClick={() => engine.updateSettings({ sound: !settings.sound })}
            >
              {settings.sound ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
              {settings.sound ? "Sound on" : "Sound off"}
            </Button>
            <Button
              variant={mirror ? "inverse" : "outline-inverse"}
              size="sm"
              aria-pressed={mirror}
              onClick={() => engine.toggleMirror()}
            >
              <FlipHorizontal2 className="size-5" aria-hidden />
              Mirror
            </Button>
            {state.cameraCount > 1 && (
              <Button variant="outline-inverse" size="sm" onClick={() => engine.flipCamera()}>
                <Repeat className="size-5" aria-hidden />
                Switch camera
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 pt-3 landscape:flex-row landscape:gap-7">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {/* Pose tip lives above the viewport so it never covers faces. */}
          <div className="px-shadow shrink-0">
            <PixelFrame edge="bg-pp-blue-dark" border={3} innerClassName="flex min-h-16 items-center gap-4 px-3 py-2">
              <span className="shrink-0 bg-pp-blue px-2 py-1 font-pixel text-sm tracking-widest text-white">
                {phase === "pose-break" ? "NEXT POSE ★" : "POSE TIP ★"}
              </span>
              <p
                key={pose}
                className="min-w-0 flex-1 font-display text-[clamp(1.6rem,3.6vmin,2.6rem)] font-extrabold uppercase leading-none tracking-tight text-pp-blue"
                aria-live="polite"
              >
                {idle && !isRetake ? "Get ready to pose!" : pose}
              </p>
              {phase === "pose-break" && (
                <span className="h-2 w-24 shrink-0 overflow-hidden bg-pp-blue-light">
                  <span
                    key={activeSlot}
                    className="animate-drain block h-full bg-pp-blue"
                    style={{ animationDuration: `${TIMING.poseBreakMs}ms` }}
                  />
                </span>
              )}
            </PixelFrame>
          </div>

          {/* Live preview: same 532:390 aspect + center crop as the saved photo. */}
          <div className="fit-box flex flex-1 items-center justify-center">
            <div className="fit-slot px-shadow">
            <PixelFrame
              edge="bg-white"
              fill="bg-pp-blue-dark"
              border={6}
              step={5}
              className="h-full w-full"
              innerClassName="relative overflow-hidden"
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                disablePictureInPicture
                onPlaying={(e) => setPlayingStream(e.currentTarget.srcObject as MediaStream | null)}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ transform: mirror ? "scaleX(-1)" : undefined, filter: live.css }}
              />
              {live.glow && (
                <video
                  ref={glowRef}
                  autoPlay
                  playsInline
                  muted
                  aria-hidden
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-45 mix-blend-screen"
                  style={{ transform: mirror ? "scaleX(-1)" : undefined, filter: `${live.css} brightness(1.15) blur(16px)` }}
                />
              )}
              {live.overlay && (
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ background: live.overlay, mixBlendMode: live.overlayBlend ?? "normal" }}
                />
              )}

              {videoReady && phase !== "error" && <FramingGuide />}

              {/* Small corner countdown for people watching themselves; the big one is beside the frame. */}
              {phase === "countdown" && countdown !== null && (
                <span
                  key={countdown}
                  ref={badgeRef}
                  className="px-corners absolute right-4 top-4 flex size-16 items-center justify-center bg-white font-display text-5xl font-extrabold text-pp-blue"
                  aria-hidden
                >
                  {countdown}
                </span>
              )}

              <span ref={starRef} className="pointer-events-none absolute bottom-1.5 right-1.5" aria-hidden>
                <PixelStar variant="duo" size={24} color="#FFFFFF" accent="var(--pp-blue)" />
              </span>

              {(phase === "camera-setup" || (phase === "camera-ready" && !videoReady)) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-pp-blue-dark p-6 text-center">
                  {state.cameraStatus === "off" ? (
                    <>
                      <span className="relative">
                        <PixelStar variant="outline" size={110} color="rgba(255,255,255,0.35)" />
                        <Camera className="absolute left-1/2 top-[55%] size-12 -translate-x-1/2 -translate-y-1/2" aria-hidden />
                      </span>
                      <p className="max-w-sm text-lg text-white/80">
                        Tap below and allow camera access. Photos stay on this device.
                      </p>
                      <Button variant="inverse" size="xl" onClick={() => engine.enableCamera()}>
                        Enable camera
                      </Button>
                    </>
                  ) : (
                    <>
                      <PixelStar size={56} color="#FFFFFF" className="animate-px-blink" />
                      <p className="font-pixel text-lg tracking-widest text-white/85">STARTING CAMERA…</p>
                      <p className="text-white/70">Tap Allow if your browser asks.</p>
                    </>
                  )}
                </div>
              )}

              {phase === "paused" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-pp-blue-dark/85 p-6 text-center">
                  <Pause className="size-14" aria-hidden />
                  <div>
                    <p className="font-display text-5xl font-extrabold uppercase">Paused</p>
                    <p className="mt-2 max-w-md text-white/80">
                      {state.pausedBy === "hidden"
                        ? "The screen was hidden, so we stopped the countdown. Nothing was taken while away."
                        : "The countdown is stopped. Your photos so far are kept."}
                    </p>
                  </div>
                  <Button variant="inverse" size="xl" onClick={() => engine.resume()}>
                    <Play className="size-8" aria-hidden />
                    Resume countdown
                  </Button>
                </div>
              )}

              {phase === "error" && (
                <div className="absolute inset-0 overflow-y-auto bg-pp-blue-dark">
                  <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
                    <PixelTag inverse>CHECK CAMERA ★</PixelTag>
                    <p className="font-display text-3xl font-extrabold uppercase">{errorCopy.title}</p>
                    <p className="max-w-lg text-white/80">{errorCopy.body}</p>
                    <Button variant="inverse" size="lg" onClick={() => engine.retryAfterError()}>
                      <Reload className="size-6" aria-hidden />
                      {state.error === "ended" ? "Reconnect camera" : "Try again"}
                    </Button>
                  </div>
                </div>
              )}

              <div ref={flashRef} className="pointer-events-none absolute inset-0 bg-white opacity-0" aria-hidden />
            </PixelFrame>
            </div>
          </div>
        </div>

        {/* Status, the big countdown, progress and the one big button. */}
        <aside className="grid shrink-0 grid-cols-2 items-center gap-x-6 gap-y-4 landscape:flex landscape:w-[min(34%,380px)] landscape:flex-col landscape:items-stretch landscape:justify-center">
          <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <PixelTag inverse>{tag}</PixelTag>
            {(capturing || phase === "paused") && (
              <span className="flex items-center gap-1.5 font-pixel text-xs tracking-widest text-white/75">
                {settings.sound ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
                {settings.sound ? "SOUND ON" : "MUTED"}
              </span>
            )}
          </div>

          <div className="flex min-h-[clamp(84px,12vh,140px)] items-center landscape:min-h-[clamp(120px,30vh,260px)]" aria-live="assertive">
            {phase === "countdown" && countdown !== null ? (
              <span
                key={countdown}
                ref={countRef}
                className="font-display text-[clamp(6rem,13vh,9rem)] font-extrabold leading-none tabular-nums landscape:text-[clamp(8rem,32vh,16rem)]"
              >
                {countdown}
              </span>
            ) : (
              <div>
                <p className="font-display text-4xl font-extrabold uppercase leading-[0.95] landscape:text-5xl">
                  {phase === "capturing"
                    ? "Snap! ★"
                    : phase === "pose-break"
                      ? "Nice! New pose…"
                      : phase === "paused"
                        ? "Take a breath"
                        : phase === "error"
                          ? "Hold on"
                          : isRetake
                            ? `Retake photo ${pad2(retakeSlot + 1)}`
                            : "Ready to pose?"}
                </p>
                <p className="mt-2 font-pixel text-sm tracking-wider text-white/75">
                  {phase === "pose-break"
                    ? `PHOTO ${pad2(shotNumber)} / ${pad2(SHOT_COUNT)} IS NEXT`
                    : isRetake
                      ? "ONLY THIS PHOTO IS REPLACED"
                      : "5-SECOND COUNTDOWN · POSE TIPS · 4 PHOTOS"}
                </p>
              </div>
            )}
          </div>
          </div>

          <CaptureProgress
            photos={photos}
            filter={filter}
            activeSlot={capturing || phase === "paused" ? activeSlot : isRetake ? retakeSlot : nextEmptySlot(photos)}
          />

          {idle && (
            <p className="col-span-2 flex items-center justify-between gap-2 font-pixel text-xs tracking-widest text-white/75">
              <span>FILTER: {FILTERS[filter].label.toUpperCase()}</span>
              <button
                type="button"
                className="min-h-11 px-2 underline decoration-2 underline-offset-4"
                onClick={() => engine.showFilters()}
              >
                CHANGE
              </button>
            </p>
          )}

          {phase === "camera-ready" && (
            <Button
              variant="inverse"
              size="xl"
              className="col-span-2 w-full"
              disabled={!videoReady}
              onClick={() => engine.startCapture()}
            >
              <Camera className="size-8" aria-hidden />
              {primaryLabel}
            </Button>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Start over?"
        body={
          taken > 0
            ? `This deletes the ${taken} photo${taken === 1 ? "" : "s"} taken so far.`
            : "This ends the current session."
        }
        confirmLabel="Discard & start over"
        cancelLabel="Keep going"
        onCancel={() => {
          setConfirmCancel(false);
          engine.resume();
        }}
        onConfirm={() => {
          setConfirmCancel(false);
          engine.newSession();
        }}
      />
    </KioskShell>
  );
}

/** Pixel crop-guide corners at the safe area. */
function FramingGuide() {
  const corner = "absolute size-9 border-white/80";
  return (
    <div className="pointer-events-none absolute inset-[6%]" aria-hidden>
      <span className={`${corner} left-0 top-0 border-l-4 border-t-4`} />
      <span className={`${corner} right-0 top-0 border-r-4 border-t-4`} />
      <span className={`${corner} bottom-0 left-0 border-b-4 border-l-4`} />
      <span className={`${corner} bottom-0 right-0 border-b-4 border-r-4`} />
    </div>
  );
}
