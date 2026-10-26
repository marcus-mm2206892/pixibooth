// Full-screen helpers. iPadOS Safari supports element full screen (webkit-
// prefixed on older versions); iPhone Safari does not. For a kiosk, the most
// reliable route is still "Add to Home Screen" (see app/manifest.ts) plus
// Guided Access.

type WebkitDocument = Document & { webkitFullscreenElement?: Element | null };
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

export function isFullscreen(): boolean {
  const doc = document as WebkitDocument;
  return !!(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

export function canFullscreen(): boolean {
  const el = document.documentElement as WebkitElement;
  return typeof el.requestFullscreen === "function" || typeof el.webkitRequestFullscreen === "function";
}

/** Best-effort; must be called from a tap. Never throws. */
export function enterFullscreen(): void {
  if (typeof document === "undefined" || isFullscreen()) return;
  const el = document.documentElement as WebkitElement;
  try {
    const result = el.requestFullscreen ? el.requestFullscreen({ navigationUI: "hide" }) : el.webkitRequestFullscreen?.();
    if (result instanceof Promise) result.catch(() => {});
  } catch {
    // unsupported or blocked: the booth works the same without it
  }
}

/** Launched from the Home Screen icon (no browser bars at all). */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** True when the screen still shows browser chrome that full screen could remove. */
export function needsFullscreen(): boolean {
  return !isStandalone() && canFullscreen() && !isFullscreen();
}

/** Subscribe to full-screen changes (for useSyncExternalStore). */
export function onFullscreenChange(callback: () => void): () => void {
  document.addEventListener("fullscreenchange", callback);
  document.addEventListener("webkitfullscreenchange", callback);
  return () => {
    document.removeEventListener("fullscreenchange", callback);
    document.removeEventListener("webkitfullscreenchange", callback);
  };
}
