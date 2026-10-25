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
import { ERROR_COPY } from "@/lib/cameraErrors";
import { FILTERS } from "@/lib/filters";
import { FALLBACK_POSE } from "@/lib/poses";
import { SHOT_COUNT, TIMING, nextEmptySlot } from "@/lib/session";
import { popIn, shutterFlash } from "@/lib/motion";
import { CaptureProgress } from "./CaptureProgress";
import { KioskShell } from "./KioskShell";
import { PixelStar } from "./PixelStar";
import { Button, ConfirmDialog, Jp, PixelFrame, PixelTag } from "./ui";


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
      engine.showStyle();
      return;
    }
    engine.pause("user");
    setConfirmCancel(true);
  };
  const backLabel = isRetake ? "Back to strip" : canGoBack ? "Back" : "Cancel session";

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

  // English status + a short Japanese kiosk label.
  let tag: string;
  let tagJa: string;
  switch (phase) {
    case "countdown":
    case "capturing":
      tag = isRetake ? `RETAKE ${pad2(shotNumber)} / ${pad2(SHOT_COUNT)}` : `SHOT ${pad2(shotNumber)} / ${pad2(SHOT_COUNT)}`;
      tagJa = "撮影中";
      break;
    case "pose-break":
      tag = "NICE! ★ NEXT POSE";
      tagJa = "次のポーズ";
      break;
    case "paused":
      tag = "PAUSED";
      tagJa = "一時停止";
      break;
    case "error":
      tag = "CHECK CAMERA";
      tagJa = "カメラ確認";
      break;
    case "camera-setup":
      tag = state.cameraStatus === "starting" ? "STARTING…" : "CAMERA OFF";
      tagJa = state.cameraStatus === "starting" ? "起動中" : "カメラオフ";
      break;
    default:
      tag = "READY!";
      tagJa = "準備OK";
  }

  const errorCopy = state.error ? ERROR_COPY[state.error] : ERROR_COPY.unknown;

  return (
    <KioskShell step={2} tone="navy" bodyClassName="pt-3!">
      {/* Landscape: preview fills the left; toolbar + status column on the right.
          Portrait: toolbar, preview, then status stacked. */}
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 landscape:grid-cols-[minmax(0,1fr)_min(28%,310px)] landscape:grid-rows-[auto_minmax(0,1fr)] landscape:gap-x-6">
      <div className="flex flex-wrap items-center justify-between gap-3 landscape:col-start-2 landscape:row-start-1">
        <Button variant="ghost-inverse" size="md" onClick={requestCancel} faceClassName="px-2!">
          <ArrowLeft className="size-5" aria-hidden />
          {backLabel}
        </Button>
        {phase === "camera-ready" && (
          <div className="flex flex-wrap gap-3">
            <Button
              variant={settings.sound ? "inverse" : "outline-inverse"}
              size="sm"
              aria-pressed={settings.sound}
              aria-label={settings.sound ? "Sound on" : "Sound off"}
              onClick={() => engine.updateSettings({ sound: !settings.sound })}
            >
              {settings.sound ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
              {settings.sound ? "On" : "Off"}
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
              <Button variant="outline-inverse" size="sm" aria-label="Switch camera" onClick={() => engine.flipCamera()}>
                <Repeat className="size-5" aria-hidden />
                Switch
              </Button>
            )}
          </div>
        )}
      </div>

          {/* Live preview: same 532:390 aspect + center crop as the saved photo. */}
          <div className="fit-box flex items-center justify-center landscape:col-start-1 landscape:row-span-2 landscape:row-start-1">
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

              {/* Pose tip over the bottom of the live view, where the group is looking.
                  Semi-transparent so faces stay visible; it is never part of the saved photo. */}
              {videoReady && (capturing || phase === "camera-ready") && (
                <div className="pointer-events-none absolute inset-x-[5%] bottom-[5%] flex justify-center" aria-live="polite">
                  <div className="px-corners flex max-w-full items-center gap-3 bg-pp-navy/55 px-4 py-2.5">
                    <span className="shrink-0 bg-pp-blue/85 px-2 py-0.5 font-pixel text-sm tracking-widest text-white">
                      {phase === "pose-break" ? "NEXT POSE ★" : "POSE TIP ★"}
                    </span>
                    <p
                      key={pose}
                      className="min-w-0 font-pixel text-[clamp(1.5rem,3.8vmin,2.8rem)] uppercase leading-tight text-white/90 drop-shadow-[0_2px_0_rgba(10,45,105,0.6)]"
                    >
                      {idle && !isRetake ? "Get ready to pose!" : pose}
                    </p>
                    {phase === "pose-break" && (
                      <span className="h-2 w-20 shrink-0 overflow-hidden bg-white/25">
                        <span
                          key={activeSlot}
                          className="animate-drain block h-full bg-white/90"
                          style={{ animationDuration: `${TIMING.poseBreakMs}ms` }}
                        />
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Small corner countdown for people watching themselves; the big one is beside the frame. */}
              {phase === "countdown" && countdown !== null && (
                <span
                  key={countdown}
                  ref={badgeRef}
                  className="px-corners absolute right-4 top-4 flex size-16 items-center justify-center bg-white font-pixel text-5xl text-pp-navy"
                  aria-hidden
                >
                  {countdown}
                </span>
              )}

              <span ref={starRef} className="pointer-events-none absolute left-1.5 top-1.5" aria-hidden>
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
                    <p className="font-pixel text-5xl uppercase">Paused</p>
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
                    <p className="font-pixel text-2xl uppercase leading-tight">{errorCopy.title}</p>
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

        {/* Status, the big countdown, progress and the one big button. */}
        <aside className="grid min-h-0 grid-cols-2 items-center gap-x-6 gap-y-4 landscape:col-start-2 landscape:row-start-2 landscape:flex landscape:flex-col landscape:items-stretch landscape:justify-center">
          <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <PixelTag inverse>
              {tag}
              <Jp className="ml-1">{tagJa}</Jp>
            </PixelTag>
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
                className="font-pixel text-[clamp(6rem,13vh,9rem)] leading-none tabular-nums landscape:text-[clamp(8rem,32vh,16rem)]"
              >
                {countdown}
              </span>
            ) : (
              <div>
                <p className="font-pixel text-3xl uppercase leading-tight landscape:text-4xl">
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
                onClick={() => engine.showStyle()}
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
