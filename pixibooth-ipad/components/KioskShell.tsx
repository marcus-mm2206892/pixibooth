"use client";

import Image from "next/image";
import type { ReactNode, RefObject } from "react";
import { LOGO_SRC } from "@/lib/photostrip";
import { PixelStar } from "./PixelStar";

const STEPS = ["STRIP", "FILTER", "SNAP", "KEEP"] as const;

/** "01 STRIP › 02 FILTER › 03 SNAP › 04 KEEP", current step boxed. */
export function StepTicker({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="hidden items-center gap-1.5 font-pixel text-sm tracking-wider md:flex" aria-label={`Step ${step} of 4`}>
      {STEPS.map((name, i) => {
        const n = i + 1;
        const current = n === step;
        return (
          <li key={name} className="flex items-center gap-1.5" aria-current={current ? "step" : undefined}>
            <span
              className={`px-corners px-corners-sm px-2 py-1 ${
                current ? "bg-white text-pp-blue" : n < step ? "text-white" : "text-white/55"
              }`}
            >
              {String(n).padStart(2, "0")} {name}
            </span>
            {n < STEPS.length && <span className="text-white/45">›</span>}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The booth "machine": a cobalt header band (real logo, step ticker, badge)
 * over a white or cobalt body. Every screen is rendered inside one.
 */
export function KioskShell({
  step,
  tone = "white",
  ticket,
  children,
  rootRef,
  bodyClassName = "",
}: {
  step?: 1 | 2 | 3 | 4;
  tone?: "white" | "blue";
  /** Decorative session number for the footer, e.g. "S003". */
  ticket?: string;
  children: ReactNode;
  rootRef?: RefObject<HTMLDivElement | null>;
  bodyClassName?: string;
}) {
  return (
    <div ref={rootRef} className={`kiosk ${tone === "blue" ? "bg-pp-blue text-white" : "bg-white text-pp-ink"}`}>
      <header
        className={`kiosk-bar flex shrink-0 items-center justify-between gap-4 bg-pp-blue text-white ${
          tone === "blue" ? "border-b-2 border-pp-blue-deep" : ""
        }`}
      >
        <Image
          src={LOGO_SRC.white}
          alt="pixipocket"
          width={1739}
          height={936}
          priority
          unoptimized
          className="h-10 w-auto"
        />
        {step && <StepTicker step={step} />}
        <span className="px-corners px-corners-sm flex items-center gap-2 border-2 border-white/80 px-2.5 py-1 font-pixel text-xs tracking-widest sm:text-sm">
          <PixelStar size={12} color="#FFFFFF" />
          PHOTO BOOTH / 4-CUT
        </span>
      </header>

      <main className={`kiosk-body ${ticket ? "pb-3!" : ""} ${bodyClassName}`}>{children}</main>

      {ticket && (
        <footer
          className={`flex shrink-0 items-center gap-3 px-[max(env(safe-area-inset-left),20px)] pb-[max(env(safe-area-inset-bottom),10px)] font-pixel text-xs tracking-widest ${
            tone === "blue" ? "text-white/60" : "text-pp-blue/70"
          }`}
        >
          <PixelStar variant="sparkle" size={10} />
          <span className="whitespace-nowrap">PRIVATE SESSION · NO. {ticket}</span>
          <span className="px-rule hidden flex-1 sm:block" />
          <span className="hidden whitespace-nowrap sm:inline">PHOTOS STAY ON THIS DEVICE</span>
        </footer>
      )}
    </div>
  );
}
