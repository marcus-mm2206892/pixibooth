// The booth's finite state machine, kept outside React so timers, camera,
// sounds and capture tokens are never duplicated by re-renders or Strict Mode.
// React subscribes with useSyncExternalStore and only calls the public actions.

import type { CameraAdapter, CameraErrorKind, FacingMode } from "./camera";
import { toCameraError } from "./camera";
import type { BoothSettings, FilterId, PhotoSession, TemplateColor } from "./session";
import {
  DEFAULT_SETTINGS,
  TIMING,
  blankSession,
  createSession,
  emptyPhotos,
  isComplete,
  nextEmptySlot,
} from "./session";
import { makeCapturedPhoto, releasePhoto } from "./photos";
import { SLOT_ASPECT } from "./photostrip";
import { BoothAudio } from "./audio";

export type BoothPhase =
  | "welcome"
  | "template-select"
  | "filter-select"
  | "camera-setup"
  | "camera-ready"
  | "countdown"
  | "capturing"
  | "pose-break"
  | "paused"
  | "review"
  | "result"
  | "finale"
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
  cameraStatus: "off" | "starting" | "live";
  stream: MediaStream | null;
  error: CameraErrorKind | null;
  errorDetail: string | null;
  pausedBy: "hidden" | "user" | null;
  facing: FacingMode;
  mirror: boolean;
  cameraCount: number;
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

const SETTINGS_KEY = "pixipocket:settings";

function initialState(): BoothState {
  return {
    phase: "welcome",
    session: blankSession(),
    mode: "sequence",
    activeSlot: null,
    retakeSlot: null,
    countdown: null,
    flashCount: 0,
    cameraStatus: "off",
    stream: null,
    error: null,
    errorDetail: null,
    pausedBy: null,
    facing: "user",
    mirror: true,
    cameraCount: 1,
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

  /** Client-only setup (localStorage). Call once after mount. */
  hydrate() {
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (raw) this.patch({ settings: { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } });
    } catch {
      // ignore unreadable/blocked storage
    }
  }

  /** Stops timers and the camera (unmount, Fast Refresh). The engine stays usable. */
  shutdown() {
    this.cancelRun();
    this.stopCamera();
  }

  // ── navigation ────────────────────────────────────────────────────────────

  begin() {
    this.unlockAudio();
    this.resetTo("template-select");
  }

  /** Clears every photo, pose, timer and error, then returns to template selection. */
  newSession() {
    this.resetTo("template-select");
  }

  goHome() {
    this.resetTo("welcome");
  }

  private resetTo(phase: "welcome" | "template-select") {
    this.cancelRun();
    this.stopCamera();
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
  }

  showTemplates() {
    if (isCapturePhase(this.state.phase)) return;
    this.patch({ phase: "template-select" });
  }

  showFilters() {
    if (isCapturePhase(this.state.phase)) return;
    this.patch({ phase: "filter-select" });
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

  showResult() {
    const { phase, session } = this.state;
    if ((phase !== "review" && phase !== "finale") || !isComplete(session.photos)) return;
    this.stopCamera();
    this.patch({ phase: "result" });
  }

  showReview() {
    if (this.state.phase !== "result") return;
    this.patch({ phase: "review" });
  }

  /** The last screen of the customer flow (mock QR). */
  showFinale() {
    if (this.state.phase !== "result" || !isComplete(this.state.session.photos)) return;
    this.patch({ phase: "finale" });
  }

  // ── camera ────────────────────────────────────────────────────────────────

  attachPreview(video: HTMLVideoElement | null) {
    this.camera.attachPreview?.(video);
  }

  enableCamera(): Promise<boolean> {
    if (!this.starting) {
      this.starting = this.startCamera().finally(() => {
        this.starting = null;
      });
    }
    return this.starting;
  }

  private async startCamera(): Promise<boolean> {
    this.patch({ phase: "camera-setup", cameraStatus: "starting", error: null, errorDetail: null });
    try {
      const stream = await this.camera.start(this.state.facing);
      this.patch({ stream, cameraStatus: "live" });
      if (this.state.phase === "camera-setup") this.patch({ phase: "camera-ready" });
      void this.camera.countCameras().then((cameraCount) => this.patch({ cameraCount }));
      void this.requestWakeLock();
      return true;
    } catch (err) {
      const e = toCameraError(err);
      this.patch({
        cameraStatus: "off",
        stream: null,
        phase: "error",
        error: e.kind,
        errorDetail: e.message,
      });
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

  /** Called from taps, so turning sound on also unlocks audio on iOS. */
  updateSettings(partial: Partial<BoothSettings>) {
    const settings = { ...this.state.settings, ...partial };
    this.patch({ settings });
    if (settings.sound) this.audio.unlock();
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // settings still apply for this page load
    }
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
      this.finishToReview();
      return;
    }
    this.beginShot(next);
  }

  retake(index: number) {
    const { phase, session } = this.state;
    if (phase !== "review" && phase !== "result") return;
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
      phase: isComplete(this.state.session.photos) ? "review" : "camera-ready",
    });
  }

  retakeAll() {
    if (this.state.phase !== "review" && this.state.phase !== "result") return;
    this.cancelRun();
    this.state.session.photos.forEach(releasePhoto);
    this.retakeOriginalId = null;
    this.patchSession({ photos: emptyPhotos() });
    this.patch({ mode: "sequence", retakeSlot: null, activeSlot: null });
    if (this.camera.isLive()) this.patch({ phase: "camera-ready" });
    else void this.enableCamera();
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
    if (target === null) this.finishToReview();
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
    this.patch({ phase: "countdown", activeSlot: slot, countdown: seconds, pausedBy: null });
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
    this.patchSession({ photos });
    // Flash + chime only for a frame that was actually saved.
    this.patch({ flashCount: this.state.flashCount + 1 });
    if (this.state.settings.sound) this.audio.shutter();

    // Paused (tab hidden) mid-capture: the shot is kept; Resume continues from here.
    if (gen !== this.gen) return;

    const next = nextEmptySlot(photos);
    if (this.state.mode === "retake" || next === -1) {
      this.runTimer(gen, TIMING.finishHoldMs, null, () => this.finishToReview());
      return;
    }
    this.patch({ phase: "pose-break", activeSlot: next });
    this.runTimer(gen, TIMING.poseBreakMs, null, () => this.runShot(next, gen));
  }

  private finishToReview() {
    this.cancelRun();
    this.retakeOriginalId = null;
    this.patch({
      phase: "review",
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
