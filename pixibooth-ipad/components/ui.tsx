"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { enterStagger, popIn } from "@/lib/motion";
import { PixelStar } from "./PixelStar";

type Variant = "primary" | "secondary" | "inverse" | "outline-inverse" | "ghost" | "ghost-inverse";
type Size = "sm" | "md" | "lg" | "xl";

const SIZES: Record<Size, string> = {
  sm: "min-h-11 px-3 gap-1.5 text-base",
  md: "min-h-12 px-5 gap-2 text-lg",
  lg: "min-h-14 px-7 gap-2.5 text-xl",
  xl: "min-h-[76px] px-9 gap-3 text-[1.75rem]",
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
          className={`px-btn-face px-corners font-display font-bold uppercase leading-none tracking-wide ${SIZES[size]} ${faceClassName}`}
        >
          {children}
        </span>
      </span>
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
export function ScreenTitle({
  label,
  title,
  inverse = false,
  className = "",
}: {
  label: string;
  title: ReactNode;
  inverse?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className={`font-pixel text-sm tracking-[0.2em] ${inverse ? "text-white/75" : "text-pp-blue"}`}>{label}</p>
      <h1
        className={`mt-0.5 flex items-center gap-3 font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-5xl ${
          inverse ? "text-white" : "text-pp-blue"
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
        inverse ? "bg-white text-pp-blue" : "bg-pp-blue text-white"
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
  return (
    <span aria-hidden>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-pp-blue-dark/60 p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div ref={panel} className="px-shadow w-full max-w-md">
        <PixelFrame edge="bg-pp-blue" border={4} innerClassName="p-7 text-pp-ink">
          <p className="font-pixel text-sm tracking-[0.2em] text-pp-blue">CONFIRM ★</p>
          <h2 id="confirm-title" className="mt-1 font-display text-3xl font-extrabold uppercase text-pp-blue">
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
