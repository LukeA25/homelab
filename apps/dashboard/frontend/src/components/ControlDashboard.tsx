import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Lightbulb, Moon, Power, RefreshCw, Sun } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CastMirror } from "@/components/CastMirror";
import { ControlVoice } from "@/components/ControlVoice";
import { api } from "@/lib/api";
import { stopCast, useCastState } from "@/lib/cast";
import type { Room } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TV_BEDROOM_WAKE_LIGHTS } from "@/tv-wake";

function CompactRoom({ room }: { room: Room }) {
  const qc = useQueryClient();
  const [pct, setPct] = useState(room.brightness_pct ?? 50);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!draggingRef.current && room.brightness_pct != null) setPct(room.brightness_pct);
  }, [room.brightness_pct]);

  const mutate = useMutation({
    mutationFn: (body: Parameters<typeof api.setRoom>[1]) => api.setRoom(room.id, body),
    onSettled: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
  });

  const setBrightnessFromPointer = (clientY: number, commit: boolean) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = 1 - (clientY - rect.top) / rect.height;
    const next = Math.max(1, Math.min(100, Math.round(ratio * 100)));
    setPct(next);
    if (commit) mutate.mutate({ on: true, brightness_pct: next });
  };

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-2.5 rounded-2xl border p-3",
        room.on ? "border-warm/40 bg-warm-soft/30" : "border-hairline bg-card",
      )}
    >
      <div className="flex items-start gap-2 px-0.5">
        <Lightbulb
          className={cn("mt-0.5 h-5 w-5 shrink-0", room.on ? "text-warm" : "text-ink-faint")}
        />
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-semibold leading-none">{room.name}</h2>
          <p className={cn("mt-1.5 text-xs", room.on ? "text-ink/80" : "text-ink-faint")}>
            {!room.available ? "Unavailable" : room.on ? `${pct}%` : "Off"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          className="rounded-xl border border-hairline bg-panel px-2 py-2.5 text-xs font-medium text-ink-muted"
          onClick={() =>
            mutate.mutate({ on: true, brightness_pct: pct, color_temp_kelvin: 3200 })
          }
        >
          Warm
        </button>
        <button
          type="button"
          className="rounded-xl border border-hairline bg-panel px-2 py-2.5 text-xs font-medium text-ink-muted"
          onClick={() =>
            mutate.mutate({ on: true, brightness_pct: pct, color_temp_kelvin: 4500 })
          }
        >
          Neutral
        </button>
        <button
          type="button"
          className="rounded-xl border border-hairline bg-panel px-2 py-2.5 text-xs font-medium text-ink-muted"
          onClick={() =>
            mutate.mutate({ on: true, brightness_pct: pct, rgb_color: [91, 140, 255] })
          }
        >
          Blue
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_3.25rem] gap-2.5">
        <button
          type="button"
          disabled={!room.available || mutate.isPending}
          onClick={() => mutate.mutate({ on: !room.on, brightness_pct: pct })}
          className={cn(
            "flex min-h-[9rem] items-center justify-center rounded-xl bg-transparent transition-colors",
            room.on ? "text-warm" : "text-ink-faint",
            "hover:bg-black/10 active:bg-black/15 disabled:opacity-50",
          )}
          aria-label={`Toggle ${room.name}`}
        >
          <Power className="h-[4.75rem] w-[4.75rem]" strokeWidth={1.55} />
        </button>

        <div
          ref={trackRef}
          className={cn(
            "relative min-h-[9rem] touch-none select-none overflow-hidden rounded-xl border",
            room.on ? "border-warm/35 bg-panel" : "border-hairline bg-panel opacity-70",
            !room.available && "pointer-events-none opacity-50",
          )}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (!room.available) return;
            draggingRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            setBrightnessFromPointer(e.clientY, false);
          }}
          onPointerMove={(e) => {
            if (!draggingRef.current) return;
            setBrightnessFromPointer(e.clientY, false);
          }}
          onPointerUp={(e) => {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            setBrightnessFromPointer(e.clientY, true);
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
          }}
          role="slider"
          aria-valuemin={1}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={`${room.name} brightness`}
        >
          <div
            className="absolute inset-x-0 bottom-0 bg-warm/80 transition-[height] duration-75"
            style={{ height: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function SceneButton({
  label,
  icon,
  onClick,
  busy,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="flex min-h-[5.75rem] flex-col items-center justify-center gap-1.5 rounded-2xl border border-hairline bg-panel px-2 py-3.5 text-sm font-semibold text-ink transition-colors hover:border-accent/40 disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}

export default function ControlDashboard() {
  const qc = useQueryClient();
  const kioskCast = useCastState()?.targets.kiosk ?? null;
  const roomsQ = useQuery({
    queryKey: ["rooms"],
    queryFn: api.rooms,
    refetchInterval: 5_000,
  });
  const rooms = roomsQ.data?.rooms || [];

  const sceneMut = useMutation({
    mutationFn: async (kind: "sleep" | "wake" | "study") => {
      if (kind === "sleep") {
        await api.setTvDisplay({ blanked: true, app: "dashboard" });
        await api.setRoom("bedroom", { on: false });
        return;
      }
      if (kind === "wake") {
        await api.setTvDisplay({ blanked: false });
        await api.setRoom("bedroom", { ...TV_BEDROOM_WAKE_LIGHTS });
        return;
      }
      await api.setRoom("bedroom", {
        on: true,
        brightness_pct: 80,
        color_temp_kelvin: 4500,
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
  });

  return (
    <div className="control-kiosk h-[100dvh] w-full overflow-hidden text-ink">
      <div className="mx-auto grid h-full max-w-[1200px] grid-cols-2 grid-rows-1 gap-3.5 p-3.5">
        <ControlVoice
          className="min-h-0 h-full"
          onRoomsMaybeChanged={() => qc.invalidateQueries({ queryKey: ["rooms"] })}
        />

        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <header className="flex shrink-0 items-end justify-between gap-2 px-0.5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                Nightstand
              </p>
              <h1 className="font-display text-3xl font-semibold leading-none tracking-tight">
                Controls
              </h1>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              aria-label="Reload page"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-hairline bg-panel text-ink-muted"
            >
              <RefreshCw className="h-5 w-5" aria-hidden />
            </button>
          </header>

          <div className="grid shrink-0 grid-cols-3 gap-2.5">
            <SceneButton
              label="Sleep"
              icon={<Moon className="h-6 w-6 text-ink-muted" />}
              busy={sceneMut.isPending}
              onClick={() => sceneMut.mutate("sleep")}
            />
            <SceneButton
              label="Wake"
              icon={<Sun className="h-6 w-6 text-warm" />}
              busy={sceneMut.isPending}
              onClick={() => sceneMut.mutate("wake")}
            />
            <SceneButton
              label="Study"
              icon={<BookOpen className="h-6 w-6 text-accent" />}
              busy={sceneMut.isPending}
              onClick={() => sceneMut.mutate("study")}
            />
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-hidden">
            {rooms.map((room) => (
              <CompactRoom key={room.id} room={room} />
            ))}
            {!rooms.length ? (
              <div className="col-span-full rounded-2xl border border-hairline bg-card p-4 text-base text-ink-muted">
                No rooms found. Check HA_TOKEN.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {kioskCast ? (
        <CastMirror
          target="kiosk"
          app={kioskCast.app}
          path={kioskCast.path}
          sentAt={kioskCast.sent_at}
          fromPhone
          backLabel="Controls"
          onBack={() => {
            stopCast("kiosk").catch(() => undefined);
          }}
        />
      ) : null}
    </div>
  );
}
