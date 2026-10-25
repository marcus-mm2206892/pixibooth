"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { PhotoSession } from "@/lib/session";
import { photoFilename, stripFilename } from "@/lib/session";
import { renderStripPng } from "@/lib/photostrip";
import { decodePhoto, renderPhotoJpeg } from "@/lib/photos";
import type { NamedBlob } from "@/lib/downloads";
import { canShareFiles, downloadAll, downloadBlob, shareFiles } from "@/lib/downloads";

type Rendered = { key: string; files: NamedBlob[] };

const noopSubscribe = () => () => {};

/** Touch devices with a share sheet (iPad) save via "Save Image"; desktops download. */
export function useTouchShare(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.matchMedia("(pointer: coarse)").matches && canShareFiles(),
    () => false,
  );
}

/**
 * Pre-renders the strip PNG and filtered photo JPEGs whenever the session's
 * photos/template/filter change, so share/download can run synchronously
 * inside the tap (Safari rejects navigator.share after an await).
 */
export function useSessionExports(session: PhotoSession) {
  const touchShare = useTouchShare();
  const [strip, setStrip] = useState<Rendered | null>(null);
  const [singles, setSingles] = useState<Rendered | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const { photos, template, filter } = session;
  const photoKey = photos.map((p) => p?.id).join(",");
  const stripKey = `${photoKey}|${template}|${filter}`;
  const singlesKey = `${photoKey}|${filter}`;
  const ready = photos.every(Boolean);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    Promise.all(photos.map((p) => decodePhoto(p!)))
      .then((sources) =>
        renderStripPng({ photos: sources, template, filter, date: new Date(session.createdAt || Date.now()) }),
      )
      .then((blob) => !cancelled && setStrip({ key: stripKey, files: [{ blob, filename: stripFilename(session) }] }))
      .catch((err) => console.error("Strip export failed", err));
    return () => {
      cancelled = true;
    };
    // `session` is captured for the filename/date; the keys cover what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripKey, ready]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    Promise.all(photos.map((p) => renderPhotoJpeg(p!, filter)))
      .then(
        (blobs) =>
          !cancelled &&
          setSingles({ key: singlesKey, files: blobs.map((blob, i) => ({ blob, filename: photoFilename(session, i) })) }),
      )
      .catch((err) => console.error("Photo export failed", err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singlesKey, ready]);

  const stripFile = strip?.key === stripKey ? strip.files[0] : null;
  const photoFiles = singles?.key === singlesKey ? singles.files : null;

  const deliver = (files: NamedBlob[], id: string) => {
    if (touchShare) {
      void shareFiles(files).then((result) => {
        if (result === "failed") downloadAll(files);
        if (result !== "cancelled") setSaved(id);
      });
    } else {
      if (files.length === 1) downloadBlob(files[0].blob, files[0].filename);
      else downloadAll(files);
      setSaved(id);
    }
  };

  return {
    touchShare,
    stripFile,
    photoFiles,
    saved,
    saveStrip: () => stripFile && deliver([stripFile], "strip"),
    downloadStrip: () => {
      if (!stripFile) return;
      downloadBlob(stripFile.blob, stripFile.filename);
      setSaved("strip");
    },
    savePhoto: (i: number) => photoFiles && deliver([photoFiles[i]], `photo-${i}`),
    saveAllPhotos: () => photoFiles && deliver(photoFiles, "photos"),
  };
}
