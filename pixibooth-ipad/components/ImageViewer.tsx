"use client";

import { useState } from "react";
import { Close, Download } from "pixelarticons/react";
import type { NamedBlob } from "@/lib/downloads";
import { downloadBlob } from "@/lib/downloads";
import { Button } from "./ui";

/** Full-resolution viewer. On iPad, long-press the image → "Save to Photos". */
export function ImageViewer({ file, touch, onClose }: { file: NamedBlob; touch: boolean; onClose: () => void }) {
  const [url] = useState(() => URL.createObjectURL(file.blob));
  // Revoked on close rather than in an effect cleanup, which Strict Mode runs early.
  const close = () => {
    URL.revokeObjectURL(url);
    onClose();
  };

  return (
    <div
      className="kiosk fixed inset-0 z-50 bg-pp-blue-dark/95 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Full-size photostrip"
    >
      <div className="kiosk-body">
        <div className="flex items-center justify-between gap-3">
          <p className="font-pixel text-sm tracking-wider text-white/80">
            {touch ? "PRESS AND HOLD THE IMAGE › SAVE TO PHOTOS" : "FULL RESOLUTION · 600 × 1800 PX"}
          </p>
          <Button variant="inverse" size="md" onClick={close}>
            <Close className="size-5" aria-hidden />
            Close
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center py-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob URL of the generated PNG */}
          <img src={url} alt="Your photostrip" className="allow-callout max-h-full max-w-full object-contain" />
        </div>
        <div className="flex justify-center">
          <Button variant="inverse" onClick={() => downloadBlob(file.blob, file.filename)}>
            <Download className="size-6" aria-hidden />
            Download
          </Button>
        </div>
      </div>
    </div>
  );
}
