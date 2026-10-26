// Camera adapter. The booth engine only talks to the `CameraAdapter`
// interface, so a future "Windows PC + USB DSLR" adapter can replace the
// browser camera without touching sequencing or compositing code.

import { canvasToBlob, coverCrop, get2d, makeCanvas, releaseCanvas } from "./canvas";

export type FacingMode = "user" | "environment";

export type CameraErrorKind =
  | "insecure"
  | "unsupported"
  | "denied"
  | "not-found"
  | "in-use"
  | "ended"
  | "capture-failed"
  | "unknown";

export class CameraError extends Error {
  constructor(
    public kind: CameraErrorKind,
    message?: string,
  ) {
    super(message ?? kind);
    this.name = "CameraError";
  }
}

export type CapturedFrame = { blob: Blob; width: number; height: number };

export type CaptureOptions = {
  /** Output aspect (width / height); the frame is center-cover-cropped to it. */
  aspect: number;
  mirror: boolean;
};

export interface CameraAdapter {
  start(facing: FacingMode): Promise<MediaStream>;
  stop(): void;
  isLive(): boolean;
  capturePhoto(options: CaptureOptions): Promise<CapturedFrame>;
  /** Called when the camera disappears (unplugged, revoked, OS took it). */
  setOnLost(callback: (() => void) | null): void;
  countCameras(): Promise<number>;
  /** Adapters that preview through an on-page <video> register it here. */
  attachPreview?(video: HTMLVideoElement | null): void;
}

/** Longest edge kept for captured stills; the device decides the real maximum. */
const MAX_CAPTURE_WIDTH = 2400;

export function toCameraError(err: unknown): CameraError {
  if (err instanceof CameraError) return err;
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : String(err);
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return new CameraError("denied", message);
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return new CameraError("not-found", message);
    case "NotSupportedError":
      return new CameraError("unsupported", message);
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return new CameraError("in-use", message);
    default:
      return new CameraError("unknown", message);
  }
}

export class BrowserCameraAdapter implements CameraAdapter {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private onLost: (() => void) | null = null;

  /** The visible <video> preview doubles as the frame source for captures. */
  attachPreview(video: HTMLVideoElement | null): void {
    this.video = video;
  }

  setOnLost(callback: (() => void) | null): void {
    this.onLost = callback;
  }

  isLive(): boolean {
    return !!this.stream?.getVideoTracks().some((t) => t.readyState === "live");
  }

  async start(facing: FacingMode): Promise<MediaStream> {
    if (typeof window === "undefined") throw new CameraError("unsupported");
    if (!window.isSecureContext) throw new CameraError("insecure");
    if (!navigator.mediaDevices?.getUserMedia) throw new CameraError("unsupported");

    this.stop();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facing },
          // 4:3 sensors crop least to the ~1.36:1 slot. These are hints only.
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name !== "OverconstrainedError") throw toCameraError(err);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      } catch (fallbackErr) {
        throw toCameraError(fallbackErr);
      }
    }

    this.stream = stream;
    for (const track of stream.getVideoTracks()) {
      track.addEventListener("ended", () => {
        if (this.stream !== stream) return;
        this.stream = null;
        this.onLost?.();
      });
    }
    return stream;
  }

  stop(): void {
    const stream = this.stream;
    this.stream = null;
    stream?.getTracks().forEach((t) => t.stop());
  }

  async countCameras(): Promise<number> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "videoinput").length;
    } catch {
      return 1;
    }
  }

  async capturePhoto({ aspect, mirror }: CaptureOptions): Promise<CapturedFrame> {
    const video = this.video;
    if (!video || !this.isLive()) throw new CameraError("ended");
    await waitForVideoReady(video, 2500);

    const crop = coverCrop(video.videoWidth, video.videoHeight, aspect);
    const scale = Math.min(1, MAX_CAPTURE_WIDTH / crop.sw);
    const canvas = makeCanvas(crop.sw * scale, crop.sh * scale);
    try {
      const ctx = get2d(canvas);
      if (mirror) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
      return { blob, width: canvas.width, height: canvas.height };
    } catch (err) {
      throw new CameraError("capture-failed", err instanceof Error ? err.message : String(err));
    } finally {
      releaseCanvas(canvas);
    }
  }
}

/** Resolves once the element is playing real frames with known dimensions. */
export function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 5000): Promise<void> {
  const ready = () =>
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0;
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const events = ["loadedmetadata", "loadeddata", "playing", "resize"] as const;
    const check = () => {
      if (!ready()) return;
      cleanup();
      resolve();
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new CameraError("capture-failed", "Camera preview did not start in time"));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timer);
      events.forEach((e) => video.removeEventListener(e, check));
    };
    events.forEach((e) => video.addEventListener(e, check));
  });
}
