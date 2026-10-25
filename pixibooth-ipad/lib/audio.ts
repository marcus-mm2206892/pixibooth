// Synthesized booth sounds (Web Audio, no files): a soft tick per countdown
// number and a click + chime on a successful capture. Everything is
// best-effort: if audio is blocked or the iPad is muted, capture is unaffected.

export class BoothAudio {
  private ctx: AudioContext | null = null;

  /** Must run synchronously inside a tap so iOS Safari lets the context start. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      // A silent buffer played in the gesture fully unlocks older iOS versions.
      const silent = this.ctx.createBuffer(1, 1, 22050);
      const source = this.ctx.createBufferSource();
      source.buffer = silent;
      source.connect(this.ctx.destination);
      source.start(0);
    } catch {
      this.ctx = null;
    }
  }

  /** Countdown tick; the last number ("1") is pitched higher. */
  tick(n: number): void {
    this.tone(n === 1 ? 1320 : 880, 0.11, 0.16, "triangle");
  }

  /** Shutter click followed by a small two-note chime. */
  shutter(): void {
    const ctx = this.ready();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      this.noise(ctx, t, 0.045, 0.5);
      this.noise(ctx, t + 0.07, 0.06, 0.32);
      this.tone(1568, 0.16, 0.1, "sine", 0.1);
      this.tone(2093, 0.22, 0.09, "sine", 0.18);
    } catch {
      // optional
    }
  }

  /** Sounds scheduled while the context is still resuming play as soon as it runs. */
  private ready(): AudioContext | null {
    const ctx = this.ctx;
    return ctx && ctx.state !== "closed" ? ctx : null;
  }

  private tone(freq: number, duration: number, level: number, type: OscillatorType, delay = 0): void {
    const ctx = this.ready();
    if (!ctx) return;
    try {
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    } catch {
      // optional
    }
  }

  private noise(ctx: AudioContext, at: number, duration: number, level: number): void {
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 1400;
    const gain = ctx.createGain();
    gain.gain.value = level;
    source.connect(highpass).connect(gain).connect(ctx.destination);
    source.start(at);
  }
}
