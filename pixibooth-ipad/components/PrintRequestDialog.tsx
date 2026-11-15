"use client";

import { useEffect, useRef } from "react";
import { popIn } from "@/lib/motion";
import { Button, Jp, PixelFrame } from "./ui";

export const INSTAGRAM_HANDLE = "@pixipocket_";
export const INSTAGRAM_DM_URL = "https://ig.me/m/pixipocket_";
export const INSTAGRAM_PROFILE_URL = "https://www.instagram.com/pixipocket_/";

/**
 * Steps of "Send to PixiPocket for Printing":
 * - "intro": shown first, explains what happens; nothing is shared or opened yet.
 * - "shared": the share sheet closed after the customer picked a target. We can't
 *   tell which app or chat they chose, so this only reminds them where to send it.
 * - "fallback": no file sharing here; the strip was downloaded for attaching in the DM.
 * No state claims the request reached PixiPocket: the site can't verify that.
 */
export type PrintRequestState = "intro" | "shared" | "fallback";

export function PrintRequestDialog({
  state,
  canShare,
  onSend,
  onClose,
}: {
  state: PrintRequestState;
  /** Whether "Send" opens the share sheet (true) or downloads + opens the DM (false). */
  canShare: boolean;
  /** Runs the actual send; called straight from the tap so the share sheet/new tab is allowed. */
  onSend: () => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    popIn(panel.current, 0.9);
  }, [state]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dmLink = (
    <a href={INSTAGRAM_DM_URL} target="_blank" rel="noopener noreferrer" data-variant="primary" className="px-btn inline-flex no-underline">
      <span className="px-btn-edge px-corners w-full">
        <span className="px-btn-face px-corners min-h-12 gap-2 px-5 font-pixel text-lg uppercase leading-none tracking-wider">
          Open Instagram DM
        </span>
      </span>
    </a>
  );
  const profileLink = (
    <a
      href={INSTAGRAM_PROFILE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="text-center text-sm text-pp-blue underline underline-offset-2"
    >
      DM link not working? Visit {INSTAGRAM_HANDLE} on Instagram
    </a>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-pp-navy/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={panel} className="px-shadow w-full max-w-md">
        <PixelFrame edge="bg-pp-navy" border={4} innerClassName="p-7 text-pp-ink phone:p-5">
          <p className="font-label text-base font-bold tracking-[0.18em] text-pp-blue">
            PRINT REQUEST <Jp className="ml-2 opacity-80">印刷を依頼する</Jp>
          </p>

          {state === "intro" && (
            <>
              <h2 id="print-title" className="mt-1 font-pixel text-2xl uppercase leading-tight text-pp-navy">
                Get your strip printed ♡
              </h2>
              <p className="mt-2 text-base">
                {canShare ? (
                  <>
                    Tap <strong>Send photostrip</strong>, choose <strong>Instagram</strong>, then send it to{" "}
                    <strong>{INSTAGRAM_HANDLE}</strong>. We&apos;ll print it from there.
                  </>
                ) : (
                  <>
                    We&apos;ll download your photostrip and open our Instagram DM. Attach the image and send it to{" "}
                    <strong>{INSTAGRAM_HANDLE}</strong> to request printing.
                  </>
                )}
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <Button variant="primary" size="md" onClick={onSend}>
                  {canShare ? "Send photostrip" : "Download & open DM"}
                </Button>
                <Button variant="secondary" size="md" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </>
          )}

          {state === "fallback" && (
            <>
              <h2 id="print-title" className="mt-1 font-pixel text-2xl uppercase leading-tight text-pp-navy">
                Your photostrip is ready! ♡
              </h2>
              <p className="mt-2 text-base">
                Please attach the downloaded image in our Instagram DM to request printing.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                {dmLink}
                {profileLink}
                <Button variant="secondary" size="md" onClick={onClose}>
                  Done
                </Button>
              </div>
            </>
          )}

          {state === "shared" && (
            <>
              <h2 id="print-title" className="mt-1 font-pixel text-2xl uppercase leading-tight text-pp-navy">
                Almost there ♡
              </h2>
              <p className="mt-2 text-base">
                Make sure your photostrip was sent to <strong>{INSTAGRAM_HANDLE}</strong> on Instagram so we can
                print it. If not, open our DM below and attach it there.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                {dmLink}
                {profileLink}
                <Button variant="secondary" size="md" onClick={onClose}>
                  Done
                </Button>
              </div>
            </>
          )}
        </PixelFrame>
      </div>
    </div>
  );
}
