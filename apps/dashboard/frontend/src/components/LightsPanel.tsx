import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, Power } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Room } from "@/lib/types";
import { cn } from "@/lib/utils";

function hasMode(room: Room, ...modes: string[]) {
  return modes.some((m) => room.supported_color_modes.includes(m));
}

function RoomCard({ room }: { room: Room }) {
  const qc = useQueryClient();
  const [localPct, setLocalPct] = useState(room.brightness_pct ?? 80);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging && room.brightness_pct != null) {
      setLocalPct(room.brightness_pct);
    }
  }, [room.brightness_pct, dragging]);

  const mutate = useMutation({
    mutationFn: (body: Parameters<typeof api.setRoom>[1]) =>
      api.setRoom(room.id, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: ["rooms"] });
      const prev = qc.getQueryData<{ rooms: Room[] }>(["rooms"]);
      if (prev) {
        qc.setQueryData(["rooms"], {
          rooms: prev.rooms.map((r) =>
            r.id === room.id
              ? {
                  ...r,
                  on: body.on,
                  brightness_pct: body.brightness_pct ?? r.brightness_pct,
                  lights_on: body.on ? r.lights_total : 0,
                  available: true,
                }
              : r,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.prev) qc.setQueryData(["rooms"], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
  });

  const supportsBrightness = hasMode(
    room,
    "brightness",
    "color_temp",
    "hs",
    "xy",
    "rgb",
    "rgbw",
    "rgbww",
  );
  const supportsTemp = hasMode(room, "color_temp");
  const supportsColor = hasMode(room, "hs", "xy", "rgb", "rgbw", "rgbww");

  return (
    <div
      className={cn(
        "card flex flex-col gap-3 p-4 transition-colors",
        room.on ? "border-warm/40 bg-warm-soft/40" : "",
        !room.available && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Lightbulb
              className={cn("h-4 w-4 shrink-0", room.on ? "text-warm" : "text-ink-faint")}
            />
            <h3 className="truncate text-sm font-semibold">{room.name}</h3>
          </div>
          <p className="mt-0.5 text-xs text-ink-faint">
            {!room.available
              ? "Unavailable"
              : room.on
                ? `${localPct}% · ${room.lights_on}/${room.lights_total} on`
                : `Off · ${room.lights_total} lights`}
          </p>
        </div>
        <button
          type="button"
          disabled={!room.available || mutate.isPending}
          onClick={() => mutate.mutate({ on: !room.on, brightness_pct: localPct })}
          className={cn(
            "relative h-8 w-14 shrink-0 rounded-full transition-colors",
            room.on ? "bg-warm" : "bg-hairline",
          )}
          aria-label={`Toggle ${room.name}`}
        >
          <span
            className={cn(
              "absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform",
              room.on ? "left-7" : "left-1",
            )}
          />
        </button>
      </div>

      {supportsBrightness ? (
        <input
          type="range"
          min={1}
          max={100}
          value={localPct}
          disabled={!room.available}
          onPointerDown={() => setDragging(true)}
          onPointerUp={() => {
            setDragging(false);
            mutate.mutate({ on: true, brightness_pct: localPct });
          }}
          onChange={(e) => setLocalPct(Number(e.target.value))}
          className="w-full accent-warm"
        />
      ) : null}

      {supportsTemp || supportsColor ? (
        <div className="flex flex-wrap gap-1.5">
          {supportsTemp ? (
            <button
              type="button"
              disabled={!room.available}
              onClick={() =>
                mutate.mutate({ on: true, brightness_pct: localPct, color_temp_kelvin: 3200 })
              }
              className="rounded-full border border-hairline px-2.5 py-1 text-[11px] text-ink-muted hover:border-ink-faint"
            >
              Warm
            </button>
          ) : null}
          {supportsTemp ? (
            <button
              type="button"
              disabled={!room.available}
              onClick={() =>
                mutate.mutate({ on: true, brightness_pct: localPct, color_temp_kelvin: 4500 })
              }
              className="rounded-full border border-hairline px-2.5 py-1 text-[11px] text-ink-muted hover:border-ink-faint"
            >
              Neutral
            </button>
          ) : null}
          {supportsColor ? (
            <button
              type="button"
              disabled={!room.available}
              onClick={() =>
                mutate.mutate({
                  on: true,
                  brightness_pct: localPct,
                  rgb_color: [91, 140, 255],
                })
              }
              className="rounded-full border border-hairline px-2.5 py-1 text-[11px] text-ink-muted hover:border-ink-faint"
            >
              Blue
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function LightsPanel({ rooms }: { rooms: Room[] | undefined }) {
  const qc = useQueryClient();
  const anyOn = (rooms || []).some((r) => r.on);
  const allMut = useMutation({
    mutationFn: (on: boolean) =>
      api.setAllRooms({ on, brightness_pct: on ? 80 : undefined }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
  });

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">Lights</h2>
          <p className="text-xs text-ink-faint">Bedroom & living room</p>
        </div>
        <button
          type="button"
          onClick={() => allMut.mutate(!anyOn)}
          disabled={allMut.isPending || !rooms?.length}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            anyOn
              ? "border-warm/50 bg-warm-soft text-warm"
              : "border-hairline bg-panel text-ink-muted hover:text-ink",
          )}
        >
          <Power className="h-3.5 w-3.5" />
          {anyOn ? "All off" : "All on"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(rooms || []).map((room) => (
          <RoomCard key={room.id} room={room} />
        ))}
        {!rooms?.length ? (
          <div className="card col-span-full p-4 text-sm text-ink-muted">
            No rooms found. Check HA_TOKEN and Hubspace entities.
          </div>
        ) : null}
      </div>
    </section>
  );
}
