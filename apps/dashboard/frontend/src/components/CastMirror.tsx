import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { mirrorUrl, sendCastReport, useCastCommands, type CastApp, type CastTarget } from "@/lib/cast";

const APP_LABELS: Record<CastApp, string> = {
  home: "Homepage",
  finance: "Finance",
  guitar: "Guitar",
  theology: "Theology",
  homework: "Homework",
};

/**
 * Read-only mirror of a private app page. A shield covers the frame so the
 * screen can never be used to click into the real app; path changes and phone
 * remote commands are forwarded to the frame's cast.js, and its reports go back
 * to the phone.
 */
export function CastMirror({
  target,
  app,
  path,
  sentAt,
  fromPhone,
  backLabel,
  onBack,
}: {
  target: CastTarget;
  app: CastApp;
  path: string;
  sentAt: number;
  fromPhone: boolean;
  backLabel: string;
  onBack: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState(() => mirrorUrl(app, path));
  const loaded = useRef({ app, path });

  useCastCommands(target, (cmd) => {
    frameRef.current?.contentWindow?.postMessage({ type: "cast:command", cmd }, "*");
  });

  useEffect(() => {
    if (!fromPhone) return;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow || e.data?.type !== "cast:report") return;
      sendCastReport(target, e.data.report);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [target, fromPhone]);

  useEffect(() => {
    const prev = loaded.current;
    loaded.current = { app, path };
    if (prev.app !== app) {
      setSrc(mirrorUrl(app, path));
      return;
    }
    if (prev.path === path) return;

    const frame = frameRef.current?.contentWindow;
    let acked = false;
    const onMessage = (e: MessageEvent) => {
      if (e.source === frame && e.data?.type === "cast:navigated") acked = true;
    };
    window.addEventListener("message", onMessage);
    frame?.postMessage({ type: "cast:navigate", path }, "*");
    const fallback = window.setTimeout(() => {
      if (!acked) setSrc(mirrorUrl(app, path));
    }, 1500);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(fallback);
    };
  }, [app, path]);

  const back = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onBack();
  };

  return (
    <div className="cast-mirror" key={sentAt}>
      <div className="cast-mirror-stage cast-arrive">
        <iframe ref={frameRef} className="cast-mirror-frame" src={src} title={APP_LABELS[app]} />
        <div
          className="cast-mirror-shield"
          aria-hidden="true"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="cast-beam" aria-hidden="true" />
      <button type="button" className="cast-mirror-back" onClick={back}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        <span>{backLabel}</span>
      </button>
      <div className="cast-mirror-badge">
        <span className="cast-live-dot" />
        {fromPhone ? `${APP_LABELS[app]} · from phone` : APP_LABELS[app]}
      </div>
    </div>
  );
}
