"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { animate, stagger, type JSAnimation } from "animejs";
import { mulberry32 } from "@/lib/canvas";
import { reducedMotion } from "@/lib/motion";
import { PixelStar } from "./PixelStar";
import { Jp } from "./ui";

/** Seconds before the booth returns to the welcome screen on its own. */
const RETURN_SECONDS = 10;
const WIPE_COLS = 16;
const WIPE_ROWS = 10;
const TITLE = "THANK YOU!";
const CONFETTI_COLORS = ["#FFFFFF", "#1854B8", "#F5D979", "#F7B9CE", "#BFDFFF"];

/**
 * Goodbye screen after Finish: a pixel-block wipe, bouncing pixel letters, a
 * star mascot, falling pixel confetti and twinkling stars. Nothing on it is
 * tappable, so the message is always seen; it returns to the welcome screen
 * after the countdown with the reverse wipe.
 */
export function ThanksScreen({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);
  const [left, setLeft] = useState(RETURN_SECONDS);

  // Deterministic "random" layout for confetti and sparkles.
  const confetti = useMemo(() => {
    const rand = mulberry32(2026);
    return Array.from({ length: 42 }, (_, i) => ({
      left: rand() * 100,
      size: 6 + Math.round(rand() * 3) * 4,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      duration: 3200 + rand() * 3200,
      delay: rand() * 3000,
      drift: (rand() - 0.5) * 120,
    }));
  }, []);
  const sparkles = useMemo(() => {
    const rand = mulberry32(25);
    return Array.from({ length: 12 }, () => ({
      left: 4 + rand() * 92,
      top: 6 + rand() * 88,
      size: 12 + Math.round(rand() * 3) * 6,
    }));
  }, []);

  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    const cells = root.current?.querySelectorAll("[data-wipe]");
    if (!cells?.length || reducedMotion()) {
      onDone();
      return;
    }
    animate(cells, {
      scale: [0, 1],
      duration: 280,
      delay: stagger(14, { grid: [WIPE_COLS, WIPE_ROWS], from: "last" }),
      ease: "outQuad",
      onComplete: () => onDone(),
    });
  }, [onDone]);

  // Intro + idle animations.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = (sel: string) =>
      Array.from(el.querySelectorAll<HTMLElement>(sel));
    if (reducedMotion()) {
      q("[data-wipe]").forEach((c) => (c.style.transform = "scale(0)"));
      q("[data-letter]").forEach((c) => (c.style.opacity = "1"));
      q("[data-confetti]").forEach((c) => (c.style.display = "none"));
      return;
    }
    const anims: JSAnimation[] = [
      // Pixel blocks shrink away from the center to reveal the screen.
      animate(q("[data-wipe]"), {
        scale: [1, 0],
        duration: 360,
        delay: stagger(16, { grid: [WIPE_COLS, WIPE_ROWS], from: "center" }),
        ease: "inQuad",
      }),
      // Letters drop in one by one with a springy landing.
      animate(q("[data-letter]"), {
        translateY: [-140, 0],
        rotate: [-20, 0],
        opacity: [0, 1],
        duration: 900,
        delay: stagger(70, { start: 450 }),
        ease: "outElastic(1, .55)",
      }),
      // ...then keep doing a little wave.
      animate(q("[data-wave]"), {
        translateY: [0, -10],
        duration: 520,
        delay: stagger(80, { start: 1700 }),
        loop: true,
        alternate: true,
        ease: "inOutSine",
      }),
      animate(q("[data-mascot]"), {
        translateY: [0, -26],
        rotate: [-8, 8],
        duration: 560,
        loop: true,
        alternate: true,
        ease: "inOutQuad",
      }),
      animate(q("[data-fade]"), {
        opacity: [0, 1],
        translateY: [16, 0],
        duration: 600,
        delay: stagger(120, { start: 1300 }),
        ease: "outCubic",
      }),
      animate(q("[data-sparkle]"), {
        scale: [0.3, 1.2],
        opacity: [0.2, 1],
        duration: 700,
        delay: stagger(140),
        loop: true,
        alternate: true,
        ease: "inOutSine",
      }),
      ...q("[data-confetti]").map((c, i) =>
        animate(c, {
          translateY: ["-10vh", "112vh"],
          translateX: [0, confetti[i].drift],
          rotate: [0, 360],
          duration: confetti[i].duration,
          delay: confetti[i].delay,
          loop: true,
          ease: "linear",
        }),
      ),
    ];
    return () => anims.forEach((a) => a.revert());
  }, [confetti]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setLeft((n) => Math.max(0, n - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (left === 0) leave();
  }, [left, leave]);

  return (
    <div
      ref={root}
      className="kiosk relative overflow-hidden bg-pp-navy px-dots-faint text-white"
      role="dialog"
      aria-label="Thank you"
    >
      {/* Falling pixel confetti. */}
      {confetti.map((c, i) => (
        <span
          key={i}
          data-confetti
          aria-hidden
          className="pointer-events-none absolute top-0"
          style={{
            left: `${c.left}%`,
            width: c.size,
            height: c.size,
            background: c.color,
            transform: "translateY(-10vh)",
          }}
        />
      ))}
      {sparkles.map((s, i) => (
        <span
          key={i}
          data-sparkle
          aria-hidden
          className="pointer-events-none absolute"
          style={{ left: `${s.left}%`, top: `${s.top}%` }}
        >
          <PixelStar variant="sparkle" size={s.size} color="#FFFFFF" />
        </span>
      ))}

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center phone:gap-4 phone:p-5 [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:p-3">
        <span
          data-mascot
          className="inline-block phone:-my-3 phone:scale-75 [@media(max-height:500px)]:scale-50 [@media(max-height:500px)]:-my-8"
        >
          <PixelStar
            variant="duo"
            size={120}
            color="#FFFFFF"
            accent="var(--pp-blue)"
          />
        </span>

        <h1
          className="flex font-pixel text-[clamp(2.25rem,min(11vw,15vh),8rem)] leading-none"
          aria-label={TITLE}
        >
          {[...TITLE].map((ch, i) => (
            <span
              key={i}
              data-letter
              aria-hidden
              className="inline-block"
              style={{ opacity: 0 }}
            >
              <span data-wave className="inline-block">
                {ch === " " ? " " : ch}
              </span>
            </span>
          ))}
        </h1>
        <p
          data-fade
          className="font-pixel text-3xl text-pp-blue-light phone:text-2xl"
        >
          <Jp>ありがとう！</Jp>
        </p>

        <div data-fade className="max-w-2xl">
          <p className="font-pixel text-2xl leading-snug phone:text-lg [@media(max-height:500px)]:text-base">
            Enjoy your new photostrip!
          </p>
          <p className="mt-2 text-lg text-white/75 phone:text-sm">
            <Jp>ブースを出て、プリントをお受け取りください</Jp>
          </p>
        </div>

        <div
          data-fade
          className="mt-4 flex flex-col items-center gap-3 [@media(max-height:500px)]:mt-1"
        >
          <p
            className="font-label text-sm font-bold tracking-[0.18em] text-white/60"
            aria-live="polite"
          >
            RETURNING TO START IN {left}
          </p>
        </div>
      </div>

      {/* Pixel-block wipe (in on mount, out when leaving). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 grid"
        style={{
          gridTemplateColumns: `repeat(${WIPE_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${WIPE_ROWS}, 1fr)`,
        }}
      >
        {Array.from({ length: WIPE_COLS * WIPE_ROWS }, (_, i) => {
          const checker =
            (Math.floor(i / WIPE_COLS) + (i % WIPE_COLS)) % 2 === 0;
          return (
            <span
              key={i}
              data-wipe
              className={checker ? "bg-pp-blue" : "bg-pp-blue-deep"}
            />
          );
        })}
      </div>
    </div>
  );
}
