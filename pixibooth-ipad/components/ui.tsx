"use client";

import Image from "next/image";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { enterStagger, popIn } from "@/lib/motion";
import { PixelStar } from "./PixelStar";

type Variant = "primary" | "danger" | "secondary" | "inverse" | "outline-inverse" | "ghost" | "ghost-inverse";
type Size = "sm" | "md" | "lg" | "xl";

const SIZES: Record<Size, string> = {
  sm: "min-h-11 px-3 gap-1.5 text-base",
  md: "min-h-12 px-5 gap-2 text-lg",
  lg: "min-h-14 px-7 gap-2.5 text-xl",
  xl: "min-h-[76px] px-9 gap-3 text-[1.6rem]",
};

/** Pixel button: stepped corners, hard offset shadow, 3px press. */
export function Button({
  variant = "primary",
  size = "lg",
  className = "",
  faceClassName = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; faceClassName?: string }) {
  return (
    <button type="button" data-variant={variant} className={`px-btn ${className}`} {...props}>
      <span className="px-btn-edge px-corners">
        <span
          className={`px-btn-face px-corners font-pixel uppercase leading-none tracking-wider ${SIZES[size]} ${faceClassName}`}
        >
          {children}
        </span>
      </span>
    </button>
  );
}

/**
 * Button whose face is a supplied artwork (public/ui/*.svg). The artwork carries
 * the visible label, so `label` is the accessible name. Extra children are
 * overlaid on the artwork (e.g. the Press to Start ring).
 */
export function ArtButton({
  src,
  label,
  width,
  height,
  className = "",
  style,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { src: string; label: string; width: number; height: number }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`art-btn ${className}`}
      style={{ aspectRatio: `${width} / ${height}`, ...style }}
      {...props}
    >
      <Image src={src} alt="" width={width} height={height} unoptimized draggable={false} priority />
      {children}
    </button>
  );
}

/** A stepped-corner frame: an edge layer with a fill layer inset by `border` px. */
export function PixelFrame({
  edge = "bg-pp-blue",
  fill = "bg-white",
  border = 3,
  step = 4,
  className = "",
  innerClassName = "",
  children,
  style,
}: {
  edge?: string;
  fill?: string;
  border?: number;
  step?: number;
  className?: string;
  innerClassName?: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const s = { "--s": `${step}px` } as CSSProperties;
  return (
    <div className={`px-corners flex ${edge} ${className}`} style={{ ...s, padding: border, ...style }}>
      <div className={`px-corners min-h-0 min-w-0 flex-1 ${fill} ${innerClassName}`} style={s}>
        {children}
      </div>
    </div>
  );
}

/** Step label (pixel font) + display title, used at the top of each screen. */
/** Short Japanese accent text (pixel font, marked lang="ja" for correct glyphs and screen readers). */
export function Jp({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span lang="ja" className={`font-pixel tracking-normal ${className}`}>
      {children}
    </span>
  );
}

export function ScreenTitle({
  label,
  jp,
  title,
  inverse = false,
  className = "",
}: {
  label: string;
  /** Japanese sub-label shown after the step label. */
  jp?: string;
  title: ReactNode;
  inverse?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className={`font-label text-base font-bold uppercase tracking-[0.18em] ${inverse ? "text-white/75" : "text-pp-blue"}`}>
        {label}
        {jp && <Jp className="ml-3 opacity-80">{jp}</Jp>}
      </p>
      <h1
        className={`mt-1 flex items-center gap-3 font-pixel text-3xl uppercase leading-tight sm:text-4xl short:sm:text-3xl ${
          inverse ? "text-white" : "text-pp-navy"
        }`}
      >
        {title}
        <PixelStar size={26} color={inverse ? "#FFFFFF" : "var(--pp-blue)"} />
      </h1>
    </div>
  );
}

/** Pixel-font chip for short machine labels like "SHOT 02 / 04". */
export function PixelTag({
  children,
  inverse = false,
  className = "",
}: {
  children: ReactNode;
  inverse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`px-corners px-corners-sm inline-flex items-center gap-1.5 px-2.5 py-1 font-pixel text-sm tracking-wider ${
        inverse ? "bg-white text-pp-navy" : "bg-pp-navy text-white"
      } ${className}`}
    >
      {children}
    </span>
  );
}

/** Single-choice pixel chip (role=radio). */
export function Chip({
  selected,
  children,
  inverse = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean; inverse?: boolean }) {
  const variant: Variant = selected ? (inverse ? "inverse" : "primary") : inverse ? "outline-inverse" : "secondary";
  return (
    <Button
      role="radio"
      aria-checked={selected}
      variant={variant}
      size="sm"
      className={className}
      faceClassName="text-[1.05rem]"
      {...props}
    >
      {selected && <PixelStar size={13} />}
      {children}
    </Button>
  );
}

/** Thin crop/registration marks in the four corners of a relative parent. */
export function RegMarks({ className = "border-pp-blue-line" }: { className?: string }) {
  const base = `pointer-events-none absolute size-4 ${className}`;
  // display:contents so the wrapper never takes a flex/grid slot; the marks are absolute.
  return (
    <span aria-hidden className="contents">
      <span className={`${base} left-2 top-2 border-l-2 border-t-2`} />
      <span className={`${base} right-2 top-2 border-r-2 border-t-2`} />
      <span className={`${base} bottom-2 left-2 border-b-2 border-l-2`} />
      <span className={`${base} bottom-2 right-2 border-b-2 border-r-2`} />
    </span>
  );
}

/** Animates [data-enter] descendants of the returned ref on mount. */
export function useEnterAnimation<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const animation = enterStagger(ref.current);
    return () => {
      animation?.revert();
    };
  }, []);
  return ref;
}

/** One blink of the standard arcade rhythm (.animate-arcade-soft in globals.css). */
export const BLINK_MS = 900;

/** [start, end) in ms since the schedule started. */
export type BlinkWindow = readonly [number, number];

/**
 * Whether a button should blink now, given `windows` measured from when `runKey`
 * became non-null (null stops it; a new key restarts it). With `repeatMs` the
 * schedule loops. Every check is against one start time, so it never drifts.
 * Pass module-level constants: new arrays each render would restart it.
 */
export function useBlinkSchedule(
  runKey: string | number | null,
  windows: readonly BlinkWindow[],
  repeatMs?: number,
): boolean {
  const [blinking, setBlinking] = useState(false);
  useEffect(() => {
    if (runKey === null) return;
    const start = performance.now();
    const edges = windows.flat();
    let timer = 0;
    const tick = () => {
      const elapsed = performance.now() - start;
      const t = repeatMs ? elapsed % repeatMs : elapsed;
      setBlinking(windows.some(([a, b]) => t >= a && t < b));
      const ahead = edges.filter((e) => e > t);
      const next = ahead.length ? Math.min(...ahead) : repeatMs;
      if (next !== undefined) timer = window.setTimeout(tick, next - t);
    };
    timer = window.setTimeout(tick, 0);
    return () => {
      window.clearTimeout(timer);
      setBlinking(false);
    };
  }, [runKey, windows, repeatMs]);
  return runKey !== null && blinking;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Keep going",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) popIn(panel.current, 0.9);
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-pp-navy/70 p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div ref={panel} className="px-shadow w-full max-w-md">
        <PixelFrame edge="bg-pp-navy" border={4} innerClassName="p-7 text-pp-ink">
          <p className="font-label text-base font-bold tracking-[0.18em] text-pp-blue">CONFIRM ★</p>
          <h2 id="confirm-title" className="mt-1 font-pixel text-2xl uppercase leading-tight text-pp-navy">
            {title}
          </h2>
          {body && <p className="mt-2 text-base">{body}</p>}
          <div className="mt-7 flex flex-col-reverse gap-4 sm:flex-row sm:justify-end">
            <Button variant="secondary" size="md" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button variant="primary" size="md" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </PixelFrame>
      </div>
    </div>
  );
}
