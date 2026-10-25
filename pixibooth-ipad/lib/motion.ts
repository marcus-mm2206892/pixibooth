// anime.js helpers. Everything is a no-op under prefers-reduced-motion, and
// nothing here is required for the booth to function.

import { animate, stagger } from "animejs";

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Fades/slides in every [data-enter] element inside `root`, staggered. */
export function enterStagger(root: Element | null) {
  if (!root) return;
  const items = Array.from(root.querySelectorAll<HTMLElement>("[data-enter]"));
  if (!items.length || reducedMotion()) return;
  items.forEach((el) => (el.style.opacity = "0"));
  return animate(items, {
    opacity: [0, 1],
    translateY: [18, 0],
    duration: 560,
    delay: stagger(55),
    ease: "outCubic",
  });
}

export function popIn(el: Element | null, from = 1.5) {
  if (!el || reducedMotion()) return;
  return animate(el, {
    scale: [from, 1],
    opacity: [0, 1],
    duration: 420,
    ease: "outBack(1.4)",
  });
}

export function bump(el: Element | null) {
  if (!el || reducedMotion()) return;
  return animate(el, {
    scale: [0.94, 1],
    duration: 380,
    ease: "outBack(2)",
  });
}

/** Shutter flash: full white, then fades out (~180 ms visible). */
export function shutterFlash(el: HTMLElement | null) {
  if (!el) return;
  if (reducedMotion()) {
    el.style.opacity = "0.85";
    window.setTimeout(() => (el.style.opacity = "0"), 150);
    return;
  }
  return animate(el, {
    opacity: [0.95, 0],
    duration: 320,
    ease: "outQuad",
  });
}

export function riseIn(el: Element | null, delay = 0) {
  if (!el || reducedMotion()) return;
  return animate(el, {
    opacity: [0, 1],
    translateY: [60, 0],
    rotate: [-2, 0],
    duration: 800,
    delay,
    ease: "outCubic",
  });
}
