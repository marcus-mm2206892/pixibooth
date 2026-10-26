# pixipocket — iPad photo booth (Phase 1 prototype)

A browser-only photo booth with a cobalt-and-white, pixel-art "Japanese ID-photo kiosk" look. Flow: **welcome → style (8 strip colors + 3 filters, previewed live on the customers themselves) → camera → four 5-second shots with pose tips and countdown sounds → Keep screen (strip + one optional retake + mock QR) → animated thank-you → back to welcome**. The strip is a real 600×1800 px (2×6 in at 300 ppi) PNG with the pixipocket logo and date in its footer. Nothing is uploaded and the QR is a non-functional illustration. Photos live in memory for the current session only.

## Run on a Mac

```bash
npm install
npm run dev          # http://localhost:3000
# or a production build:
npm run build && npm start
```

`http://localhost` counts as a secure context, so the camera works in Safari and Chrome on the same Mac. Allow camera access when the browser asks.

## Open it on a real iPad (needs HTTPS)

iPad Safari only gives a page the camera on **https://** (or on its *own* localhost). `http://<your-Mac-LAN-IP>:3000` is **not** a secure context, so the camera API will be missing there. `localhost` on the iPad means the iPad itself, not your Mac.

Pick one of these:

1. **HTTPS tunnel (quickest).** Run the app on the Mac, then in a second terminal:
   ```bash
   brew install cloudflared
   cloudflared tunnel --url http://localhost:3000
   ```
   Open the printed `https://….trycloudflare.com` URL in iPad Safari. `next.config.ts` already allows that host for the dev server. For the most reliable test, tunnel a production build (`npm run build && npm start`).
2. **Vercel preview deploy.** There is no backend and there are no secrets, so `npx vercel` (free) gives you an HTTPS URL that works on any device.
3. **Trusted LAN certificate.** `next dev --experimental-https` creates a certificate that your **Mac** trusts. The iPad will **not** trust it unless you install and fully trust the mkcert root CA on the iPad (Settings › General › About › Certificate Trust Settings) and serve a certificate that covers the Mac's LAN IP. That is more work than options 1 and 2.

**Startup / full screen:** the landing page is the setup point. If camera access was granted before, the camera starts there automatically and *Start photo session* unlocks once it is live. On the very first run (or after a denial) staff tap **Set up booth** once: it shows the camera permission prompt and enters full screen. The camera then stays on between sessions, so Start is instant. For a permanent kiosk with no browser bars at all, open the booth in Safari › Share › **Add to Home Screen** and launch it from the icon (`app/manifest.ts` sets `display: fullscreen`).

Booth tips: keep the iPad in **landscape** (groups fit better). Turn on **Guided Access**. Set **Auto-Lock** to Never; the app also requests a Wake Lock where supported. If camera access was denied: tap **aA** in the address bar › Website Settings › Camera › Allow.

## How to verify

- **Four-shot sequence:** tap *Take 4 Photos* once. Each shot shows `SHOT 0N / 04` and a pose tip, counts 5 → 4 → 3 → 2 → 1 with a soft tick per number (higher on 1), then flashes, plays a click + chime, and captures once. There is a 2 s "Nice! Next pose" break after shots 1–3 and none after shot 4, so the sequence takes about 26 s. *Sound on/off* is on the camera screen and is remembered.
- **Retake:** on the review screen, tap *Retake 02*. It uses the same 5-second countdown and the same pose tip, and only that tile changes.
- **Finish:** *Finish & view QR* opens the last screen: a large mock QR labelled "QR preview only", plus working strip/photo downloads and *Start a new session*.
- **Export:** on the result screen, *Download Photostrip* saves `pixipocket-<date>-S###-strip-<color>[-filter].png`. Check it with `sips -g pixelWidth -g pixelHeight <file>` (expect 600 × 1800). The on-screen strip and the PNG are drawn by the same `renderStrip()` function.
- **Pause:** switch tabs or lock the iPad mid-countdown. The booth pauses and waits for *Resume*. It never shoots while hidden.

## Code map

| Path | What it does |
|---|---|
| `lib/boothEngine.ts` | Finite state machine (template → filter → camera → countdown/capture/pose-break → review → result), rAF/`performance.now` timers, cancellation tokens, pause/resume, wake lock, shutter sound. Lives outside React. |
| `lib/camera.ts` | `CameraAdapter` interface + `BrowserCameraAdapter` (getUserMedia, center-cover-cropped and optionally mirrored still capture, error mapping). Swap this for a future PC/DSLR adapter. |
| `lib/photostrip.ts` | 600×1800 layout, the 8 strip colors (with black/white logo choice), and `renderStrip()` / `renderStripPng()` used by thumbnails, preview and export. Footer = real logo PNG bottom-left, date (`DD.MM.YYYY`) directly below. |
| `lib/filters.ts` | Three filters (Auto = original, Vintage = the Canva warm-B&W recipe, Dream Film = see `lib/dreamFilm.ts`) as pure canvas pixel operations, so iPad Safari exports match the preview; CSS approximations for the live camera only. |
| `lib/dreamFilm.ts` | Dream Film: the editable `DREAM_FILM` preset and a 5-stage WebGL pipeline (grade → soft focus → bloom → grain → edge fade) used for the live camera, previews and saved photos alike; CPU fallback in `filters.ts`. |
| `lib/poses.ts` | Pose-tip catalog; four distinct prompts per session (cute, cheeky, stylish, freestyle). |
| `lib/audio.ts` | Web Audio ticks and shutter chime, unlocked on the Start/Take tap for iOS. |
| `lib/sampleScene.ts` | Illustrated sample photos used in strip/filter previews before any real photo exists. |
| `lib/photos.ts` | Captured-photo blobs/object URLs, cached decoding, cleanup, full-res filtered JPEG export. |
| `lib/session.ts` | Session types, per-day session IDs, timing defaults, filenames, the future `SessionSink` boundary. |
| `lib/downloads.ts` | Blob downloads and the iPad share sheet ("Save Image" → Photos). |
| `lib/motion.ts` | anime.js transitions (respects reduced motion). |
| `components/*` | Screens (Welcome, StyleScreen — strip color + filter with a live camera strip preview, CameraBooth, KeepScreen — strip, 1 retake, QR, ThanksScreen — anime.js goodbye) and brand primitives (`KioskShell`, `PixelStar`, pixel `Button`/`PixelFrame`/`Chip` in `ui.tsx`, `MockQr`, `StarCelebration`). |
| `public/brand/pixipocket-logo-{black,white}.png` | Your logo SVGs from `assets/logos/`, rasterized to transparent PNGs (canvas export can't reliably draw those image-embedding SVGs on iPad Safari). |
| `app/globals.css` | Cobalt/navy/white design tokens, pixel stepped-corner and button classes. Fonts: DotGothic16 for everything (incl. Japanese), Barlow Condensed only for small section labels. Icons: pixelarticons (MIT). |

Out of scope for this phase: DSLR tethering, printing, uploads, real QR galleries, payments, accounts. The finish-screen QR encodes nothing.
