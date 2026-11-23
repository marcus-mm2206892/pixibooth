import { FOUNDATION_DAY_SVG_ID, foundationDayTables } from "@/lib/filters";

const [R, G, B] = foundationDayTables();

/**
 * SVG filters referenced from CSS (`filter: url(#…)`) by the live camera views.
 * FOUNDATION DAY: Rec.601 luma, then the same gradient-map table as the
 * canvas filter, so the live view matches the saved photos.
 */
export function FilterDefs() {
  return (
    <svg aria-hidden width="0" height="0" className="pointer-events-none absolute size-0">
      <filter id={FOUNDATION_DAY_SVG_ID} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
        <feColorMatrix
          type="matrix"
          values="0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0"
        />
        <feComponentTransfer>
          <feFuncR type="table" tableValues={R} />
          <feFuncG type="table" tableValues={G} />
          <feFuncB type="table" tableValues={B} />
        </feComponentTransfer>
      </filter>
    </svg>
  );
}
