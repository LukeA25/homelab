import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { CastMirror } from "@/components/CastMirror";
import { ControlVoice } from "@/components/ControlVoice";
import { KioskBackplane } from "@/components/KioskBackplane";
import { api } from "@/lib/api";
import { stopCast, useCastState } from "@/lib/cast";
import type { Room } from "@/lib/types";
import { TV_BEDROOM_WAKE_LIGHTS } from "@/tv-wake";
import "./nova-kiosk.css";

const KIOSK_ART = "/brand/nova-kiosk";

const SCENES = [
  { id: "sleep", label: "Sleep" },
  { id: "wake", label: "Wake" },
  { id: "study", label: "Study" },
] as const;

const LIGHT_PRESETS = [
  { label: "Warm", color: { color_temp_kelvin: 3200 } },
  { label: "Neutral", color: { color_temp_kelvin: 4500 } },
  { label: "Blue", color: { rgb_color: [91, 140, 255] } },
];

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

  const setBrightness = (value: number, commit: boolean) => {
    const next = Math.max(1, Math.min(100, Math.round(value)));
    setPct(next);
    if (commit) mutate.mutate({ on: true, brightness_pct: next });
  };

  const setBrightnessFromPointer = (clientY: number, commit: boolean) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect) setBrightness((1 - (clientY - rect.top) / rect.height) * 100, commit);
  };

  const onDimmerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const values: Record<string, number> = {
      ArrowUp: pct + 1,
      ArrowRight: pct + 1,
      ArrowDown: pct - 1,
      ArrowLeft: pct - 1,
      PageUp: pct + 10,
      PageDown: pct - 10,
      Home: 1,
      End: 100,
    };
    const value = values[event.key];
    if (value === undefined || !room.available || mutate.isPending) return;
    event.preventDefault();
    setBrightness(value, true);
  };

  const livingRoom = room.id === "living_room";
  const name = livingRoom ? "Living room" : room.name;
  const status = !room.available ? "Unavailable" : room.on ? "On" : "Off";
  const brightness = room.on || draggingRef.current ? `${pct}%` : status;

  return (
    <section className="kiosk-room" data-on={room.on} aria-label={name}>
      <header>
        <h2>{name}</h2>
        <p>{status}</p>
      </header>
      <div className="kiosk-room-controls">
        <div className="kiosk-power-area">
          <img
            className={`kiosk-room-plan ${livingRoom ? "living-room" : ""}`}
            src={`${KIOSK_ART}/${livingRoom ? "living-room" : "bedroom"}-plan.svg`}
            alt=""
          />
          <button
            type="button"
            className="kiosk-power"
            disabled={!room.available || mutate.isPending}
            onClick={() => mutate.mutate({ on: !room.on, brightness_pct: pct })}
            aria-label={`Toggle ${name}`}
            aria-pressed={room.on}
          >
            <img src={`${KIOSK_ART}/power-${room.on ? "on" : "off"}.svg`} width={128} height={128} alt="" />
          </button>
        </div>
        <div
          ref={trackRef}
          className="kiosk-dimmer"
          onPointerDown={(event) => {
            if (!room.available || mutate.isPending) return;
            draggingRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            setBrightnessFromPointer(event.clientY, false);
          }}
          onPointerMove={(event) => {
            if (draggingRef.current) setBrightnessFromPointer(event.clientY, false);
          }}
          onPointerUp={(event) => {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            setBrightnessFromPointer(event.clientY, true);
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
            setPct(room.brightness_pct ?? 50);
          }}
          onKeyDown={onDimmerKeyDown}
          tabIndex={room.available ? 0 : -1}
          role="slider"
          aria-disabled={!room.available}
          aria-orientation="vertical"
          aria-valuemin={1}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={brightness}
          aria-label={`${name} brightness`}
        >
          <div
            className="kiosk-dimmer-level"
            style={{ height: room.on || draggingRef.current ? `clamp(3px, ${pct}%, calc(100% - 4px))` : 3 }}
          />
        </div>
      </div>
      <div className="kiosk-brightness">
        <span>Brightness</span>
        <strong data-unavailable={!room.available}>{brightness}</strong>
      </div>
      <div className="kiosk-presets">
        {LIGHT_PRESETS.map(({ label, color }) => (
          <button
            type="button"
            key={label}
            disabled={!room.available || mutate.isPending}
            data-selected={room.on && (
              "color_temp_kelvin" in color
                ? room.color_temp_kelvin === color.color_temp_kelvin
                : color.rgb_color.every((value, index) => value === room.rgb_color?.[index])
            )}
            onClick={() => mutate.mutate({ on: true, brightness_pct: pct, ...color })}
          >
            {label}
          </button>
        ))}
      </div>
      {mutate.isError && <p className="kiosk-room-error" role="alert">Couldn’t update the lights.</p>}
    </section>
  );
}

function fitKiosk() {
  return Math.min(window.innerWidth / 1024, window.innerHeight / 768);
}

export default function ControlDashboard() {
  const [scale, setScale] = useState(fitKiosk);
  useEffect(() => {
    const resize = () => setScale(fitKiosk());
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

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
    <div className="control-kiosk">
      <main className="kiosk-layout" style={{ "--kiosk-scale": scale } as CSSProperties}>
        <KioskBackplane />
        <header className="kiosk-header">
          <h1>
            <img src={`${KIOSK_ART}/nova-logo.png`} width={48} height={48} alt="" />
            NOVA
          </h1>
          <button type="button" className="kiosk-reload" onClick={() => window.location.reload()} aria-label="Reload page">
            <img src={`${KIOSK_ART}/reload.svg`} width={20} height={20} alt="" />
          </button>
        </header>

        <div className="kiosk-controls">
          <ControlVoice onRoomsMaybeChanged={() => qc.invalidateQueries({ queryKey: ["rooms"] })} />

          <div className="kiosk-lighting">
            <section className="kiosk-scenes" aria-label="Scenes">
              {SCENES.map(({ id, label }) => (
                <button key={id} type="button" disabled={sceneMut.isPending} onClick={() => sceneMut.mutate(id)}>
                  <img src={`${KIOSK_ART}/${id}.svg`} width={58} height={48} alt="" />
                  {label}
                </button>
              ))}
            </section>
            {sceneMut.isError && <p className="kiosk-message" role="alert">Couldn’t activate the scene.</p>}
            <div className="kiosk-rooms">
              {rooms.map((room) => <CompactRoom key={room.id} room={room} />)}
              {!rooms.length && (
                <p className="kiosk-message">{roomsQ.isPending ? "Loading rooms…" : "No rooms available."}</p>
              )}
            </div>
          </div>
        </div>
      </main>

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
