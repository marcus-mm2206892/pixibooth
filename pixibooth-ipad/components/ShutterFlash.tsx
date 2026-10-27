"use client";

import { useLayoutEffect, useRef } from "react";
import { shutterFlashRelease } from "@/lib/motion";

/**
 * Full-screen white flash that lights faces for the exposure. The engine
 * raises `peak` before grabbing the frame; this goes to full white in the same
 * commit (layout effect, before paint) and fades once `peak` drops after the
 * capture. Lives at the app root so the fade finishes even when the last photo
 * switches to the Keep screen.
 */
export function ShutterFlash({ peak }: { peak: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const fade = useRef<ReturnType<typeof shutterFlashRelease>>(undefined);
  const wasPeak = useRef(peak);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || peak === wasPeak.current) return;
    wasPeak.current = peak;
    if (peak) {
      fade.current?.pause();
      el.style.opacity = "1";
    } else {
      fade.current = shutterFlashRelease(el);
    }
  }, [peak]);
  return <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[100] bg-white opacity-0" />;
}
