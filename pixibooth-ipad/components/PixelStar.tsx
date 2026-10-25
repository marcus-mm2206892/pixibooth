// The signature pixel star, drawn from a 13×13 sprite matrix as crisp SVG rects.

import type { CSSProperties } from "react";

const STAR = [
  "......#......",
  ".....###.....",
  ".....###.....",
  "....#####....",
  "#############",
  ".###########.",
  "..#########..",
  "...#######...",
  "...#######...",
  "..####.####..",
  "..###...###..",
  ".###.....###.",
  ".#.........#.",
];

const SPARKLE = ["..#..", "..#..", "##.##", "..#..", "..#.."];

// Star plus four floating sparkle pixels, for the capture celebration.
const CELEBRATE = [
  "#.................#",
  ".........#.........",
  "........###........",
  "........###........",
  ".......#####.......",
  "...#############...",
  "....###########....",
  ".....#########.....",
  "......#######......",
  "......#######......",
  ".....####.####.....",
  ".....###...###.....",
  "....###.....###....",
  "....#.........#....",
  "...................",
  "#.................#",
];

type Cell = [x: number, y: number];

function cells(matrix: string[]): Cell[] {
  const out: Cell[] = [];
  matrix.forEach((row, y) => [...row].forEach((c, x) => c === "#" && out.push([x, y])));
  return out;
}

const STAR_CELLS = cells(STAR);
const STAR_SET = new Set(STAR_CELLS.map(([x, y]) => `${x},${y}`));
/** Cells on the silhouette edge (any 4-neighbour outside the star). */
const EDGE_CELLS = STAR_CELLS.filter(([x, y]) =>
  [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].some(([dx, dy]) => !STAR_SET.has(`${x + dx},${y + dy}`)),
);
const EDGE_SET = new Set(EDGE_CELLS.map(([x, y]) => `${x},${y}`));
const INNER_CELLS = STAR_CELLS.filter(([x, y]) => !EDGE_SET.has(`${x},${y}`));

/** Merges horizontal runs so each row is a handful of rects. */
function Rects({ list, fill }: { list: Cell[]; fill: string }) {
  const rows = new Map<number, number[]>();
  list.forEach(([x, y]) => rows.set(y, [...(rows.get(y) ?? []), x]));
  const rects: Array<[number, number, number]> = [];
  rows.forEach((xs, y) => {
    xs.sort((a, b) => a - b);
    let start = xs[0];
    let prev = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (xs[i] === prev + 1) {
        prev = xs[i];
        continue;
      }
      rects.push([start, y, prev - start + 1]);
      start = prev = xs[i];
    }
  });
  return (
    <>
      {rects.map(([x, y, w]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={1} fill={fill} />
      ))}
    </>
  );
}

export type PixelStarVariant = "solid" | "outline" | "duo" | "sparkle" | "celebrate";

export function PixelStar({
  variant = "solid",
  size = 24,
  color = "currentColor",
  accent = "#FFFFFF",
  className = "",
  style,
  title,
}: {
  variant?: PixelStarVariant;
  /** Rendered height in CSS px. Multiples of the grid size stay pixel-perfect. */
  size?: number | string;
  color?: string;
  /** Interior fill for the "duo" variant. */
  accent?: string;
  className?: string;
  style?: CSSProperties;
  /** Accessible name; omit for decorative stars (aria-hidden). */
  title?: string;
}) {
  const matrix = variant === "sparkle" ? SPARKLE : variant === "celebrate" ? CELEBRATE : STAR;
  const w = matrix[0].length;
  const h = matrix.length;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      height={size}
      width={typeof size === "number" ? (size * w) / h : undefined}
      shapeRendering="crispEdges"
      className={`inline-block shrink-0 ${className}`}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {variant === "outline" ? (
        <Rects list={EDGE_CELLS} fill={color} />
      ) : variant === "duo" ? (
        <>
          <Rects list={EDGE_CELLS} fill={color} />
          <Rects list={INNER_CELLS} fill={accent} />
        </>
      ) : (
        <Rects list={cells(matrix)} fill={color} />
      )}
    </svg>
  );
}
