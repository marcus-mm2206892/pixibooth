// The booth's finite state machine, kept outside React so timers, camera,
// sounds and capture tokens are never duplicated by re-renders or Strict Mode.
// React subscribes with useSyncExternalStore and only calls the public actions.

import type { CameraAdapter, CameraErrorKind, FacingMode } from "./camera";
import { toCameraError } from "./camera";
import type { BoothSettings, FilterId, PhotoSession, TemplateColor } from "./session";
import {
  DEFAULT_SETTINGS,
  MAX_RETAKES,
  TIMING,
  blankSession,
  createSession,
  isComplete,
  nextEmptySlot,
} from "./session";
import { makeCapturedPhoto, releasePhoto } from "./photos";
import { SLOT_ASPECT } from "./photostrip";
import { BoothAudio } from "./audio";

export type BoothPhase =
  | "welcome"
  /** Strip color + filter, with a live camera preview of the strip. */
  | "style-select"
  | "camera-setup"
  | "camera-ready"
  | "countdown"
  | "capturing"
  | "pose-break"
  | "paused"
  /** "Keep": strip preview, one optional retake, QR, finish. */
  | "result"
  /** Animated goodbye; returns to the welcome screen. */
  | "thanks"
  | "error";

export type CaptureMode = "sequence" | "retake";

export type BoothState = {
  phase: BoothPhase;
  session: PhotoSession;
  mode: CaptureMode;
  /** Slot being counted down/captured, or the upcoming slot during a pose break. */
  activeSlot: number | null;
  retakeSlot: number | null;
  countdown: number | null;
  /** Increments once per successful exposure; drives flash + celebration. */
  flashCount: number;
  /** Increments each time a countdown (re)starts; restarts the on-frame timer bar. */
  shotSerial: number;
  cameraStatus: "off" | "starting" | "live";
  stream: MediaStream | null;
  error: CameraErrorKind | null;
  errorDetail: string | null;
  pausedBy: "hidden" | "user" | null;
  facing: FacingMode;
  mirror: boolean;
  cameraCount: number;
  /** Browser camera permission as reported by the Permissions API ("unknown" if unsupported). */
  cameraPermission: "granted" | "prompt" | "denied" | "unknown";
  settings: BoothSettings;
};

const CAPTURE_PHASES: ReadonlySet<BoothPhase> = new Set(["countdown", "capturing", "pose-break"]);
const CAMERA_PHASES: ReadonlySet<BoothPhase> = new Set([
  "camera-setup",
  "camera-ready",
  "countdown",
  "capturing",
  "pose-break",
  "paused",
]);

export const isCapturePhase = (phase: BoothPhase) => CAPTURE_PHASES.has(phase);
export const isCameraPhase = (phase: BoothPhase) => CAMERA_PHASES.has(phase);

function initialState(): BoothState {
  return {
    phase: "welcome",
    session: blankSession(),
    mode: "sequence",
    activeSlot: null,
    retakeSlot: null,
    countdown: null,
    flashCount: 0,
    shotSerial: 0,
    cameraStatus: "off",
    stream: null,
    error: null,
    errorDetail: null,
    pausedBy: null,
    facing: "user",
    mirror: true,
    cameraCount: 1,
    cameraPermission: "unknown",
    settings: DEFAULT_SETTINGS,
  };
}

export class BoothEngine {
  private state: BoothState = initialState();
  private listeners = new Set<() => void>();
  /** Bumped whenever a running sequence must stop; stale callbacks compare against it. */
  private gen = 0;
  private raf = 0;
  private captureInFlight = false;
  private retakeOriginalId: string | null = null;
  private starting: Promise<boolean> | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private audio = new BoothAudio();

  constructor(private camera: CameraAdapter) {
    camera.setOnLost(() => this.handleCameraLost());
  }

  // ── store plumbing ────────────────────────────────────────────────────────

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  private patch(partial: Partial<BoothState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((l) => l());
  }

  private patchSession(partial: Partial<PhotoSession>) {
    this.patch({ session: { ...this.state.session, ...partial } });
  }

  /** Stops timers and the camera (unmount, Fast Refresh). The engine stays usable. */
  shutdown() {
    this.cancelRun();
    this.stopCamera();
  }

  // ── navigation ────────────────────────────────────────────────────────────

  /** Called from the Start tap, so the camera permission prompt follows a user gesture. */
  begin() {
    this.unlockAudio();
    this.resetTo("style-select");
  }

  /** Clears every photo, pose, timer and error, then returns to the style screen. */
  newSession() {
    this.resetTo("style-select");
  }

  goHome() {
    this.resetTo("welcome");
  }

  private resetTo(phase: "welcome" | "style-select") {
    this.cancelRun();
    // Dedicated kiosk: the camera stays on between sessions so Start is instant.
    this.state.session.photos.forEach(releasePhoto);
    this.retakeOriginalId = null;
    this.patch({
      phase,
      session: phase === "welcome" ? blankSession() : createSession(),
      mode: "sequence",
      activeSlot: null,
      retakeSlot: null,
      countdown: null,
      error: null,
      errorDetail: null,
      pausedBy: null,
    });
    if (phase === "style-select") void this.startPreview();
  }

  showStyle() {
    if (isCapturePhase(this.state.phase)) return;
    this.patch({ phase: "style-select" });
    void this.startPreview();
  }

  showCamera() {
    if (isCapturePhase(this.state.phase)) return;
    this.patch({ phase: this.camera.isLive() ? "camera-ready" : "camera-setup", error: null });
  }

  setTemplate(template: TemplateColor) {
    if (isCapturePhase(this.state.phase)) return;
    this.patchSession({ template });
  }

  setFilter(filter: FilterId) {
    if (isCapturePhase(this.state.phase)) return;
    this.patchSession({ filter });
  }

  /** Ends the session from the Keep screen: clears photos and shows the goodbye screen. */
  finish() {
    if (this.state.phase !== "result") return;
    this.cancelRun();
    this.state.session.photos.forEach(releasePhoto);
    this.retakeOriginalId = null;
    this.patch({ phase: "thanks", session: blankSession(), mode: "sequence", retakeSlot: null, activeSlot: null });
  }

  // ── camera ────────────────────────────────────────────────────────────────

  attachPreview(video: HTMLVideoElement | null) {
    this.camera.attachPreview?.(video);
  }

  /** Starts (or restarts) the camera and moves to the camera screen. */
  enableCamera(): Promise<boolean> {
    return this.requestCamera(true);
  }

  /** Starts the camera for the style screen's live preview without navigating. */
  startPreview(): Promise<boolean> {
    if (this.camera.isLive()) return Promise.resolve(true);
    return this.requestCamera(false);
  }

  private requestCamera(navigate: boolean): Promise<boolean> {
    if (navigate) this.patch({ phase: "camera-setup" });
    if (!this.starting) {
      this.starting = this.startCamera().finally(() => {
        this.starting = null;
      });
    }
    return this.starting;
  }

  private async startCamera(): Promise<boolean> {
    this.patch({ cameraStatus: "starting", error: null, errorDetail: null });
    try {
      const stream = await this.camera.start(this.state.facing);
      this.patch({ stream, cameraStatus: "live" });
      if (this.state.phase === "camera-setup") this.patch({ phase: "camera-ready" });
      void this.camera.countCameras().then((cameraCount) => this.patch({ cameraCount }));
      void this.requestWakeLock();
      return true;
    } catch (err) {
      const e = toCameraError(err);
      this.patch({ cameraStatus: "off", stream: null, error: e.kind, errorDetail: e.message });
      // On the camera screen this becomes the error screen; the style screen just falls back to samples.
      if (this.state.phase === "camera-setup") this.patch({ phase: "error" });
      return false;
    }
  }

  private stopCamera() {
    this.camera.stop();
    this.releaseWakeLock();
    if (this.state.cameraStatus !== "off" || this.state.stream) {
      this.patch({ cameraStatus: "off", stream: null });
    }
  }

  private handleCameraLost() {
    const wasInCamera = isCameraPhase(this.state.phase);
    this.cancelRun();
    this.releaseWakeLock();
    this.patch({ cameraStatus: "off", stream: null, countdown: null });
    if (wasInCamera) this.patch({ phase: "error", error: "ended", errorDetail: null });
  }

  flipCamera() {
    if (this.state.phase !== "camera-ready" || this.state.cameraCount < 2) return;
    const facing: FacingMode = this.state.facing === "user" ? "environment" : "user";
    this.patch({ facing, mirror: facing === "user" });
    void this.enableCamera();
  }

  toggleMirror() {
    if (isCapturePhase(this.state.phase)) return;
    this.patch({ mirror: !this.state.mirror });
  }

  /** Pauses on hide; on return, re-acquires the wake lock and checks the camera survived. */
  handleVisibility(hidden: boolean) {
    if (hidden) {
      this.pause("hidden");
      return;
    }
    if (this.state.cameraStatus === "live") {
      if (!this.camera.isLive()) this.handleCameraLost();
      else void this.requestWakeLock();
    }
    // iPadOS may stop the camera while the app is in the background: bring it back
    // on screens that don't own a capture flow (no prompt once permission is granted).
    const { phase } = this.state;
    if ((phase === "welcome" || phase === "style-select" || phase === "result") && !this.camera.isLive()) {
      void this.startPreview();
    }
  }

  /**
   * App start (landing page): if camera access was already granted, start the
   * camera right away so Start is instant. First-time permission still needs a
   * tap (see the landing page's setup button). Never bypasses browser prompts.
   */
  async init() {
    let permission: BoothState["cameraPermission"] = "unknown";
    try {
      const status = await navigator.permissions?.query({ name: "camera" as PermissionName });
      if (status) {
        permission = status.state as BoothState["cameraPermission"];
        status.onchange = () => {
          this.patch({ cameraPermission: status.state as BoothState["cameraPermission"] });
          if (status.state === "granted" && !this.camera.isLive()) void this.startPreview();
        };
      }
    } catch {
      // Permissions API missing or "camera" unsupported: wait for the setup tap.
    }
    this.patch({ cameraPermission: permission });
    if (permission === "granted") await this.startPreview();
  }

  /** Recover from the error screen. */
  retryAfterError() {
    if (this.camera.isLive()) this.patch({ phase: "camera-ready", error: null, errorDetail: null });
    else void this.enableCamera();
  }

  // ── capture sequence ──────────────────────────────────────────────────────

  /** The single big button on the camera screen. Safe against double taps. */
  startCapture() {
    if (this.state.phase !== "camera-ready" || !this.camera.isLive()) return;
    this.unlockAudio();
    const { mode, retakeSlot, session } = this.state;
    if (mode === "retake" && retakeSlot !== null) {
      this.beginShot(retakeSlot);
      return;
    }
    const next = nextEmptySlot(session.photos);
    if (next === -1) {
      this.finishCapture();
      return;
    }
    this.beginShot(next);
  }

  /** One photo may be redone from the Keep screen; the countdown starts right away. */
  retake(index: number) {
    const { phase, session } = this.state;
    if (phase !== "result" || session.retakesUsed >= MAX_RETAKES) return;
    this.retakeOriginalId = session.photos[index]?.id ?? null;
    this.unlockAudio();
    this.patch({ mode: "retake", retakeSlot: index });
    if (this.camera.isLive()) this.beginShot(index);
    else void this.enableCamera();
  }

  cancelRetake() {
    if (this.state.mode !== "retake") return;
    this.cancelRun();
    this.retakeOriginalId = null;
    this.patch({
      mode: "sequence",
      retakeSlot: null,
      activeSlot: null,
      countdown: null,
      phase: isComplete(this.state.session.photos) ? "result" : "camera-ready",
    });
  }

  /** Stops the countdown/break without discarding shots. Returns true if it paused. */
  pause(reason: "hidden" | "user"): boolean {
    if (!isCapturePhase(this.state.phase)) return false;
    this.cancelRun();
    this.patch({ phase: "paused", countdown: null, pausedBy: reason });
    return true;
  }

  /** Restarts a full countdown for the current, not-yet-captured shot. */
  resume() {
    if (this.state.phase !== "paused") return;
    this.patch({ pausedBy: null });
    if (!this.camera.isLive()) {
      void this.enableCamera();
      return;
    }
    this.unlockAudio();
    const target = this.resumeTarget();
    if (target === null) this.finishCapture();
    else this.beginShot(target);
  }

  private resumeTarget(): number | null {
    const { mode, retakeSlot, session } = this.state;
    if (mode === "retake" && retakeSlot !== null) {
      const done = session.photos[retakeSlot]?.id !== this.retakeOriginalId;
      return done ? null : retakeSlot;
    }
    const next = nextEmptySlot(session.photos);
    return next === -1 ? null : next;
  }

  private beginShot(slot: number) {
    this.cancelRun();
    this.runShot(slot, this.gen);
  }

  private runShot(slot: number, gen: number) {
    const seconds = TIMING.countdownSeconds;
    const total = seconds * 1000;
    this.patch({
      phase: "countdown",
      activeSlot: slot,
      countdown: seconds,
      pausedBy: null,
      shotSerial: this.state.shotSerial + 1,
    });
    this.playTick(seconds);
    this.runTimer(
      gen,
      total,
      (elapsed) => {
        const n = Math.max(1, Math.ceil((total - elapsed) / 1000));
        if (n !== this.state.countdown) {
          this.patch({ countdown: n });
          this.playTick(n);
        }
      },
      () => void this.captureSlot(slot, gen),
    );
  }

  private async captureSlot(slot: number, gen: number) {
    if (gen !== this.gen || this.captureInFlight) return;
    this.captureInFlight = true;
    const sessionId = this.state.session.id;
    this.patch({ phase: "capturing", countdown: null });

    let frame;
    try {
      frame = await this.camera.capturePhoto({ aspect: SLOT_ASPECT, mirror: this.state.mirror });
    } catch (err) {
      this.captureInFlight = false;
      if (gen !== this.gen) return;
      this.cancelRun();
      const e = toCameraError(err);
      this.patch({ phase: "error", error: e.kind, errorDetail: e.message, activeSlot: null });
      return;
    }
    this.captureInFlight = false;

    // The group was discarded while the frame was encoding: drop it.
    if (this.state.session.id !== sessionId) return;

    const photos = [...this.state.session.photos];
    releasePhoto(photos[slot]);
    photos[slot] = makeCapturedPhoto(frame);
    const retakesUsed = this.state.session.retakesUsed + (this.state.mode === "retake" ? 1 : 0);
    this.patchSession({ photos, retakesUsed });
    // Flash + chime only for a frame that was actually saved.
    this.patch({ flashCount: this.state.flashCount + 1 });
    if (this.state.settings.sound) this.audio.shutter();

    // Paused (tab hidden) mid-capture: the shot is kept; Resume continues from here.
    if (gen !== this.gen) return;

    const next = nextEmptySlot(photos);
    if (this.state.mode === "retake" || next === -1) {
      this.runTimer(gen, TIMING.finishHoldMs, null, () => this.finishCapture());
      return;
    }
    this.patch({ phase: "pose-break", activeSlot: next });
    this.runTimer(gen, TIMING.poseBreakMs, null, () => this.runShot(next, gen));
  }

  /** After the last (or retaken) photo: go to the Keep screen. */
  private finishCapture() {
    this.cancelRun();
    this.retakeOriginalId = null;
    this.patch({
      phase: "result",
      mode: "sequence",
      retakeSlot: null,
      activeSlot: null,
      countdown: null,
      pausedBy: null,
    });
  }

  // ── timing ────────────────────────────────────────────────────────────────

  private cancelRun() {
    this.gen++;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /**
   * Elapsed-time timer on requestAnimationFrame. If the main thread stalls
   * (long task, throttling), the stalled time is not counted, so a late frame
   * never skips numbers or fires the capture early.
   */
  private runTimer(
    gen: number,
    durationMs: number,
    onTick: ((elapsed: number) => void) | null,
    onDone: () => void,
  ) {
    let start = performance.now();
    let last = start;
    const frame = (now: number) => {
      if (gen !== this.gen) return;
      const gap = now - last;
      last = now;
      if (gap > 250) start += gap - 16;
      const elapsed = now - start;
      if (elapsed >= durationMs) {
        this.raf = 0;
        onDone();
        return;
      }
      onTick?.(elapsed);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  // ── extras: wake lock and sound (both best-effort) ────────────────────────

  private unlockAudio() {
    if (this.state.settings.sound) this.audio.unlock();
  }

  private playTick(n: number) {
    if (this.state.settings.sound) this.audio.tick(n);
  }

  private async requestWakeLock() {
    if (this.wakeLock || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    try {
      const lock = await navigator.wakeLock.request("screen");
      this.wakeLock = lock;
      lock.addEventListener("release", () => {
        if (this.wakeLock === lock) this.wakeLock = null;
      });
    } catch {
      // not allowed (e.g. Low Power Mode); staff can disable Auto-Lock instead
    }
  }

  private releaseWakeLock() {
    const lock = this.wakeLock;
    this.wakeLock = null;
    lock?.release().catch(() => {});
  }
}
