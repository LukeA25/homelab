import type { CSSProperties } from "react";

/**
 * TV dashboard layout — edit these numbers, rebuild (`docker compose up -d --build`
 * in compose/dashboard), then reload the TV page.
 *
 * Widths: homework + gap + right column = 100%.
 * Right column: finance on top, then lights | homelab side-by-side below.
 * gapPct applies to all gaps (horizontal and vertical).
 */
export const TV_LAYOUT = {
  /** Homework column width (% of the content band). */
  homeworkWidthPct: 40,
  /** Shared gap (%) — homework↔right column, finance↔bottom row, lights↔homelab. */
  gapPct: 2,

  /** Finance card height (% of right column). */
  financeHeightPct: 55,
  /** Shared height for the lights + homelab row below finance (%). */
  bottomRowHeightPct: 45,

  /** Bottom row split — lights on the left, homelab on the right. */
  lightsWidthPct: 48,
  homelabWidthPct: 48,
  /** Set to a YYYY-MM string to preview that month on /tv (e.g. "2026-08"). Empty = current month. */
  financeDisplayMonth: "2026-08",
} as const;

export type TvLayout = typeof TV_LAYOUT;

/** Turn TV_LAYOUT into CSS custom properties for .tv-page. */
export function tvLayoutStyle(layout: TvLayout = TV_LAYOUT): CSSProperties {
  const gap = layout.gapPct;
  const rightWidthPct = 100 - layout.homeworkWidthPct - gap;
  const rightLeftPct = layout.homeworkWidthPct + gap;

  const stackSum = layout.financeHeightPct + layout.bottomRowHeightPct;
  const stackAvail = 100 - gap;
  const scale = stackAvail / stackSum;

  const financeH = layout.financeHeightPct * scale;
  const bottomH = layout.bottomRowHeightPct * scale;
  const bottomTop = financeH + gap;

  const splitSum = layout.lightsWidthPct + layout.homelabWidthPct;
  const splitAvail = 100 - gap;
  const splitScale = splitAvail / splitSum;
  const lightsW = layout.lightsWidthPct * splitScale;
  const homelabW = layout.homelabWidthPct * splitScale;
  const homelabLeft = lightsW + gap;

  return {
    ["--tv-hw-width" as string]: `${layout.homeworkWidthPct}%`,
    ["--tv-right-left" as string]: `${rightLeftPct}%`,
    ["--tv-right-width" as string]: `${rightWidthPct}%`,
    ["--tv-finance-top" as string]: "0%",
    ["--tv-finance-height" as string]: `${financeH}%`,
    ["--tv-bottom-top" as string]: `${bottomTop}%`,
    ["--tv-bottom-height" as string]: `${bottomH}%`,
    ["--tv-lights-left" as string]: "0%",
    ["--tv-lights-width" as string]: `${lightsW}%`,
    ["--tv-homelab-left" as string]: `${homelabLeft}%`,
    ["--tv-homelab-width" as string]: `${homelabW}%`,
  };
}
