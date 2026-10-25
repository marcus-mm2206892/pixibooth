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

export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    const probe = new File([new Blob(["x"], { type: "image/png" })], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Opens the system share sheet with the images (iPad: "Save Image(s)" → Photos).
 * Must be called synchronously from a tap with already-generated blobs,
 * otherwise Safari rejects it for lacking a user gesture.
 */
export async function shareFiles(files: NamedBlob[]): Promise<"shared" | "cancelled" | "failed"> {
  try {
    await navigator.share({ files: files.map((f) => new File([f.blob], f.filename, { type: f.blob.type })) });
    return "shared";
  } catch (err) {
    return err instanceof Error && err.name === "AbortError" ? "cancelled" : "failed";
  }
}
