"use client";

import { useState } from "react";
import { ArrowLeft, Download, Expand, Images, Lock, Reload, Share } from "pixelarticons/react";
import type { PhotoSession } from "@/lib/session";
import { ticketNumber } from "@/lib/session";
import { ImageViewer } from "./ImageViewer";
import { KioskShell } from "./KioskShell";
import { MockQr } from "./MockQr";
import { PixelStar } from "./PixelStar";
import { StripCard } from "./ResultScreen";
import { useSessionExports } from "./useSessionExports";
import { Button, ConfirmDialog, Jp, PixelFrame, useEnterAnimation } from "./ui";

/** Final screen of the customer flow: a big, clearly-labelled mock QR plus real save actions. */
export function FinaleScreen({
  session,
  onBack,
  onNewSession,
}: {
  session: PhotoSession;
  onBack: () => void;
  onNewSession: () => void;
}) {
  const root = useEnterAnimation<HTMLDivElement>();
  const exports = useSessionExports(session);
  const [viewing, setViewing] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const verb = exports.touchShare ? "Save" : "Download";

  return (
    <KioskShell rootRef={root} step={4} ticket={ticketNumber(session)}>
      <div data-enter className="shrink-0 text-center">
        <p className="font-label text-base font-bold tracking-[0.18em] text-pp-blue">
          04 / FINISH ★ <Jp className="ml-2 opacity-80">ありがとう！</Jp>
        </p>
        <h1 className="font-pixel text-4xl uppercase leading-tight text-pp-navy sm:text-5xl">
          Your memories, ready!
        </h1>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_auto] content-center items-center gap-6 py-4 landscape:grid-cols-[1fr_auto_1fr] landscape:grid-rows-1">
        {/* Mini strip summary (landscape only, when there is room). */}
        <div data-enter className="hidden h-full max-h-[62vh] justify-end landscape:flex">
          <div className="h-full w-[min(100%,15rem)]">
            <StripCard session={session} />
          </div>
        </div>

        <div data-enter className="flex flex-col items-center gap-3">
          <div className="px-shadow">
            <PixelFrame edge="bg-pp-navy" border={6} step={6} innerClassName="relative p-4">
              <MockQr
                seed={session.id}
                className="w-[clamp(220px,min(44vh,32vw),360px)] portrait:w-[min(56vw,34vh,380px)]"
              />
              <PixelStar variant="sparkle" size={18} color="var(--pp-blue)" className="absolute -right-1 -top-1" />
            </PixelFrame>
          </div>
          <p className="flex items-center gap-2 font-pixel text-sm tracking-widest text-pp-navy">
            <Lock className="size-4" aria-hidden />
            QR PREVIEW ONLY · DIGITAL GALLERY COMING SOON
          </p>
          <p className="font-pixel text-xs text-pp-blue/70">
            <Jp>QRコード・準備中</Jp>
          </p>
        </div>

        <div
          data-enter
          className="mx-auto grid w-full max-w-md grid-cols-1 gap-4 sm:grid-cols-2 landscape:max-w-xs landscape:grid-cols-1"
        >
          <Button className="w-full" disabled={!exports.stripFile} onClick={exports.saveStrip}>
            {exports.touchShare ? <Share className="size-6" aria-hidden /> : <Download className="size-6" aria-hidden />}
            {verb} photo strip
          </Button>
          <Button variant="secondary" className="w-full" disabled={!exports.photoFiles} onClick={exports.saveAllPhotos}>
            <Images className="size-6" aria-hidden />
            {verb} individual photos
          </Button>
          <Button variant="secondary" className="w-full" disabled={!exports.stripFile} onClick={() => setViewing(true)}>
            <Expand className="size-6" aria-hidden />
            View photo strip
          </Button>
          <Button variant="secondary" className="w-full" disabled aria-describedby="qr-soon">
            <Share className="size-6" aria-hidden />
            Share via QR
            <span id="qr-soon" className="font-pixel text-[11px] tracking-wider">
              SOON
            </span>
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => setConfirmNew(true)}>
            <Reload className="size-6" aria-hidden />
            Start a new session
          </Button>
          {(exports.saved === "strip" || exports.saved === "photos") && (
            <p className="text-center font-pixel text-xs tracking-widest text-pp-blue">★ SAVED</p>
          )}
        </div>
      </div>

      <div data-enter className="shrink-0">
        <Button variant="ghost" size="md" onClick={onBack}>
          <ArrowLeft className="size-5" aria-hidden />
          Back to strip
        </Button>
      </div>

      {viewing && exports.stripFile && (
        <ImageViewer file={exports.stripFile} touch={exports.touchShare} onClose={() => setViewing(false)} />
      )}

      <ConfirmDialog
        open={confirmNew}
        title="Start a new session?"
        body="All four photos and the strip will be cleared from this device. Make sure you've saved what you want."
        confirmLabel="Clear & start new"
        cancelLabel="Not yet"
        onCancel={() => setConfirmNew(false)}
        onConfirm={() => {
          setConfirmNew(false);
          onNewSession();
        }}
      />
    </KioskShell>
  );
}
