"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Camera, Pause, Play, Reload } from "pixelarticons/react";
import type { BoothEngine, BoothState } from "@/lib/boothEngine";
import { isCapturePhase } from "@/lib/boothEngine";
import { ERROR_COPY } from "@/lib/cameraErrors";
import { FILTERS } from "@/lib/filters";
import { FALLBACK_POSE } from "@/lib/poses";
import { SHOT_COUNT, TIMING, nextEmptySlot } from "@/lib/session";
import { popIn } from "@/lib/motion";
import { CaptureProgress } from "./CaptureProgress";
import { DreamFilmLive } from "./DreamFilmLive";
import { DREAM_FILM } from "@/lib/dreamFilm";
import { KioskShell } from "./KioskShell";
import { PixelStar } from "./PixelStar";
import { ArtButton, Button, Jp, PixelFrame, PixelTag } from "./ui";

const pad2 = (n: number) => String(n).padStart(2, "0");

export function CameraBooth({ state, engine }: { state: BoothState; engine: BoothEngine }) {
  const { phase, stream, session, activeSlot, countdown, mode, retakeSlot, mirror } = state;
  const { photos, filter, poses } = session;
  const videoRef = useRef<HTMLVideoElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const starRef = useRef<HTMLSpanElement>(null);
  const lastFlash = useRef(state.flashCount);
  const [playingStream, setPlayingStream] = useState<MediaStream | null>(null);

  const capturing = isCapturePhase(phase);
  const videoReady = !!stream && playingStream === stream;
  const isRetake = mode === "retake" && retakeSlot !== null;
  const idle = phase === "camera-ready" || phase === "camera-setup";
  const live = FILTERS[filter].live;

  useEffect(() => {
    engine.attachPreview(videoRef.current);
    return () => engine.attachPreview(null);
  }, [engine]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    if (stream) video.play().catch(() => {});
  }, [stream]);

  useEffect(() => {
    if (state.flashCount === lastFlash.current) return;
    lastFlash.current = state.flashCount;
    popIn(starRef.current, 2.4);
  }, [state.flashCount]);

  useEffect(() => {
    if (countdown === null) return;
    popIn(countRef.current, 1.6);
    popIn(badgeRef.current, 1.4);
  }, [countdown]);

  // No way back from here: "get ready" has a time limit, then the shots start on their own.
  const autoStart = phase === "camera-ready" && videoReady;
  useEffect(() => {
    if (!autoStart) return;
    const timer = window.setTimeout(() => engine.startCapture(), TIMING.getReadyMs);
    return () => window.clearTimeout(timer);
  }, [autoStart, engine]);

  // Slot whose pose is shown: the one counting down, or the next during a break.
  const poseSlot = capturing || phase === "paused" ? activeSlot : isRetake ? retakeSlot : nextEmptySlot(photos);
  const pose = poseSlot !== null && poseSlot >= 0 ? (poses[poseSlot] ?? FALLBACK_POSE) : FALLBACK_POSE;
  const shotNumber = (activeSlot ?? 0) + 1;
  const primaryLabel = isRetake ? `Retake photo ${pad2(retakeSlot + 1)}` : "Press to start!";
  // One key for the whole 30 s auto-start: the header bar, the ring and the timer above all follow it.
  const readyKey = autoStart ? `${mode}-${retakeSlot}` : null;

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
    <KioskShell
      step={2}
      tone="navy"
      bodyClassName="pt-3! bg-white text-pp-ink"
      timer={{ ms: TIMING.getReadyMs, runKey: readyKey }}
    >
      {/* Light-blue flare over white (supplied artwork), behind everything. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-bottom bg-no-repeat opacity-75"
        style={{ backgroundImage: "url(/ui/ready-background.webp)" }}
      />
      {/* Preview + status panel as one centred group (.snap-row): side by side
          in landscape, stacked in portrait and on phones. */}
      <div className="fit-box relative flex min-h-0 flex-1 items-center justify-center phone:flex-none phone:[container-type:normal]">
        <div className="snap-row">
          {/* Live preview: same 532:390 aspect + center crop as the saved photo. */}
          <div className="snap-preview">
            <PixelFrame
              edge="bg-pp-frame"
              fill="bg-pp-blue-dark"
              border={4}
              step={0}
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
              {live.gpu && <DreamFilmLive videoRef={videoRef} mirror={mirror} preset={DREAM_FILM} />}
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

              {/* Time-left bar across the full width of the frame top: drains over the countdown. */}
              {phase === "countdown" && (
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-pp-navy/55 short:h-3" aria-hidden>
                  <div
                    key={state.shotSerial}
                    className="animate-drain h-full bg-white"
                    style={{ animationDuration: `${TIMING.countdownSeconds * 1000}ms` }}
                  />
                </div>
              )}

              {/* Small corner countdown for people watching themselves; the big one is beside the frame. */}
              {phase === "countdown" && countdown !== null && (
                <span
                  key={countdown}
                  ref={badgeRef}
                  className="px-corners absolute right-4 top-7 flex size-16 items-center justify-center bg-white font-pixel text-5xl text-pp-navy"
                  aria-hidden
                >
                  {countdown}
                </span>
              )}

              <span ref={starRef} className="pointer-events-none absolute left-1.5 top-6" aria-hidden>
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

            </PixelFrame>
          </div>

        {/* Mirror, status, the big countdown, progress and the one big button. */}
        <aside className="snap-aside grid min-h-0 grid-cols-2 items-center gap-x-6 gap-y-3 phone:grid-cols-1 wide:flex wide:flex-col wide:items-stretch wide:justify-center">
          {phase === "camera-ready" && (
            <ArtButton
              src="/ui/mirror-button.svg"
              label="Mirror / Flip"
              width={219}
              height={87}
              className="col-span-2 w-[min(72%,270px)] phone:col-span-1 short:w-[min(66%,240px)]"
              aria-pressed={mirror}
              onClick={() => engine.toggleMirror()}
            />
          )}

          <div className="flex min-w-0 flex-col gap-3">
          {!idle && (
            <div className="flex items-center justify-between gap-3">
              <PixelTag>
                {tag}
                <Jp className="ml-1">{tagJa}</Jp>
              </PixelTag>
            </div>
          )}

          <div className="flex min-h-[clamp(72px,10vh,120px)] items-center wide:min-h-[clamp(96px,22vh,190px)]" aria-live="assertive">
            {phase === "countdown" && countdown !== null ? (
              <span
                key={countdown}
                ref={countRef}
                className="font-pixel text-[clamp(5rem,11vh,8rem)] leading-none tabular-nums text-pp-cobalt wide:text-[clamp(6rem,24vh,12rem)]"
              >
                {countdown}
              </span>
            ) : (
              <div className="font-helvetica">
                <p className="text-[clamp(1.8rem,min(5.4vh,3.05cqw),2.75rem)] font-bold phone:text-[2rem] leading-tight text-pp-cobalt">
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
                <p className="mt-1 text-[clamp(1.15rem,2.8vh,1.5rem)] leading-snug text-pp-blue-deep">
                  {phase === "pose-break"
                    ? `Photo ${pad2(shotNumber)} / ${pad2(SHOT_COUNT)} is next`
                    : isRetake
                      ? "Only this photo is replaced"
                      : "5-second countdown • Pose tips • 4 photos"}
                </p>
                {idle && !isRetake && (
                  <p lang="ja" className="mt-1 text-[clamp(0.95rem,2.1vh,1.1rem)] leading-snug text-pp-red">
                    5秒カウントダウン・ポーズのヒント・4枚撮影
                  </p>
                )}
              </div>
            )}
          </div>
          </div>

          <CaptureProgress
            photos={photos}
            filter={filter}
            activeSlot={capturing || phase === "paused" ? activeSlot : isRetake ? retakeSlot : nextEmptySlot(photos)}
          />

          {phase === "camera-ready" && (
            <ArtButton
              src="/ui/press-start-button.svg"
              label={primaryLabel}
              width={326}
              height={104}
              className="col-span-2 w-full justify-self-center phone:col-span-1 narrow:max-w-105 short:w-[94%]"
              disabled={!videoReady}
              onClick={() => engine.startCapture()}
            >
              <AutoStartRing ms={TIMING.getReadyMs} runKey={readyKey} />
            </ArtButton>
          )}
        </aside>
        </div>
      </div>
    </KioskShell>
  );
}

const RING_R = 19;
const RING_LENGTH = 2 * Math.PI * RING_R;

/**
 * The 30 s auto-start (not the 5 s photo countdown), drawn in the empty icon
 * area of the Press to Start artwork. A full ring that empties clockwise; it
 * shares `runKey` and duration with the header bar, so both start in the same
 * commit and stay in step. Full and still until the camera is ready.
 */
function AutoStartRing({ ms, runKey }: { ms: number; runKey: string | null }) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden
      className="pointer-events-none absolute left-[8.2%] top-1/2 h-[46%] -translate-y-1/2 drop-shadow-[0_1px_2px_rgba(10,45,105,0.35)]"
    >
      <circle cx="24" cy="24" r={RING_R} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="5" />
      <circle
        key={runKey ?? "idle"}
        cx="24"
        cy="24"
        r={RING_R}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="5"
        strokeDasharray={RING_LENGTH}
        transform="rotate(-90 24 24) scale(1 -1) translate(0 -48)"
        className={runKey !== null ? "animate-ring-drain" : undefined}
        style={{ "--ring-length": `${RING_LENGTH}px`, animationDuration: `${ms}ms` } as CSSProperties}
      />
    </svg>
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
