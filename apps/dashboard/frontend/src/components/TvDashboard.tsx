import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ShieldPlus } from "lucide-react";
import { NovaWeatherIcon } from "./NovaWeatherIcon";
import { CastMirror } from "@/components/CastMirror";
import { api } from "@/lib/api";
import { castAppForTvApp, stopCast, useCastState } from "@/lib/cast";
import type {
  FinanceSummary,
  FinanceTrack,
  HomeworkResponse,
  LiturgyDay,
  Room,
  ServiceGroup,
  SystemStats,
  Weather,
} from "@/lib/types";
import {
  formatDate,
  formatTime,
  formatUptime,
  money,
  useNow,
} from "@/lib/utils";
import "./nova-tv.css";
import {
  isPastTvScheduledWake,
  TV_BEDROOM_ID,
  TV_BEDROOM_WAKE_LIGHTS,
  tvWakeDateKey,
} from "@/tv-wake";

function TvHeader({ weather, tz }: { weather?: Weather | null; tz?: string }) {
  const now = useNow();
  const [time, period] = formatTime(now, tz).split(" ");
  const forecast = weather?.forecast?.[0] as
    { temperature?: number; templow?: number } | undefined;
  const degrees = (value?: number | null) =>
    typeof value === "number" ? Math.round(value) + "°" : "—";
  return (
    <header className="nova-header">
      <div className="nova-brand">
        <img src="/brand/nova-logo.png" alt="" />
        NOVA
      </div>
      <div className="nova-clock">
        <strong>{time}</strong> <small>{period}</small>
        <label>{formatDate(now, tz)}</label>
      </div>
      <div className="nova-weather nova-face">
        <NovaWeatherIcon state={weather?.state ?? ""} />
        <div>
          <label>{weather?.friendly_name || "Weather"}</label>
          <div className="weather-reading"><b>
            {degrees(weather?.temperature)}
            {weather?.temperature_unit.replace("°", "")}
          </b>{" "}
          <span>{weather?.state.replace(/-/g, " ") ?? "Unavailable"}</span></div>
        </div>
        <aside>
          <span>High {degrees(forecast?.temperature)}</span>
          <span>Low {degrees(forecast?.templow)}</span>
        </aside>
      </div>
    </header>
  );
}

function Panel({
  title,
  detail,
  children,
  area,
}: {
  title: string;
  detail?: string;
  children: ReactNode;
  area: string;
}) {
  return (
    <section className={"nova-panel nova-face " + area}>
      <header>
        <h2>{title}</h2>
        <small>{detail}</small>
      </header>
      {children}
    </section>
  );
}

function HomeworkCard({ data, tz }: { data?: HomeworkResponse; tz?: string }) {
  const rows = data?.assignments.slice(0, 4) ?? [];
  return (
    <Panel
      title="Homework"
      detail={
        data?.connected ? data.assignments.length + " assignments" : undefined
      }
      area="homework"
    >
      <div className="assignments">
        {rows.map((a) => {
          const date = new Date(a.due);
          const day = Number.isFinite(date.getTime())
            ? date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                timeZone: tz,
              })
            : "";
          return (
            <div
              key={a.id}
              className={
                "assignment " +
                (a.overdue ? "late" : a.days_until === 0 ? "today" : "")
              }
            >
              <small>
                {a.overdue
                  ? "Overdue"
                  : a.days_until === 0
                    ? "Today"
                    : a.days_until === 1
                      ? "Tomorrow"
                      : a.day_label}
                <br />
                {day}
              </small>
              <i />
              <div>
                <b>{a.title}</b>
                <p>
                  {a.course_name}
                  {a.time_label && " · " + a.time_label}
                </p>
              </div>
            </div>
          );
        })}
        {!rows.length && (
          <p>{data?.connected ? "Nothing due" : "Homework unavailable"}</p>
        )}
      </div>
    </Panel>
  );
}

function kelvinToRgb(kelvin: number): [number, number, number] {
  const t = kelvin / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = Math.min(
      255,
      Math.max(0, 99.4708025861 * Math.log(t) - 161.1195681661),
    );
    if (t <= 19) b = 0;
    else
      b = Math.min(
        255,
        Math.max(0, 138.5177312231 * Math.log(t - 10) - 305.0447927307),
      );
  } else {
    r = Math.min(
      255,
      Math.max(0, 329.698727446 * Math.pow(t - 60, -0.1332047592)),
    );
    g = Math.min(
      255,
      Math.max(0, 288.1221695283 * Math.pow(t - 60, -0.0755148492)),
    );
    b = 255;
  }
  return [Math.round(r), Math.round(g), Math.round(b)];
}

function roomRgb(room: Room): [number, number, number] | null {
  if (!room.on || !room.available) return null;
  if (room.rgb_color?.length === 3) {
    return [room.rgb_color[0], room.rgb_color[1], room.rgb_color[2]];
  }
  if (room.color_temp_kelvin) return kelvinToRgb(room.color_temp_kelvin);
  return [255, 210, 140];
}

function LightStatus({ rooms }: { rooms?: Room[] }) {
  return (
    <Panel
      title="Lights"
      area="lights"
      detail={
        rooms &&
        rooms.filter((r) => r.on).length + " of " + rooms.length + " on"
      }
    >
      <div className={rooms?.length===2?"rooms floorplan":"rooms"}>
        {rooms?.length===2 && <svg viewBox="0 0 524 125" fill="none" aria-hidden="true">
          <path stroke="#799981" strokeWidth="2.3" d="M5 5h218v14h296v101H5ZM223 19v47m0 35v19"/>
          <path stroke="#496c53" strokeWidth="2" d="M223 101a35 35 0 0 0 35-35h-35M15 15h69v41H15ZM20 21h20v26H20ZM454 38h51v66h-15V54h-36Z"/>
        </svg>}
        {rooms?.map((room) => {
          const rgb = roomRgb(room),
            pct = room.brightness_pct;
          return (
            <div
              className={"room"+(room.id===TV_BEDROOM_ID?" bedroom":"")}
              key={room.id}
              style={
                rgb
                  ? {
                      backgroundImage: `radial-gradient(ellipse,rgba(${rgb.join(",")},${0.13 + (0.48 * (pct ?? 100)) / 100}),transparent 76%)`,
                    }
                  : undefined
              }
            >
              <span style={rgb ? {color: `rgb(${rgb})`, borderColor:`rgba(${rgb},.85)`,boxShadow:`0 0 ${4+0.18*(pct??100)}px rgba(${rgb},.34)`} : undefined}>
                {room.name}
                <br />
                <b>
                  {!room.available
                    ? "Unavailable"
                    : room.on
                      ? pct == null
                        ? "On"
                        : pct + "%"
                      : "Off"}
                </b>
              </span>
            </div>
          );
        })}
        {!rooms?.length && <p>No room data</p>}
      </div>
    </Panel>
  );
}

const BUDGET_DIAL_START = -137;
const BUDGET_DIAL_SWEEP = 274;
const BUDGET_DIAL_LENGTH = BUDGET_DIAL_SWEEP / 360 * 100;
const DAY_TO_DAY_SUBCATEGORIES = ["Food", "Misc", "API Costs"];

function financeSubcategories(track: FinanceTrack) {
  if (track.name !== "Day to Day") return track.subcategories.slice(0, 2);

  return DAY_TO_DAY_SUBCATEGORIES.map((name) => ({
    name,
    spent: track.subcategories.find(
      (subcategory) => subcategory.name.trim().toLowerCase() === name.toLowerCase(),
    )?.spent,
  }));
}

function budgetStatus(used: number, remaining: number) {
  if (remaining < 0 || used > 1) return "over-budget";
  return used >= 0.9 ? "near-budget" : "within-budget";
}

function clampBudgetUse(used: number) {
  return Math.max(0, Math.min(1, used));
}

function FinanceBrief({ summary: s, now, tz }: { summary?: FinanceSummary; now: Date; tz?: string }) {
  const parts = new Intl.DateTimeFormat("en-US",{year:"numeric",month:"numeric",day:"numeric",timeZone:tz}).formatToParts(now);
  const part=(key:string)=>Number(parts.find(p=>p.type===key)?.value);
  const pace=part("day")/new Date(part("year"),part("month"),0).getDate();
  const paceDate=now.toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:tz});
  const used = clampBudgetUse(s?.pct_used ?? 0);
  return (
    <Panel title="Finances" detail={s?.month_label ?? undefined} area="finance">
      {s?.connected ? (
        <div className="budget">
          <div className="overall">
            <div className={`dial ${budgetStatus(s.pct_used, s.remaining)}`}>
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <g transform={`rotate(${BUDGET_DIAL_START - 90} 50 50)`}>
                  <circle cx="50" cy="50" r="45" pathLength="100" strokeDasharray={`${BUDGET_DIAL_LENGTH} 100`} />
                  <circle cx="50" cy="50" r="45" pathLength="100" strokeDasharray={`${used * BUDGET_DIAL_LENGTH} 100`} className="used" />
                  <circle cx="50" cy="50" r="39" pathLength="100" strokeDasharray={`${BUDGET_DIAL_LENGTH} 100`} className="dial-guide" />
                </g>
                {Array.from({ length: 41 }, (_, i) => (
                  <path
                    key={i}
                    d={i % 5 === 0 ? "M50 -1v2.8" : "M50 0v1.3"}
                    stroke="#9ae8a6"
                    strokeWidth=".4"
                    transform={`rotate(${BUDGET_DIAL_START + i * BUDGET_DIAL_SWEEP / 40} 50 50)`}
                  />
                ))}
                <path
                  d="M50 -4v6.5"
                  stroke="#ffc369"
                  strokeWidth=".9"
                  transform={`rotate(${BUDGET_DIAL_START + used * BUDGET_DIAL_SWEEP} 50 50)`}
                />
                <g fill="#9eb3a1" fontSize="4" fontFamily="monospace"><text x="13" y="91">0</text><text x="80" y="91">100</text></g>
              </svg>
              <strong>{+(s.pct_used * 100).toFixed(1)}%</strong>
              <label>Budget used</label>
              <small>
                {money(s.spent)} of {money(s.budgeted)}
              </small>
            </div>
            <b>
              {money(Math.abs(s.remaining))} {s.remaining < 0 ? "over" : "left"}
            </b><small className="pace-key">{paceDate} pace · {(pace*100).toFixed(1)}%</small>
          </div>
          <div className="tracks">
            {s.focus.map((t) => (
              <div key={t.name} className={budgetStatus(t.pct_used, t.remaining)}>
                <header>
                  <b>{t.name}</b>
                  <small>
                    {money(Math.abs(t.remaining))}{" "}
                    {t.remaining < 0 ? "over" : "left"}
                  </small>
                </header>
                <small>
                  {money(t.spent)} / {money(t.budgeted)}
                </small>
                <b className="track-percent">{Math.round(t.pct_used*100)}%</b>
                <meter min="0" max="1" value={clampBudgetUse(t.pct_used)} aria-label={`${t.name} budget used`} />
                <footer>
                  {financeSubcategories(t).map((v) => (
                    <small key={v.name}>
                      {v.name}　{v.spent === undefined ? "—" : money(v.spent)}
                    </small>
                  ))}
                </footer>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p>Budget unavailable</p>
      )}
    </Panel>
  );
}

function Sparkline({
  values,
  color,
  height = 36,
}: {
  values: number[];
  color: string;
  height?: number;
}) {
  const width = 120;
  if (values.length < 2) {
    return <div style={{ height }} />;
  }
  const max = 100;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - (Math.min(Math.max(v, 0), max) / max) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HomelabStats({
  stats,
  groups,
}: {
  stats?: SystemStats;
  groups?: ServiceGroup[];
}) {
  const services = groups?.flatMap((g) => g.services);
  return (
    <Panel
      area="homelab"
      title="Homelab"
      detail={
        services &&
        services.filter((s) => s.status === "up").length +
          "/" +
          services.length +
          " services"
      }
    >
      <div className="metrics">
        {[
          ["CPU", stats?.cpu_pct],
          ["Memory", stats?.mem_pct],
          ["Disk", stats?.disk_pct],
        ].map(([name, value]) => (
          <div key={name}>
            <small>{name}</small>
            <strong>
              {typeof value === "number" ? Math.round(value) + "%" : "—"}
            </strong>
            {name === "CPU" ? (
              <Sparkline
                values={stats?.cpu_history ?? []}
                color="#a2efac"
                height={23}
              />
            ) : (
              <meter min="0" max="100" value={Number(value) || 0} />
            )}
          </div>
        ))}
      </div>
      {stats && (
        <footer>
          <small>UPTIME　{formatUptime(stats.uptime_seconds)}</small>
          <small>LOAD　{stats.load.map((n) => n.toFixed(2)).join(" / ")}</small>
        </footer>
      )}
    </Panel>
  );
}

function SaintCard({ day }: { day?: LiturgyDay }) {
  const season = day?.season?.replace(/_/g, " ");
  return (
    <Panel
      title="Saint of the day"
      detail={day?.date ?? undefined}
      area="saint"
    >
      <div className="celebration">
        <div className="celebration-heading">
          <ShieldPlus aria-hidden="true" />
          <div>
            {(day?.rank_label || season) && (
              <div className="celebration-details">
                {day?.rank_label && <small>{day.rank_label}</small>}
                {season && <small>{season}</small>}
              </div>
            )}
            <h3>{day?.name || "Celebration unavailable"}</h3>
          </div>
        </div>
        {day?.quote && <blockquote>“{day.quote}”</blockquote>}
      </div>
    </Panel>
  );
}

export default function TvDashboard() {
  const fit = () =>
    Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  const [scale, setScale] = useState(fit);
  useEffect(() => {
    const resize = () => setScale(fit());
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const [blanked, setBlanked] = useState(false);
  const autoWakeDateRef = useRef<string | null>(null);
  const castState = useCastState();
  const display = castState?.tv_display;
  const tvCast = castState?.targets.tv ?? null;
  const voiceApp = castAppForTvApp(display?.app);
  const qc = useQueryClient();
  const configQ = useQuery({
    queryKey: ["config"],
    queryFn: api.config,
    staleTime: Infinity,
  });
  const tz = configQ.data?.tz;
  const now = useNow(30_000);

  const weatherQ = useQuery({
    queryKey: ["weather"],
    queryFn: api.weather,
    refetchInterval: 60_000,
  });
  const roomsQ = useQuery({
    queryKey: ["rooms"],
    queryFn: api.rooms,
    refetchInterval: 10_000,
  });
  const financeQ = useQuery({
    queryKey: ["finance"],
    queryFn: () => api.finance(),
    refetchInterval: (query) => query.state.data?.connected ? 300_000 : 30_000,
  });
  const homeworkQ = useQuery({
    queryKey: ["homework"],
    queryFn: api.homework,
    refetchInterval: 60_000,
  });
  const systemQ = useQuery({
    queryKey: ["system"],
    queryFn: api.system,
    refetchInterval: 5_000,
  });
  const servicesQ = useQuery({
    queryKey: ["services"],
    queryFn: api.services,
    refetchInterval: 30_000,
  });
  const liturgyQ = useQuery({
    queryKey: ["liturgy"],
    queryFn: api.liturgy,
    refetchInterval: 3600_000,
    staleTime: 30 * 60_000,
  });

  const lightsMut = useMutation({
    mutationFn: (body: Parameters<typeof api.setRoom>[1]) =>
      api.setRoom(TV_BEDROOM_ID, body),
    onSettled: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
  });

  useEffect(() => {
    if (display) setBlanked(display.blanked);
  }, [display?.blanked, display?.updated_at]);

  const setSharedBlank = useCallback((next: boolean) => {
    setBlanked(next);
    api.setTvDisplay({ blanked: next }).catch(() => undefined);
  }, []);

  const wakeDisplay = useCallback(() => {
    setSharedBlank(false);
    lightsMut.mutate({ ...TV_BEDROOM_WAKE_LIGHTS });
  }, [lightsMut, setSharedBlank]);

  const toggleBlank = () => {
    const nextBlanked = !blanked;
    setSharedBlank(nextBlanked);
    if (nextBlanked) {
      lightsMut.mutate({ on: false });
      return;
    }
    lightsMut.mutate({ ...TV_BEDROOM_WAKE_LIGHTS });
  };

  const mirror = tvCast
    ? {
        app: tvCast.app,
        path: tvCast.path,
        sentAt: tvCast.sent_at,
        fromPhone: true,
      }
    : voiceApp
      ? {
          app: voiceApp,
          path: "/",
          sentAt: display?.updated_at ?? 0,
          fromPhone: false,
        }
      : null;

  const backToDashboard = () => {
    if (tvCast) {
      stopCast("tv").catch(() => undefined);
      return;
    }
    api.setTvDisplay({ app: "dashboard" }).catch(() => undefined);
  };

  useEffect(() => {
    if (!tz || !blanked) return;
    if (!isPastTvScheduledWake(now, tz)) return;

    const today = tvWakeDateKey(now, tz);
    if (autoWakeDateRef.current === today) return;

    autoWakeDateRef.current = today;
    wakeDisplay();
  }, [now, tz, blanked, wakeDisplay]);

  return (
    <div
      className="tv-page nova-tv"
      onClickCapture={mirror ? undefined : toggleBlank}
    >
      <main
        className="nova-wall"
        style={{ transform: "translate(-50%, -50%) scale(" + scale + ")" }}
      >
        <TvHeader weather={weatherQ.data?.weather} tz={tz} />
        <FinanceBrief summary={financeQ.data} now={now} tz={tz} />
        <HomeworkCard data={homeworkQ.data} tz={tz} />
        <SaintCard day={liturgyQ.data} />
        <LightStatus rooms={roomsQ.data?.rooms} />
        <HomelabStats stats={systemQ.data} groups={servicesQ.data?.groups} />
      </main>

      {mirror ? (
        <CastMirror
          target="tv"
          app={mirror.app}
          path={mirror.path}
          sentAt={mirror.sentAt}
          fromPhone={mirror.fromPhone}
          backLabel="Dashboard"
          onBack={backToDashboard}
        />
      ) : null}

      {blanked ? (
        <div
          className="tv-blank-overlay"
          aria-hidden="true"
          onClick={mirror ? wakeDisplay : undefined}
        />
      ) : null}
    </div>
  );
}
