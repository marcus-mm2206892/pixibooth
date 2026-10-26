"use client";

import { useEffect, useRef } from "react";
import { shutterFlash } from "@/lib/motion";

/**
 * Full-screen white flash on every successful exposure (also lights faces a
 * little for the next shot). Lives at the app root so it keeps fading even
 * when the last photo switches to the Keep screen.
 */
export function ShutterFlash({ count }: { count: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(count);
  useEffect(() => {
    if (count === last.current) return;
    last.current = count;
    shutterFlash(ref.current);
  }, [count]);
  return <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[100] bg-white opacity-0" />;
}
