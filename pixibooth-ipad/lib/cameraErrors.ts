// Customer-facing camera error messages, shared by the style and camera screens.

import type { CameraErrorKind } from "./camera";

export const ERROR_COPY: Record<CameraErrorKind, { title: string; body: string }> = {
  insecure: {
    title: "The camera needs a secure (HTTPS) page",
    body: "Browsers only allow the camera on https:// pages or on http://localhost. If you opened this from another device using the Mac's IP address, use the HTTPS link instead (see the README).",
  },
  unsupported: {
    title: "This browser can't use the camera",
    body: "Open the booth in Safari on iPad, or in Safari or Chrome on a Mac.",
  },
  denied: {
    title: "Camera access is turned off",
    body: "iPad: tap “aA” in the address bar › Website Settings › Camera › Allow (or Settings › Apps › Safari › Camera). Mac Safari: Safari › Settings for This Website › Camera › Allow. Chrome: click the camera icon in the address bar. Then tap Try Again.",
  },
  "not-found": {
    title: "No camera found",
    body: "Connect or enable a camera on this device, then tap Try Again.",
  },
  "in-use": {
    title: "The camera is busy",
    body: "Another app or tab may be using it (FaceTime, Zoom, Photo Booth). Close it, then tap Try Again.",
  },
  ended: {
    title: "The camera disconnected",
    body: "Any photos already taken are safe. Reconnect the camera to keep going.",
  },
  "capture-failed": {
    title: "That photo didn't save",
    body: "Your other photos are safe. Tap Try Again to retake it.",
  },
  unknown: {
    title: "Something went wrong with the camera",
    body: "Tap Try Again. If it keeps happening, reload the page.",
  },
};
