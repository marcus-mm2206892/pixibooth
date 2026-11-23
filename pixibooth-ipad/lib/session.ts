// Session types, IDs and timing for one customer/group at the booth.

import { pickPoses } from "./poses";

export type TemplateColor =
  | "black"
  | "white"
  | "cherry"
  | "denim"
  | "vanilla"
  | "cloudy"
  | "sakura"
  | "matcha"
  | "butter"
  | "lavender"
  | "pocketid"
  | "foundation-day";

/** Filters customers can pick on the Style screen. */
export type FilterId = "none" | "vintage" | "dreamfilm";

/** Every filter a photo can be rendered with: the pickable ones plus frame-only built-ins. */
export type PhotoFilter = FilterId | "foundation-day-blue";

/**
 * Frames that come with their own mandatory filter. While one is selected the
 * picker is locked and this filter is used instead of `session.filter`, which
 * keeps the customer's own pick so it comes back when they switch frames.
 */
export const BUILT_IN_FILTER: Partial<Record<TemplateColor, PhotoFilter>> = {
  "foundation-day": "foundation-day-blue",
};

/** The filter actually rendered for this frame: its built-in one, else the customer's pick. Never both. */
export function appliedFilter(template: TemplateColor, filter: FilterId): PhotoFilter {
  return BUILT_IN_FILTER[template] ?? filter;
}

export type CapturedPhoto = {
  id: string;
  blob: Blob;
  previewUrl: string;
  capturedAt: number;
  width: number;
  height: number;
};

export type PhotoSession = {
  /** Human-readable, e.g. "20261025-S003". Empty until the session is started. */
  id: string;
  /** Session start; drives the date printed on the strip. */
  createdAt: number;
  template: TemplateColor;
  /** The customer's pick; see `appliedFilter` for what is rendered. */
  filter: FilterId;
  /** Always length SHOT_COUNT; null = not captured yet. */
  photos: Array<CapturedPhoto | null>;
  /** One pose prompt per slot, fixed for the session (retakes reuse their slot's prompt). */
  poses: string[];
  /** Single-photo retakes used from the Keep screen (limited to MAX_RETAKES). */
  retakesUsed: number;
};

export const SHOT_COUNT = 4;

/** Customers may redo at most this many photos after seeing their strip. */
export const MAX_RETAKES = 1;

export const TIMING = {
  /** 5 → 4 → 3 → 2 → 1 → capture, for every shot including retakes. */
  countdownSeconds: 5,
  /** Pose-change break after shots 1–3 (never after the last shot). */
  poseBreakMs: 2000,
  /** Full-white flash held on screen before the frame is grabbed (camera frame latency). */
  flashPeakHoldMs: 180,
  /** Short settle after the final/retake exposure so the flash and thumbnail are seen. */
  finishHoldMs: 700,
  /** Style screen time limit; then it continues to the camera with the current picks. */
  styleSelectMs: 60_000,
  /** "Get ready to pose" time limit; then the shots start on their own. */
  getReadyMs: 15_000,
};

export type BoothSettings = {
  /** Countdown ticks + shutter chime. */
  sound: boolean;
};

export const DEFAULT_SETTINGS: BoothSettings = {
  sound: true,
};

/**
 * Future integration boundary: a local Windows PC service could receive the
 * finished session (save to disk, print on the Epson, generate a QR gallery).
 * Intentionally not implemented in this browser-only phase.
 */
export interface SessionSink {
  saveSession(session: PhotoSession, strip: Blob): Promise<void>;
}

export function emptyPhotos(): Array<CapturedPhoto | null> {
  return Array.from({ length: SHOT_COUNT }, () => null);
}

/** A blank placeholder session (no ID, no poses) used before Start. */
export function blankSession(): PhotoSession {
  return { id: "", createdAt: 0, template: "white", filter: "none", photos: emptyPhotos(), poses: [], retakesUsed: 0 };
}

/** A real customer session. Client-only (reads localStorage, random poses). */
export function createSession(): PhotoSession {
  return {
    id: createSessionId(),
    createdAt: Date.now(),
    template: "white",
    filter: "none",
    photos: emptyPhotos(),
    poses: pickPoses(SHOT_COUNT),
    retakesUsed: 0,
  };
}

export function nextEmptySlot(photos: Array<CapturedPhoto | null>): number {
  return photos.findIndex((p) => p === null);
}

export function isComplete(photos: Array<CapturedPhoto | null>): boolean {
  return photos.every((p) => p !== null);
}

export function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dayStamp(date = new Date()): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/** Printed strip date in standard Japanese form, e.g. 2026年10月25日 (device-local time). */
export function stripDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** Zero-padded Japanese date, e.g. 2026年01月05日 (device-local time). Used by FOUNDATION DAY. */
export function stripDatePadded(date: Date): string {
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日`;
}

/** Sequential per-day session label (S001, S002…) kept in localStorage; random fallback. */
export function createSessionId(now = new Date()): string {
  const day = dayStamp(now);
  let n: number;
  try {
    const key = `pixipocket:session-counter:${day}`;
    n = Number(window.localStorage.getItem(key) ?? "0") + 1;
    window.localStorage.setItem(key, String(n));
  } catch {
    n = 100 + Math.floor(Math.random() * 900);
  }
  return `${day}-S${String(n).padStart(3, "0")}`;
}

/** Short decorative ticket number for the UI chrome, e.g. "S003". */
export function ticketNumber(session: PhotoSession): string {
  return session.id ? session.id.split("-").pop()! : "S000";
}

function filterSuffix(session: PhotoSession): string {
  const filter = appliedFilter(session.template, session.filter);
  return filter === "none" ? "" : `-${filter}`;
}

export function stripFilename(session: PhotoSession): string {
  const filter = filterSuffix(session);
  return `pixipocket-${session.id}-strip-${session.template}${filter}.png`;
}

export function photoFilename(session: PhotoSession, index: number): string {
  const filter = filterSuffix(session);
  return `pixipocket-${session.id}-photo-${index + 1}${filter}.jpg`;
}

/** "Download All Photos" file names: photo_01.jpg … photo_04.jpg. */
export function allPhotosFilename(index: number): string {
  return `photo_${pad(index + 1)}.jpg`;
}
