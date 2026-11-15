"use client";

import { useEffect, useState } from "react";
import { Check, Undo } from "pixelarticons/react";
import type { PhotoSession } from "@/lib/session";
import { MAX_RETAKES, photoFilename, stripFilename, ticketNumber } from "@/lib/session";
import { saveFiles } from "@/lib/downloads";
import { decodePhoto, renderPhotoJpeg } from "@/lib/photos";
import { renderStripPng } from "@/lib/photostrip";
import { FilteredPhoto } from "./FilteredPhoto";
import { KioskShell } from "./KioskShell";
import { MockQr } from "./MockQr";
import { PhotostripPreview } from "./PhotostripPreview";
import { PhotoViewer, type ViewerItem } from "./PhotoViewer";
import { PixelStar } from "./PixelStar";
import { StarCelebration } from "./StarCelebration";
import { ArtButton, Jp, PixelFrame, RegMarks, useEnterAnimation } from "./ui";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The QR gallery isn't live yet; flip on once the scan link actually serves photos. */
const SHOW_QR = false;

/**
 * Step 3, the last screen of the session. Left: the finished strip plus one
 * optional single-photo retake. Right: QR and Finish. Both panels are framed
 * at the same height so their edges line up.
 */
export function KeepScreen({
  session,
  onRetake,
  onFinish,
}: {
  session: PhotoSession;
  onRetake: (index: number) => void;
  onFinish: () => void;
}) {
  const root = useEnterAnimation<HTMLDivElement>();
  const [selected, setSelected] = useState<number | null>(null);
  const retakesLeft = Math.max(0, MAX_RETAKES - session.retakesUsed);
  const strip = useStripPng(session);
  const photoFiles = usePhotoFiles(session);
  const [viewer, setViewer] = useState<"strip" | "photos" | null>(null);
  // Attention order: Download bounces first (paused while a photo is picked for retake);
  // once this strip has been downloaded, Download stops and Finish blinks until pressed.
  // Keyed to the photos array, so a retake (new array) brings the bounce back.
  const [downloadedPhotos, setDownloadedPhotos] = useState<PhotoSession["photos"] | null>(null);
  const downloaded = downloadedPhotos === session.photos;
  const bounceDownload = !!strip && !downloaded && selected === null;
  const blinkFinish = downloaded;

  return (
    <KioskShell rootRef={root} step={3} ticket={ticketNumber(session)} bodyClassName="narrow:overflow-y-auto">
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-5 narrow:h-[max(100%,960px)] narrow:flex-none phone:h-auto phone:flex-none phone:grid-rows-none phone:gap-3 wide:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] wide:grid-rows-1 wide:gap-6">
        {/* Left panel: the strip and the one-time retake. */}
        <section data-enter className="flex min-h-0">
          <PixelFrame
            edge="bg-pp-blue-line"
            fill="bg-pp-blue-soft"
            border={2}
            className="w-full"
            innerClassName="relative grid min-h-0 grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] grid-rows-[auto_minmax(0,1fr)] gap-x-6 gap-y-4 p-4 wide:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)] phone:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] phone:gap-x-3 phone:gap-y-3 phone:p-3"
          >
            <RegMarks />

            {/* The one rule, impossible to miss. */}
            <div
              className={`col-span-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-center phone:gap-x-2 phone:px-2 phone:py-1.5 ${
                retakesLeft > 0 ? "bg-pp-navy text-white" : "bg-pp-blue-light text-pp-navy"
              }`}
            >
              <PixelStar size={18} color={retakesLeft > 0 ? "#FFFFFF" : "var(--pp-navy)"} className="phone:hidden" />
              <p className="font-pixel text-xl uppercase leading-tight phone:text-sm">
                {retakesLeft > 0 ? (
                  <>
                    You may only retake <span className="bg-white px-1.5 text-pp-navy">one frame</span>
                  </>
                ) : (
                  "Retake used · your strip is final"
                )}
              </p>
              <Jp className="text-base opacity-80 phone:text-xs">{retakesLeft > 0 ? "撮り直しは1枚だけ" : "撮り直し済み"}</Jp>
            </div>

            <div className="flex min-h-0 flex-col items-center gap-2">
              <div className="fit-box relative flex w-full flex-1 items-center justify-center phone:h-[min(56vh,360px)] phone:flex-none">
                <StarCelebration />
                <div className="fit-strip drop-shadow-[5px_6px_0_rgba(10,45,105,0.35)]">
                  <PhotostripPreview
                    photos={session.photos}
                    template={session.template}
                    filter={session.filter}
                    date={session.createdAt}
                  />
                </div>
              </div>
              <p className="font-label text-sm font-bold tracking-[0.18em] text-pp-navy phone:text-[0.65rem] phone:tracking-widest">
                NO. {ticketNumber(session)} · 2×6 PRINT
              </p>
            </div>

            {/* Pick a single photo, then confirm with one button; text, grid and button centred together. */}
            <div className="fit-box flex min-h-0 flex-col items-center justify-center-safe gap-4 phone:gap-2.5 phone:[container-type:normal]">
              <p className="keep-thumbs-width text-lg leading-snug text-pp-ink phone:text-xs">
                {retakesLeft > 0 ? (
                  <>
                    Not happy with a photo? Tap the one you want to redo, then press{" "}
                    <strong className="text-pp-red">Retake</strong>.
                  </>
                ) : (
                  "All four photos are kept. Looking good!"
                )}
              </p>
                <div role="radiogroup" aria-label="Choose one photo to retake" className="keep-thumbs grid grid-cols-2 grid-rows-2 gap-3 phone:gap-2">
                  {session.photos.map((photo, i) => {
                    if (!photo) return null;
                    const chosen = selected === i;
                    return (
                      <button
                        key={photo.id}
                        type="button"
                        role="radio"
                        aria-checked={chosen}
                        aria-label={`Photo ${i + 1}`}
                        disabled={retakesLeft === 0}
                        onClick={() => setSelected(chosen ? null : i)}
                        className={`relative min-h-0 border-[3px] transition-opacity disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-pp-navy ${
                          chosen ? "border-pp-red" : selected !== null ? "border-pp-navy opacity-55" : "border-pp-navy"
                        }`}
                      >
                        <span className="block h-full w-full overflow-hidden">
                          <FilteredPhoto photo={photo} filter={session.filter} width={360} alt="" />
                        </span>
                        {chosen && (
                          <span aria-hidden className="animate-arcade pointer-events-none absolute -inset-2 border-4 border-pp-red" />
                        )}
                        <span className="absolute left-0 top-0 bg-pp-navy px-2 py-0.5 font-pixel text-sm text-white phone:px-1 phone:py-0 phone:text-[0.6rem]">
                          {pad2(i + 1)}
                        </span>
                        {chosen && (
                          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-pp-red/90 py-1.5 font-pixel text-sm text-white phone:gap-0.5 phone:py-0.5 phone:text-[0.55rem]">
                            <Undo className="size-4 phone:size-2.5" aria-hidden />
                            RETAKE<span className="phone:hidden"> THIS ONE</span>
                          </span>
                        )}
                        {retakesLeft === 0 && (
                          <span className="absolute bottom-1 right-1 flex items-center gap-1 bg-white/90 px-1.5 font-pixel text-xs text-pp-navy phone:text-[0.55rem]">
                            <Check className="size-3.5" aria-hidden />
                            KEPT
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              {retakesLeft > 0 && (
                <ArtButton
                  src={selected === null ? "/ui/retake-button-idle.svg" : `/ui/retake-button-${pad2(selected + 1)}.svg`}
                  label={selected === null ? "Tap a photo to retake" : `Retake photo ${pad2(selected + 1)}`}
                  width={428}
                  height={104}
                  className="w-full max-w-110"
                  disabled={selected === null}
                  onClick={() => selected !== null && onRetake(selected)}
                />
              )}
            </div>
          </PixelFrame>
        </section>

        {/* Right panel: QR and Finish, same height as the left panel. */}
        <section data-enter className="flex min-h-0">
          <PixelFrame
            edge="bg-pp-blue-line"
            border={2}
            className="w-full"
            innerClassName="relative flex min-h-0 flex-col items-center justify-center gap-4 p-5 text-center narrow:flex-row narrow:flex-wrap narrow:gap-x-8 phone:gap-3 phone:p-3"
          >
            <RegMarks />
            <div className="narrow:w-full">
              <p className="font-label text-base font-bold tracking-[0.18em] text-pp-blue phone:text-xs">
                03 / KEEP <Jp className="ml-2 opacity-80">完成！</Jp>
              </p>
              <h1 className="mt-1 flex items-center justify-center gap-3 font-pixel text-3xl uppercase leading-tight text-pp-navy short:text-2xl phone:gap-2 phone:text-lg">
                Your strip is ready
                <PixelStar size={24} color="var(--pp-blue)" />
              </h1>
            </div>

            {SHOW_QR && (
              <div className="flex flex-col items-center gap-2 phone:w-full phone:gap-1.5">
                <div className="px-shadow shrink-0">
                  <PixelFrame edge="bg-pp-navy" border={6} step={6} innerClassName="relative p-3 phone:p-2">
                    <MockQr
                      seed={session.id}
                      className="w-[clamp(170px,min(38vh,30vw),320px)] narrow:w-[min(20vh,34vw,230px)] phone:w-[min(30vw,120px)]"
                    />
                  </PixelFrame>
                </div>
                <div className="flex flex-col items-center gap-2 text-center phone:gap-1">
                  <p className="font-pixel text-lg uppercase text-pp-navy phone:text-sm phone:leading-snug">Scan to download your photos here</p>
                  <Jp className="text-sm text-pp-blue phone:text-xs">写真のダウンロードはこちら</Jp>
                </div>
              </div>
            )}

            {/* Two downloads side by side (flex-grow by aspect ratio keeps their heights equal), Finish below. */}
            <div className="flex w-full max-w-[30rem] flex-col items-stretch gap-4 narrow:max-w-[36rem] phone:max-w-[22rem] phone:gap-3">
              <div className="flex items-center gap-3 phone:gap-2">
                <ArtButton
                  src="/ui/download-button.svg"
                  label={strip ? "Download strip" : "Preparing download…"}
                  width={320}
                  height={104}
                  style={{ flex: `${320 / 104} 1 0` }}
                  className={`min-w-0 ${bounceDownload ? "animate-soft-bounce" : ""}`}
                  disabled={!strip}
                  onClick={() => {
                    if (!strip) return;
                    setDownloadedPhotos(session.photos);
                    // Share sheet must open synchronously from the tap, so the PNG is rendered ahead of time.
                    void saveFiles([strip]).then((outcome) => {
                      if (outcome === "needs-long-press") setViewer("strip");
                    });
                  }}
                />
                <ArtButton
                  src="/ui/photos-button.svg"
                  label={photoFiles ? "Download individual photos" : "Preparing photos…"}
                  width={348}
                  height={89}
                  style={{ flex: `${348 / 89} 1 0` }}
                  className="min-w-0"
                  disabled={!photoFiles}
                  onClick={() => photoFiles && setViewer("photos")}
                />
              </div>

              <ArtButton
                src="/ui/finish-button.svg"
                label="Finish"
                width={360}
                height={115}
                className={`w-full ${blinkFinish ? "animate-arcade-soft" : ""}`}
                onClick={onFinish}
              />
            </div>
          </PixelFrame>
        </section>
      </div>

      {viewer === "strip" && strip && <PhotoViewer kind="strip" items={[strip]} onClose={() => setViewer(null)} />}
      {viewer === "photos" && photoFiles && <PhotoViewer kind="photos" items={photoFiles} onClose={() => setViewer(null)} />}
    </KioskShell>
  );
}

/** Renders the print PNG in the background so the download tap can use it immediately. */
function useStripPng(session: PhotoSession): ViewerItem | null {
  const [strip, setStrip] = useState<{ photos: PhotoSession["photos"]; file: ViewerItem } | null>(null);
  const { photos, template, filter, createdAt } = session;
  const filename = stripFilename(session);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      const sources = await Promise.all(photos.map((p) => (p ? decodePhoto(p) : null)));
      const blob = await renderStripPng({ photos: sources, template, filter, date: createdAt ? new Date(createdAt) : undefined });
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setStrip({ photos, file: { blob, filename, url } });
    })().catch((err) => console.error("Strip export failed", err));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photos, template, filter, createdAt, filename]);

  // A retake swaps the photos array; hide the stale PNG until the new one is ready.
  return strip?.photos === photos ? strip.file : null;
}

/** Full-resolution single photos (filter baked in), ready before the tap for the same reason. */
function usePhotoFiles(session: PhotoSession): ViewerItem[] | null {
  const [files, setFiles] = useState<{ photos: PhotoSession["photos"]; items: ViewerItem[] } | null>(null);
  const { photos, filter } = session;
  const filenames = photos.map((_, i) => photoFilename(session, i)).join("|");

  useEffect(() => {
    let cancelled = false;
    let made: ViewerItem[] = [];
    const names = filenames.split("|");
    (async () => {
      const blobs = await Promise.all(photos.map((p) => (p ? renderPhotoJpeg(p, filter) : null)));
      if (cancelled) return;
      made = blobs.flatMap((blob, i) => (blob ? [{ blob, filename: names[i], url: URL.createObjectURL(blob) }] : []));
      setFiles({ photos, items: made });
    })().catch((err) => console.error("Photo export failed", err));
    return () => {
      cancelled = true;
      made.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [photos, filter, filenames]);

  return files?.photos === photos ? files.items : null;
}
