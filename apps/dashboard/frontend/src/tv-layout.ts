import type { CSSProperties } from "react";

export const TV_LAYOUT = {
  homeworkWidthPct: 40,
  gapPct: 2,
  financeHeightPct: 55,
  bottomRowHeightPct: 45,
  lightsWidthPct: 48,
  homelabWidthPct: 48,
} as const;

export function tvLayoutStyle(layout: typeof TV_LAYOUT = TV_LAYOUT): CSSProperties {
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
