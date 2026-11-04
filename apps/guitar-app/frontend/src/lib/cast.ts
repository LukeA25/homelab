import { useEffect, useRef } from "react";

/**
 * Bridge to the homelab cast script (/__cast/cast.js). On a TV / kiosk / guest
 * screen the app reports its sheet state and takes remote commands; on the
 * phone it tells the remote which pages and controls exist.
 */

export type CastCommand = { type: string; [key: string]: unknown };

export type GuitarCastState = {
  song?: string | null;
  focus?: boolean;
  page?: number;
  pages?: number;
  pageLabel?: string;
  text?: number;
  texts?: number;
};

declare global {
  interface Window {
    castApp?: unknown;
    __castAppState?: unknown;
  }
}

export const isCastScreen = (() => {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
})();

let current: GuitarCastState = {};

export function publishCastState(patch: GuitarCastState) {
  if (!isCastScreen) return;
  current = { ...current, ...patch };
  window.__castAppState = current;
  window.dispatchEvent(new CustomEvent("cast:state", { detail: current }));
}

/** Whether the remote last asked for expanded lyrics, so the next song opens the same way. */
export const remoteSheet = { focus: false };

export function useCastCommand(handler: (cmd: CastCommand) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!isCastScreen) return;
    const listener = (e: Event) => {
      const cmd = (e as CustomEvent<CastCommand>).detail;
      if (cmd && typeof cmd.type === "string") ref.current(cmd);
    };
    window.addEventListener("cast:command", listener);
    return () => window.removeEventListener("cast:command", listener);
  }, []);
}

/** Phone remote controls for whatever sheet the screen reports. */
export function guitarRemoteControls(raw: unknown) {
  const s = (raw ?? {}) as GuitarCastState;
  if (!s.song) return null;
  const text = s.text ?? 0;
  const texts = s.texts ?? 1;
  const controls: object[] = [];
  if (s.focus && s.pages) {
    const page = s.page ?? 0;
    controls.push({
      kind: "pager",
      label: s.pageLabel || "Lyrics",
      value: `${page + 1} / ${s.pages}`,
      prev: { type: "app.page", delta: -1 },
      next: { type: "app.page", delta: 1 },
      canPrev: page > 0,
      canNext: page < s.pages - 1,
    });
  }
  controls.push({
    kind: "toggle",
    label: "Expanded lyrics",
    hint: s.focus ? "Full-screen lyrics on the screen" : "Show lyrics full screen, page by page",
    on: Boolean(s.focus),
    cmd: { type: "app.focus", on: !s.focus },
  });
  controls.push({
    kind: "stepper",
    label: "Text size",
    value: `${text + 1} / ${texts}`,
    dec: { type: "app.text", delta: -1 },
    inc: { type: "app.text", delta: 1 },
    canDec: text > 0,
    canInc: text < texts - 1,
  });
  return controls;
}

export function castStep(cmd: CastCommand): number {
  const n = Number(cmd.delta);
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}
