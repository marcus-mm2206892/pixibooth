// File delivery: regular downloads, the iPad share sheet ("Save Image" to
// Photos) and helpers to detect what the current browser supports.

export type NamedBlob = { blob: Blob; filename: string };

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari reads the blob asynchronously after the click; revoke later.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Several downloads, spaced out so browsers don't drop them. */
export function downloadAll(files: NamedBlob[]): void {
  files.forEach((f, i) => window.setTimeout(() => downloadBlob(f.blob, f.filename), i * 350));
}

/** File type to hand the share sheet; an empty type hides "Save Image" on iOS. */
function fileType(f: NamedBlob): string {
  if (f.blob.type) return f.blob.type;
  return /\.png$/i.test(f.filename) ? "image/png" : "image/jpeg";
}

function toFiles(files: NamedBlob[]): File[] {
  return files.map((f) => new File([f.blob], f.filename, { type: fileType(f) }));
}

/**
 * Whether the share sheet can take these files. Needs HTTPS (or localhost):
 * over plain http on a LAN, iOS has no navigator.share at all.
 */
export function canShareFiles(files?: NamedBlob[]): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    const probe = files?.length
      ? toFiles(files)
      : [new File([new Blob(["x"], { type: "image/png" })], "probe.png", { type: "image/png" })];
    return navigator.canShare({ files: probe });
  } catch {
    return false;
  }
}

/** Phones and tablets, where a long-press on an image offers "Save to Photos". */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

/**
 * Opens the system share sheet with the images (iPad: "Save Image(s)" → Photos).
 * Must be called synchronously from a tap with already-generated blobs,
 * otherwise Safari rejects it for lacking a user gesture.
 */
export async function shareFiles(files: NamedBlob[]): Promise<"shared" | "cancelled" | "failed"> {
  try {
    // Files only: adding title/text/url makes iOS drop the "Save Image" action.
    await navigator.share({ files: toFiles(files) });
    return "shared";
  } catch (err) {
    return err instanceof Error && err.name === "AbortError" ? "cancelled" : "failed";
  }
}

export type SaveOutcome = "shared" | "cancelled" | "downloaded" | "needs-long-press";

/**
 * Best way to get images into the device's photo library:
 * share sheet ("Save Image") when available, otherwise a plain download on
 * desktop. On phones without file sharing a download only lands in Files, so
 * the caller should show the image full-size for a long-press save instead.
 * Call synchronously from the tap: the share sheet needs the user gesture.
 */
export async function saveFiles(files: NamedBlob[]): Promise<SaveOutcome> {
  if (canShareFiles(files)) {
    const result = await shareFiles(files);
    if (result !== "failed") return result;
  }
  if (isTouchDevice()) return "needs-long-press";
  downloadAll(files);
  return "downloaded";
}
