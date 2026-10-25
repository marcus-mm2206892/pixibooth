"use client";

import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";
import { reducedMotion } from "@/lib/motion";
import { PixelStar } from "./PixelStar";

const SPOTS = [
  { left: "8%", top: "12%", size: 18 },
  { left: "82%", top: "8%", size: 26 },
  { left: "90%", top: "46%", size: 14 },
  { left: "4%", top: "58%", size: 22 },
  { left: "76%", top: "84%", size: 18 },
  { left: "16%", top: "88%", size: 12 },
];

/** A brief burst of pixel stars around its parent (skipped for reduced motion). */
export function StarCelebration() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stars = root.current?.querySelectorAll("[data-star]");
    if (!stars?.length || reducedMotion()) return;
    const a = animate(stars, {
      opacity: [0, 1, 0],
      scale: [0.3, 1.2, 0.8],
      translateY: [12, -28],
      rotate: [0, 90],
      duration: 1400,
      delay: stagger(110, { start: 200 }),
      ease: "outQuad",
    });
    return () => {
      a.revert();
    };
  }, []);
  return (
    <div ref={root} className="pointer-events-none absolute inset-0" aria-hidden>
      {SPOTS.map((s, i) => (
        <span key={i} data-star className="absolute opacity-0" style={{ left: s.left, top: s.top }}>
          <PixelStar variant={i % 2 ? "sparkle" : "solid"} size={s.size} color="var(--pp-blue)" />
        </span>
      ))}
    </div>
  );
}
