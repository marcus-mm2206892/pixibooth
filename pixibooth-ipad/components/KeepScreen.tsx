"use client";

import { useEffect, useState } from "react";
import { Check, Undo } from "pixelarticons/react";
import type { PhotoSession } from "@/lib/session";
import { allPhotosFilename, MAX_RETAKES, stripFilename, ticketNumber } from "@/lib/session";
import { canShareFiles, downloadAll, downloadBlob, isTouchDevice, saveFiles, shareFiles, type NamedBlob } from "@/lib/downloads";
import { decodePhoto, renderPhotoJpeg } from "@/lib/photos";
import { renderStripPng } from "@/lib/photostrip";
import { FilteredPhoto } from "./FilteredPhoto";
import { KioskShell } from "./KioskShell";
import { MockQr } from "./MockQr";
import { PhotostripPreview } from "./PhotostripPreview";
import { PhotoViewer, type ViewerItem } from "./PhotoViewer";
import { PixelStar } from "./PixelStar";
import { INSTAGRAM_DM_URL, PrintRequestDialog, type PrintRequestState } from "./PrintRequestDialog";
import { StarCelebration } from "./StarCelebration";
import { ArtButton, GradientButton, Jp, PixelFrame, RegMarks, useEnterAnimation } from "./ui";

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
  const allPhotos = useAllPhotos(session);
  const [viewer, setViewer] = useState<"strip" | null>(null);
  const [printRequest, setPrintRequest] = useState<PrintRequestState | null>(null);
  // Attention order: Download bounces first (paused while a photo is picked for retake);
  // once this strip has been downloaded, Download stops and Finish blinks until pressed.
  // Keyed to the photos array, so a retake (new array) brings the bounce back.
  const [downloadedPhotos, setDownloadedPhotos] = useState<PhotoSession["photos"] | null>(null);
  const downloaded = downloadedPhotos === session.photos;
  const bounceDownload = !!strip && !downloaded && selected === null;
  const blinkFinish = downloaded;

  /**
   * "Send to PixiPocket for Printing". Phones/tablets that can share files get the
   * native share sheet (customer picks Instagram → @pixipocket_ themselves). Elsewhere,
   * including desktops whose share menu has no Instagram, the strip downloads and the
   * DM opens so they can attach it. Runs synchronously from the tap (share/popup need it).
   */
  /**
   * "Download All Photos": one tap, no picker. Share sheet where files can be shared
   * (iPad/iPhone: "Save 4 Images" → Photos), otherwise four plain downloads.
   */
  const downloadAllPhotos = () => {
    if (!allPhotos) return;
    if (canShareFiles(allPhotos)) {
      void shareFiles(allPhotos).then((result) => result === "failed" && downloadAll(allPhotos));
      return;
    }
    downloadAll(allPhotos);
  };

  /**
   * "Send to PixiPocket for Printing" opens the modal first; this runs from the modal's
   * Send tap (synchronously, as the share sheet and the new tab both need that tap).
   * Phones/tablets that can share files get the share sheet (customer picks Instagram →
   * @pixipocket_ themselves). Elsewhere, including desktops whose share menu has no
   * Instagram, the strip downloads and the DM opens so they can attach it.
   */
  const printViaShare = !!strip && isTouchDevice() && canShareFiles([strip]);
  const sendForPrinting = () => {
    if (!strip) return;
    if (printViaShare) {
      void shareFiles([strip]).then((result) => {
        if (result === "shared") setPrintRequest("shared");
        else if (result === "failed") {
          downloadBlob(strip.blob, strip.filename);
          setPrintRequest("fallback");
        }
      });
      return;
    }
    downloadBlob(strip.blob, strip.filename);
    window.open(INSTAGRAM_DM_URL, "_blank", "noopener,noreferrer");
    setPrintRequest("fallback");
  };

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
                <GradientButton
                  tone="pink"
                  icon={<PhotosIcon />}
                  label="Download All Photos"
                  jp="写真をまとめてダウンロード"
                  aria-label={allPhotos ? undefined : "Preparing photos…"}
                  width={348}
                  height={89}
                  style={{ flex: `${348 / 89} 1 0` }}
                  className="min-w-0"
                  disabled={!allPhotos}
                  onClick={downloadAllPhotos}
                />
              </div>

              <GradientButton
                tone="coral"
                icon={<PrinterIcon />}
                label="Send to PixiPocket for Printing"
                jp="印刷を依頼する"
                aria-label={strip ? undefined : "Preparing photostrip…"}
                width={700}
                height={100}
                className="w-full"
                disabled={!strip}
                onClick={() => strip && setPrintRequest("intro")}
              />

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
      {printRequest && (
        <PrintRequestDialog
          state={printRequest}
          canShare={printViaShare}
          onSend={sendForPrinting}
          onClose={() => setPrintRequest(null)}
        />
      )}
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

/**
 * The four full-resolution photos (filter baked in, captured pixels only, no
 * borders), prepared ahead of the tap so the share sheet can open from it.
 * Keyed to the photos array: a retake swaps it, so the replacement is used.
 */
function useAllPhotos(session: PhotoSession): NamedBlob[] | null {
  const [files, setFiles] = useState<{ photos: PhotoSession["photos"]; items: NamedBlob[] } | null>(null);
  const { photos, filter } = session;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const blobs = await Promise.all(photos.map((p) => (p ? renderPhotoJpeg(p, filter) : null)));
      if (cancelled) return;
      const items = blobs.flatMap((blob, i) => (blob ? [{ blob, filename: allPhotosFilename(i) }] : []));
      setFiles({ photos, items });
    })().catch((err) => console.error("Photo export failed", err));
    return () => {
      cancelled = true;
    };
  }, [photos, filter]);

  return files?.photos === photos ? files.items : null;
}

/** Four tiles, echoing the icon on the original photos-button artwork. */
function PhotosIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="8.5" height="8.5" rx="1" transform="rotate(-4 6.75 6.75)" />
      <rect x="13" y="2.5" width="8.5" height="8.5" rx="1" transform="rotate(5 17.25 6.75)" />
      <rect x="2.5" y="13" width="8.5" height="8.5" rx="1" transform="rotate(3 6.75 17.25)" />
      <rect x="13" y="13" width="8.5" height="8.5" rx="1" transform="rotate(-3 17.25 17.25)" />
    </svg>
  );
}

function PrinterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round">
      <path d="M6.5 9V2.5h11V9" />
      <path d="M6.5 17.5H4a1.5 1.5 0 0 1-1.5-1.5v-5.5A1.5 1.5 0 0 1 4 9h16a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 1-1.5 1.5h-2.5" />
      <path d="M6.5 14h11v7.5h-11z" />
      <path d="M17.5 12h.01" strokeWidth={2.8} />
    </svg>
  );
}
