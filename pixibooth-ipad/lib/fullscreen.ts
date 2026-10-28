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

/** Element full screen, or the app launched full screen from the Home Screen (no browser bars). */
export function isKioskFullscreen(): boolean {
  if (isFullscreen()) return true;
  return window.matchMedia("(display-mode: fullscreen)").matches || window.matchMedia("(display-mode: standalone)").matches;
}

/** Calls `onChange` whenever full screen is entered or left; returns the unsubscribe. */
export function subscribeFullscreen(onChange: () => void): () => void {
  document.addEventListener("fullscreenchange", onChange);
  document.addEventListener("webkitfullscreenchange", onChange);
  return () => {
    document.removeEventListener("fullscreenchange", onChange);
    document.removeEventListener("webkitfullscreenchange", onChange);
  };
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
