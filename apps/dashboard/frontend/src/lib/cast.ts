import { useEffect, useRef, useState } from "react";
import type { TvDisplayState } from "./api";

export type CastTarget = "tv" | "kiosk" | "guest";
export type CastApp = "home" | "finance" | "guitar" | "theology" | "homework";

export type CastSession = {
  target: CastTarget;
  app: CastApp;
  path: string;
  sent_at: number;
  updated_at: number;
};

export type CastSnapshot = {
  targets: Record<CastTarget, CastSession | null>;
  tv_display?: TvDisplayState;
};

const API = "/__cast/api";

const APP_HOSTS: Record<CastApp, string> = {
  home: "homepage.home.arpa",
  finance: "finance.home.arpa",
  guitar: "guitar.home.arpa",
  theology: "theology.home.arpa",
  homework: "homework.home.arpa",
};

const TV_APP_TO_CAST: Record<string, CastApp> = {
  guitar: "guitar",
  finance: "finance",
  homework: "homework",
  theology: "theology",
};

export function castAppForTvApp(app: string | undefined): CastApp | null {
  return (app && TV_APP_TO_CAST[app]) || null;
}

/** Private app URL for an on-network receiver, marked as a mirror view. */
export function mirrorUrl(app: CastApp, path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${window.location.protocol}//${APP_HOSTS[app]}${path}${sep}__cast=view`;
}

export type CastCommand = { type: string; [key: string]: unknown };
type CommandListener = (target: CastTarget, cmd: CastCommand) => void;
const commandListeners = new Set<CommandListener>();

/** Remote commands from the phone for one screen (delivered over the useCastState stream). */
export function useCastCommands(target: CastTarget, onCommand: (cmd: CastCommand) => void) {
  const handler = useRef(onCommand);
  handler.current = onCommand;
  useEffect(() => {
    const listener: CommandListener = (t, cmd) => {
      if (t === target) handler.current(cmd);
    };
    commandListeners.add(listener);
    return () => {
      commandListeners.delete(listener);
    };
  }, [target]);
}

export function sendCastReport(target: CastTarget, report: unknown): void {
  fetch(`${API}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target, report }),
  }).catch(() => undefined);
}

export async function stopCast(target: CastTarget): Promise<void> {
  await fetch(`${API}/stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
  });
}

/** Live cast state: server-sent events, with a slow poll as a safety net. */
export function useCastState(): CastSnapshot | null {
  const [state, setState] = useState<CastSnapshot | null>(null);

  useEffect(() => {
    let alive = true;
    const apply = (data: CastSnapshot) => {
      if (alive) setState(data);
    };
    const poll = () => {
      fetch(`${API}/state`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && apply(data))
        .catch(() => undefined);
    };

    let source: EventSource | null = null;
    if (typeof EventSource !== "undefined") {
      source = new EventSource(`${API}/events`);
      source.onmessage = (e) => {
        try {
          apply(JSON.parse(e.data));
        } catch {
          /* ignore malformed frame */
        }
      };
      source.addEventListener("command", (e) => {
        try {
          const { target, cmd } = JSON.parse((e as MessageEvent).data);
          commandListeners.forEach((fn) => fn(target, cmd));
        } catch {
          /* ignore malformed frame */
        }
      });
    }
    poll();
    const timer = window.setInterval(poll, source ? 15_000 : 2_000);
    return () => {
      alive = false;
      source?.close();
      window.clearInterval(timer);
    };
  }, []);

  return state;
}
