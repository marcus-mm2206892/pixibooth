// A decorative, deliberately non-functional QR-style graphic. It encodes
// nothing (random modules, no format/version data), so it cannot be scanned.

import { useMemo } from "react";
import { hashString, mulberry32 } from "@/lib/canvas";
import { PixelStar } from "./PixelStar";

const N = 29;
const QUIET = 2;

function isFinder(x: number, y: number): boolean {
  const inBox = (ox: number, oy: number) => x >= ox && x < ox + 8 && y >= oy && y < oy + 8;
  return inBox(0, 0) || inBox(N - 8, 0) || inBox(0, N - 8);
}

function finderModule(x: number, y: number): boolean {
  const lx = x >= N - 8 ? x - (N - 7) : x;
  const ly = y >= N - 8 ? y - (N - 7) : y;
  if (lx < 0 || ly < 0 || lx > 6 || ly > 6) return false; // separator
  const ring = Math.min(lx, ly, 6 - lx, 6 - ly);
  return ring !== 1;
}

function modules(seed: string): Array<[number, number, number]> {
  const rand = mulberry32(hashString(seed || "pixipocket"));
  const centerLo = Math.floor(N / 2) - 4;
  const centerHi = Math.floor(N / 2) + 4;
  const on: boolean[][] = [];
  for (let y = 0; y < N; y++) {
    on[y] = [];
    for (let x = 0; x < N; x++) {
      if (isFinder(x, y)) on[y][x] = finderModule(x, y);
      else if (x >= centerLo && x <= centerHi && y >= centerLo && y <= centerHi) on[y][x] = false;
      else if (y === 6 || x === 6) on[y][x] = (x + y) % 2 === 0;
      else on[y][x] = rand() < 0.48;
    }
  }
  const rects: Array<[number, number, number]> = [];
  on.forEach((row, y) => {
    let x = 0;
    while (x < N) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < N && row[x]) x++;
      rects.push([start, y, x - start]);
    }
  });
  return rects;
}

export function MockQr({ seed, className = "" }: { seed: string; className?: string }) {
  const rects = useMemo(() => modules(seed), [seed]);
  const size = N + QUIET * 2;
  return (
    <div className={`relative aspect-square ${className}`}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        shapeRendering="crispEdges"
        className="block h-full w-full bg-white"
        role="img"
        aria-label="QR preview illustration (not scannable)"
      >
        {rects.map(([x, y, w]) => (
          <rect key={`${x}-${y}`} x={x + QUIET} y={y + QUIET} width={w} height={1} fill="#0A2D69" />
        ))}
      </svg>
      <span className="absolute left-1/2 top-1/2 flex size-[22%] -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-white">
        <PixelStar size="80%" color="var(--pp-blue)" />
      </span>
    </div>
  );
}
