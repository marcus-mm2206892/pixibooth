"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BoothEngine, BoothState } from "@/lib/boothEngine";
import { ERROR_COPY } from "@/lib/cameraErrors";
import { enterFullscreen } from "@/lib/fullscreen";
import { KioskShell } from "./KioskShell";
import { ArtButton, useEnterAnimation } from "./ui";

/**
 * The home screen is laid out on a design board that scales uniformly to fit
 * (see .welcome-canvas: a two-column board in landscape, one column in
 * portrait and on phones). Every size is in board units, so nothing wraps or
 * drifts apart when the window changes size.
 */
const u = (n: number) => `calc(var(--u) * ${n})`;

/** Inner window of /ui/mirror-frame.svg (measured from the artwork), where the live camera shows. */
const MIRROR_WINDOW = { left: "12.44%", top: "10.93%", right: "12.68%", bottom: "11.07%", borderRadius: "4.7% / 3.9%" };

/**
 * Home screen: logo, Start, the (decorative) bill and coin slots and a how-it-works
 * strip on the left/bottom; a live mirror on the right. The camera is requested
 * here, so its prompt never interrupts full screen, and Start stays disabled
 * until the camera is live.
 */
export function WelcomeScreen({ state, engine }: { state: BoothState; engine: BoothEngine }) {
  const root = useEnterAnimation<HTMLDivElement>();
  const { cameraStatus, stream, error } = state;
  const live = cameraStatus === "live" && !!stream;

  // Browsers show their own permission prompt here; Safari allows it without a tap.
  useEffect(() => {
    if (engine.getSnapshot().cameraStatus === "off") void engine.startPreview();
  }, [engine]);

  return (
    <KioskShell rootRef={root}>
      <div className="welcome-stage">
        <div className="welcome-canvas font-helvetica">
          <section data-enter className="welcome-intro">
            <Brand />
            <ArtButton
              src="/ui/start-session-button.svg"
              label="Start photo session"
              width={499}
              height={159}
              style={{ width: u(392) }}
              disabled={!live}
              onClick={() => {
                enterFullscreen();
                engine.begin();
              }}
            />
          </section>
          <div className="welcome-rule bg-pp-slate/45" aria-hidden />
          <section data-enter className="welcome-pay">
            <PaymentSlots />
          </section>
          <section data-enter className="welcome-mirror">
            <MirrorPreview
              stream={stream}
              status={cameraStatus}
              error={error}
              onEnable={() => void engine.startPreview()}
            />
          </section>
          <HowItWorks />
        </div>
      </div>
    </KioskShell>
  );
}

/** Blue pixipocket logo with プリクラ / PHOTO BOOTH set in its empty lower-right corner, clear of the wordmark. */
function Brand() {
  return (
    <div className="relative shrink-0" style={{ width: u(340), height: u(214) }}>
      <Image
        src="/ui/pixipocket-logo-blue.png"
        alt="pixipocket"
        width={1740}
        height={929}
        priority
        unoptimized
        className="absolute left-0 top-0 h-auto"
        style={{ width: u(340) }}
      />
      <div className="absolute flex flex-col items-center text-pp-cobalt" style={{ left: u(172), top: u(150) }}>
        <span lang="ja" className="font-bold leading-none tracking-[0.04em]" style={{ fontSize: u(40) }}>
          プリクラ
        </span>
        <span
          className="font-medium leading-none tracking-[0.32em] text-pp-slate"
          style={{ fontSize: u(12), marginTop: u(10) }}
        >
          PHOTO BOOTH
        </span>
      </div>
    </div>
  );
}

function SlotHeading({ ja, en }: { ja: ReactNode; en: string }) {
  return (
    <div className="whitespace-nowrap">
      <p lang="ja" className="font-bold leading-tight text-pp-cobalt" style={{ fontSize: u(24) }}>
        {ja}
      </p>
      <p className="leading-tight tracking-[0.03em] text-pp-slate" style={{ fontSize: u(18) }}>
        {en}
      </p>
    </div>
  );
}

function SlotCaption({ ja, en }: { ja: string; en: string }) {
  return (
    <div className="whitespace-nowrap">
      <p lang="ja" className="font-bold leading-tight text-pp-blue-deep" style={{ fontSize: u(17) }}>
        {ja}
      </p>
      <p className="leading-tight text-pp-slate" style={{ fontSize: u(14) }}>
        {en}
      </p>
    </div>
  );
}

/** Decorative only: the booth is free, these mimic a real purikura machine's front panel. */
function PaymentSlots() {
  return (
    <div className="pay-row" aria-hidden>
      <div className="pay-col" style={{ width: u(262) }}>
        <SlotHeading
          ja={
            <>
              千円札 <span className="text-[0.8em]">投入口</span>
            </>
          }
          en="Insert Bills"
        />
        {/* Bill slot, with the bill centred under it. */}
        <div className="flex flex-col items-center" style={{ width: u(250), gap: u(6) }}>
          <div
            className="flex w-full items-center justify-center border border-[#9aa0a8] bg-[linear-gradient(180deg,#fbfbfc_0%,#d9dce0_38%,#b5bac1_62%,#e9ebee_100%)]"
            style={{ height: u(54), borderRadius: u(9), boxShadow: `0 ${u(4)} ${u(8)} rgba(10,45,105,0.25)` }}
          >
            <div
              className="w-[86%] rounded-full bg-[linear-gradient(180deg,#0b0d10,#2b2f35)]"
              style={{ height: u(14), boxShadow: `inset 0 ${u(3)} ${u(4)} rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.9)` }}
            />
          </div>
          <Image src="/ui/yen-bill.svg" alt="" width={437} height={244} unoptimized style={{ height: u(78), width: "auto" }} />
        </div>
        <SlotCaption ja="1000円札のみ" en="1000 yen bills only" />
      </div>

      <div className="pay-divider" />

      <div className="pay-col flex-1">
        <SlotHeading
          ja={
            <>
              硬貨 <span className="text-[0.8em]">投入口</span>
            </>
          }
          en="Insert Coins"
        />
        <div className="flex items-center" style={{ gap: u(20) }}>
          {/* Coin slot */}
          <div
            className="flex shrink-0 items-center justify-center rounded-full border border-[#8f959d] bg-[radial-gradient(circle_at_35%_30%,#ffffff_0%,#dfe2e6_35%,#a9aeb5_75%,#868c94_100%)]"
            style={{ width: u(108), height: u(108), boxShadow: `0 ${u(5)} ${u(9)} rgba(10,45,105,0.3)` }}
          >
            <div
              className="flex items-center justify-center rounded-full bg-[radial-gradient(circle_at_60%_70%,#f2f3f5_0%,#c2c6cc_60%,#9ca1a8_100%)]"
              style={{ width: u(84), height: u(84), boxShadow: `inset 0 ${u(2)} ${u(5)} rgba(0,0,0,0.35)` }}
            >
              <div
                className="rounded-full bg-[linear-gradient(90deg,#1a1d21,#000)] shadow-[1px_0_0_rgba(255,255,255,0.8)]"
                style={{ width: u(12), height: u(52) }}
              />
            </div>
          </div>
          <CoinMarks />
        </div>
        {/* Spacer so both captions sit on the same baseline. */}
        <div style={{ height: u(14) }} />
        <SlotCaption ja="500・100・50・10 円硬貨のみ" en="500 / 100 / 50 / 10 yen coins only" />
      </div>
    </div>
  );
}

/** The four accepted coins as outlined circles (50 yen has its hole). */
function CoinMarks() {
  const coin = "absolute flex items-center justify-center rounded-full border-2 border-pp-cobalt font-bold leading-none text-pp-cobalt";
  const at = (left: number, top: number, size: number, font: number) => ({
    left: u(left),
    top: u(top),
    width: u(size),
    height: u(size),
    fontSize: u(font),
  });
  return (
    <div className="relative shrink-0" style={{ width: u(112), height: u(108) }}>
      <span className={coin} style={at(0, 0, 44, 16)}>
        500
      </span>
      <span className={`${coin} flex-col`} style={at(54, 20, 34, 11.5)}>
        50
        <span className="rounded-full border-2 border-pp-cobalt" style={{ width: u(8), height: u(8), marginTop: u(1) }} />
      </span>
      <span className={coin} style={at(0, 56, 44, 16)}>
        100
      </span>
      <span className={coin} style={at(70, 60, 36, 14)}>
        10
      </span>
    </div>
  );
}

/**
 * The supplied frame artwork with the camera inside its inner window. Until the
 * camera is live the window keeps the artwork's dark blue (standby); the video
 * only appears once it is actually playing, mirrored.
 */
function MirrorPreview({
  stream,
  status,
  error,
  onEnable,
}: {
  stream: MediaStream | null;
  status: BoothState["cameraStatus"];
  error: BoothState["error"];
  onEnable: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState<MediaStream | null>(null);
  const showing = !!stream && playing === stream;

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) el.play().catch(() => {});
  }, [stream]);

  const errorCopy = error ? ERROR_COPY[error] : null;

  return (
    <div style={{ width: "calc(var(--u) * var(--mirror))" }}>
      <div className="relative aspect-[319.5/370.5] w-full">
        <Image src="/ui/mirror-frame.svg" alt="" width={426} height={494} priority unoptimized className="h-full w-full" />
        <div className="absolute overflow-hidden" style={MIRROR_WINDOW}>
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            disablePictureInPicture
            onPlaying={(e) => setPlaying(e.currentTarget.srcObject as MediaStream | null)}
            className={`absolute inset-0 h-full w-full -scale-x-100 object-cover transition-opacity duration-300 ${
              showing ? "opacity-100" : "opacity-0"
            }`}
          />
          {!showing && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center text-center text-white"
              style={{ gap: u(14), padding: "8%" }}
              role="status"
            >
              {status === "starting" || (status === "live" && !showing) ? (
                <>
                  <p lang="ja" className="font-bold" style={{ fontSize: u(18) }}>
                    カメラを起動中…
                  </p>
                  <p className="text-white/75" style={{ fontSize: u(14) }}>
                    Starting camera. Tap Allow if asked.
                  </p>
                </>
              ) : (
                <>
                  {errorCopy && (
                    <p className="leading-snug text-white/80" style={{ fontSize: u(14) }}>
                      <strong className="text-white">{errorCopy.title}.</strong> {errorCopy.body}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={onEnable}
                    className="min-h-12 rounded-full bg-white font-bold text-pp-cobalt shadow-[0_4px_12px_rgba(0,0,0,0.25)] active:scale-[0.98]"
                    style={{ padding: `${u(10)} ${u(24)}` }}
                  >
                    <span lang="ja" className="block leading-tight" style={{ fontSize: u(17) }}>
                      カメラをオンにする
                    </span>
                    <span className="block leading-tight" style={{ fontSize: u(13) }}>
                      Enable camera
                    </span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="ml-[40%] flex items-stretch" style={{ marginTop: u(8), gap: u(9) }} aria-hidden>
        <span className="bg-pp-blue-deep" style={{ width: u(3) }} />
        <div className="whitespace-nowrap">
          <p lang="ja" className="leading-tight text-pp-slate" style={{ fontSize: u(13) }}>
            ガイドライン
          </p>
          <p lang="ja" className="font-bold leading-tight text-pp-blue-deep" style={{ fontSize: u(17) }}>
            顔の中心
          </p>
          <p className="leading-tight tracking-[0.03em] text-pp-slate" style={{ fontSize: u(14) }}>
            Face here
          </p>
        </div>
      </div>
    </div>
  );
}

function StepNumber({ n, inverse = false }: { n: number; inverse?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold leading-none ${
        inverse ? "bg-white text-pp-cobalt" : "bg-pp-cobalt text-white"
      }`}
      style={{ width: u(22), height: u(22), fontSize: u(14) }}
    >
      {n}
    </span>
  );
}

/** "How it works" strip along the bottom: four fixed cells that never wrap. */
function HowItWorks() {
  const ja = "flex items-center font-bold leading-tight";
  const jaStyle = { fontSize: u(17), gap: u(6) };
  const en = "leading-tight";
  const enStyle = { fontSize: u(14) };
  const cell = "flex min-w-0 items-center justify-center whitespace-nowrap";
  const cellStyle = { gap: u(12), padding: `0 ${u(10)}` };
  return (
    <ol
      data-enter
      aria-label="How it works"
      className="welcome-guide items-stretch border-[1.5px] border-pp-slate/60 bg-white/70"
      style={{ borderRadius: u(14), padding: u(7) }}
    >
      <li className="flex min-w-0 whitespace-nowrap" style={{ padding: u(4) }}>
        <div className="flex w-full items-center justify-center bg-pp-cobalt text-white" style={{ gap: u(10), borderRadius: u(8) }}>
          <StepNumber n={1} inverse />
          <Image src="/ui/camera-icon.svg" alt="" width={62} height={49} unoptimized style={{ height: u(40), width: "auto" }} />
          <div>
            <p lang="ja" className={ja} style={jaStyle}>
              撮影をはじめる
            </p>
            <p className={en} style={enStyle}>
              Press Start
              <br />
              Photo Session
            </p>
          </div>
        </div>
      </li>
      <li className={cell} style={cellStyle}>
        <Image src="/ui/friends-posing.svg" alt="" width={60} height={46} unoptimized style={{ height: u(46), width: "auto" }} />
        <div className="text-pp-cobalt">
          <p lang="ja" className={ja} style={jaStyle}>
            <StepNumber n={2} />
            写真をとる
          </p>
          <p className={`${en} text-pp-slate`} style={{ ...enStyle, paddingLeft: u(28) }}>
            Take Photos
          </p>
        </div>
      </li>
      <li className={cell} style={cellStyle}>
        <Image src="/ui/photostrips-icon.svg" alt="" width={80} height={69} unoptimized style={{ height: u(50), width: "auto" }} />
        <div className="text-pp-cobalt">
          <p lang="ja" className={ja} style={jaStyle}>
            <StepNumber n={3} />
            できあがり!
          </p>
          <p className={`${en} text-pp-slate`} style={{ ...enStyle, paddingLeft: u(28) }}>
            Get Your Photos
          </p>
        </div>
      </li>
      <li className={cell} style={cellStyle}>
        <Image src="/ui/warning-sign.svg" alt="" width={308} height={308} unoptimized style={{ height: u(38), width: "auto" }} />
        <div>
          <p lang="ja" className="font-bold leading-tight text-pp-red" style={{ fontSize: u(16) }}>
            1ページごとに制限時間があります
          </p>
          <p className={`${en} text-pp-blue-deep`} style={enStyle}>
            Each page has a timer.
            <br />
            Please keep the session moving.
          </p>
        </div>
      </li>
    </ol>
  );
}
