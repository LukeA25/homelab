import { useQuery } from "@tanstack/react-query";
import type { CSSProperties, ReactNode } from "react";
import {
  Activity,
  BookOpen,
  Cloud,
  CloudRain,
  CloudSnow,
  Cloudy,
  Cpu,
  HardDrive,
  Lightbulb,
  MemoryStick,
  Server,
  Sun,
} from "lucide-react";
import { api } from "@/lib/api";
import type {
  Assignment,
  FinanceSummary,
  HomeworkResponse,
  Room,
  ServiceGroup,
  SystemStats,
  Weather,
} from "@/lib/types";
import {
  cn,
  formatBytes,
  formatDate,
  formatTime,
  formatUptime,
  greetingForHour,
  hourInZone,
  money,
  useNow,
} from "@/lib/utils";
import { tvLayoutStyle, TV_LAYOUT } from "@/tv-layout";

function WeatherIcon({ state, className }: { state: string; className?: string }) {
  const s = state.toLowerCase();
  if (s.includes("rain") || s.includes("pour")) return <CloudRain className={className} />;
  if (s.includes("snow")) return <CloudSnow className={className} />;
  if (s.includes("cloud") || s.includes("fog") || s.includes("mist"))
    return <Cloudy className={className} />;
  if (s.includes("clear") || s.includes("sunny")) return <Sun className={className} />;
  return <Cloud className={className} />;
}

function TvHeader({ weather, tz }: { weather: Weather | null | undefined; tz?: string }) {
  const now = useNow();
  const greeting = greetingForHour(hourInZone(now, tz));

  return (
    <div>
      <div style={{ float: "left" }}>
        <p className="text-base font-medium text-ink-muted" style={{ lineHeight: 1.2 }}>
          {greeting}
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink" style={{ lineHeight: 1.1 }}>
          Homelab
        </h1>
      </div>
      <div style={{ float: "right", textAlign: "right" }}>
        <div className="font-display tnum text-4xl font-semibold tracking-tight text-ink" style={{ lineHeight: 1 }}>
          {formatTime(now, tz)}
        </div>
        <div className="text-base text-ink-faint" style={{ lineHeight: 1.2, marginTop: 2 }}>
          {formatDate(now, tz)}
        </div>
      </div>
      {weather ? (
        <div className="tv-weather-pill">
          <span className="text-accent tv-weather-icon">
            <WeatherIcon state={weather.state} className="h-8 w-8" />
          </span>
          <span className="tv-weather-text">
            <div className="tnum text-3xl font-semibold text-ink tv-weather-temp">
              {weather.temperature != null
                ? `${Math.round(weather.temperature)}${weather.temperature_unit}`
                : "—"}
            </div>
            <div className="text-sm capitalize text-ink-faint tv-weather-state">
              {weather.state.replace(/-/g, " ")}
            </div>
          </span>
        </div>
      ) : null}
      <div style={{ clear: "both" }} />
    </div>
  );
}

function AssignmentRow({ a }: { a: Assignment }) {
  return (
    <div className="tv-chip tv-hw-row" style={{ width: "100%", overflow: "hidden" }}>
      <span
        style={{
          float: "left",
          width: 6,
          height: 36,
          marginRight: 12,
          borderRadius: 6,
          background: a.color,
        }}
      />
      <span style={{ float: "right", textAlign: "right" }}>
        <div
          className={cn(
            "text-base font-semibold",
            a.overdue ? "text-loss" : a.days_until === 0 ? "text-warm" : "text-ink",
          )}
        >
          {a.day_label}
        </div>
        {a.time_label ? <div className="tnum text-sm text-ink-faint">{a.time_label}</div> : null}
      </span>
      <div style={{ overflow: "hidden" }}>
        <p className="truncate text-lg font-semibold text-ink">{a.title}</p>
        <p className="truncate text-sm text-ink-faint">{a.course_name}</p>
      </div>
    </div>
  );
}

function HomeworkCard({ data }: { data: HomeworkResponse | undefined }) {
  const items = (data?.assignments ?? []).slice(0, 8);
  return (
    <div className="tv-card tv-card-hw">
      <div className="tv-hw-header">
        <div style={{ float: "left" }}>
          <BookOpen className="h-4 w-4 text-accent" style={{ display: "inline-block", verticalAlign: "middle" }} />
          <h2
            className="tv-card-title font-display tracking-tight"
            style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 8 }}
          >
            Homework
          </h2>
        </div>
        <div style={{ float: "right" }} className="tv-hw-badges text-sm">
          {data?.overdue_count ? (
            <span className="rounded-full bg-loss/15 px-3 py-1 font-medium text-loss">
              {data.overdue_count} overdue
            </span>
          ) : null}
          <span className="rounded-full bg-panel px-3 py-1 text-ink-muted" style={{ marginLeft: 8 }}>
            {data?.upcoming_count ?? 0} upcoming
          </span>
        </div>
        <div style={{ clear: "both" }} />
      </div>

      {items.length ? (
        <div className="tv-hw-list">
          {items.map((a) => (
            <AssignmentRow key={a.id} a={a} />
          ))}
        </div>
      ) : (
        <p className="text-ink-muted">
          {data?.connected === false
            ? "Homework database not reachable."
            : "Nothing due — you're all caught up."}
        </p>
      )}
    </div>
  );
}

function kelvinToRgb(kelvin: number): [number, number, number] {
  const t = kelvin / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = Math.min(255, Math.max(0, 99.4708025861 * Math.log(t) - 161.1195681661));
    if (t <= 19) b = 0;
    else b = Math.min(255, Math.max(0, 138.5177312231 * Math.log(t - 10) - 305.0447927307));
  } else {
    r = Math.min(255, Math.max(0, 329.698727446 * Math.pow(t - 60, -0.1332047592)));
    g = Math.min(255, Math.max(0, 288.1221695283 * Math.pow(t - 60, -0.0755148492)));
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

function rgbCss(rgb: [number, number, number]): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function roomGlowStyle(room: Room): CSSProperties {
  const rgb = roomRgb(room);
  if (!rgb) {
    return { borderColor: "#2A3344", background: "#151A22" };
  }
  const [r, g, b] = rgb;
  return {
    borderColor: `rgba(${r}, ${g}, ${b}, 0.55)`,
    background: `rgba(${r}, ${g}, ${b}, 0.2)`,
    boxShadow: `inset 0 0 24px rgba(${r}, ${g}, ${b}, 0.12)`,
  };
}

function LightStatus({ rooms }: { rooms: Room[] | undefined }) {
  const list = rooms ?? [];
  return (
    <div className="tv-card tv-card-compact">
      <div style={{ marginBottom: 6 }}>
        <Lightbulb className="h-4 w-4 text-warm" style={{ display: "inline-block", verticalAlign: "middle" }} />
        <h2
          className="tv-card-title font-display tracking-tight"
          style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 8 }}
        >
          Lights
        </h2>
      </div>
      {list.length ? (
        <div className="tv-stack">
          {list.map((room) => {
            const rgb = roomRgb(room);
            const pct = room.on ? (room.brightness_pct ?? 0) : 0;
            const fillWidth = !room.on ? 0 : pct >= 99 ? 100 : Math.max(pct, 3);
            return (
              <div key={room.id} className="tv-stack-item">
                <div
                  className="tv-light-room"
                  style={{
                    ...roomGlowStyle(room),
                    opacity: room.available ? 1 : 0.5,
                  }}
                >
                  <div style={{ overflow: "hidden" }}>
                    <span
                      style={{
                        float: "right",
                        width: 10,
                        height: 10,
                        marginTop: 4,
                        borderRadius: 10,
                        background: rgb ? rgbCss(rgb) : "#2A3344",
                        border: "1px solid rgba(255,255,255,0.15)",
                      }}
                    />
                    <div className="truncate text-base font-semibold text-ink">{room.name}</div>
                    <p className="text-sm text-ink-faint" style={{ marginTop: 2 }}>
                      {!room.available
                        ? "Unavailable"
                        : room.on
                          ? `${room.lights_on}/${room.lights_total} on`
                          : "Off"}
                    </p>
                  </div>
                  <div className="tv-light-bar-row">
                    <div className="tv-light-bar-track">
                      <div
                        className="tv-light-bar-fill"
                        style={{
                          width: `${fillWidth}%`,
                          background: rgb ? rgbCss(rgb) : "#2A3344",
                          opacity: room.on ? 1 : 0.35,
                          borderRadius: fillWidth >= 100 ? "6px" : "6px 0 0 6px",
                        }}
                      />
                    </div>
                    <span className="tnum tv-light-pct">
                      {room.on ? `${pct}%` : "—"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">No rooms found.</p>
      )}
    </div>
  );
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  const fill = Math.min(Math.max(pct, 0), 1) * 100;
  return (
    <div className="tv-bar">
      <span style={{ width: `${Math.max(fill, pct > 0 ? 4 : 0)}%`, background: color }} />
    </div>
  );
}

const PIE_COLORS = ["#F0B429", "#3DDC97", "#5B8CFF", "#A78BFA"];

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function ringSegmentPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startDeg: number,
  endDeg: number,
): string {
  if (endDeg - startDeg >= 359.99) endDeg = startDeg + 359.99;
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const o0 = polar(cx, cy, outerR, startDeg);
  const o1 = polar(cx, cy, outerR, endDeg);
  const i1 = polar(cx, cy, innerR, endDeg);
  const i0 = polar(cx, cy, innerR, startDeg);
  return [
    `M ${o0.x.toFixed(2)} ${o0.y.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `L ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${i0.x.toFixed(2)} ${i0.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function financePieSlices(summary: FinanceSummary | undefined) {
  const focus = summary?.focus ?? [];
  const focusSum = focus.reduce((s, t) => s + t.spent, 0);
  const other = Math.max(0, (summary?.spent ?? 0) - focusSum);
  const slices = focus.map((t, i) => ({
    label: t.name,
    value: t.spent,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));
  if (other > 0.01) {
    slices.push({ label: "Other", value: other, color: PIE_COLORS[2] });
  }
  return slices.filter((s) => s.value > 0);
}

function pieLayoutForSliceCount(count: number) {
  const size = count <= 1 ? 150 : count === 2 ? 144 : 118;
  const amountFont = Math.max(10, Math.round(size * 0.09));
  const spentFont = Math.max(7, Math.round(size * 0.058));
  return {
    size,
    amountFont,
    spentFont,
    compactMoney: size < 130,
  };
}

function FinanceDonut({
  summary,
  layout,
}: {
  summary: FinanceSummary | undefined;
  layout: ReturnType<typeof pieLayoutForSliceCount>;
}) {
  const slices = financePieSlices(summary);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const { size, amountFont, spentFont, compactMoney } = layout;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 2;
  const innerR = outerR * 0.67;

  if (total <= 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="#2a3344" strokeWidth={outerR - innerR} />
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#6b778a" fontSize="10">
          No
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill="#6b778a" fontSize="10">
          spend
        </text>
      </svg>
    );
  }

  let angle = 0;
  const segments = slices.map((slice) => {
    const sweep = (slice.value / total) * 360;
    const start = angle;
    angle += sweep;
    return { ...slice, start, end: angle };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((seg) => (
        <path
          key={seg.label}
          d={ringSegmentPath(cx, cy, innerR, outerR, seg.start, seg.end)}
          fill={seg.color}
        />
      ))}
      <text
        x={cx}
        y={cy - Math.round(spentFont * 0.35)}
        textAnchor="middle"
        fill="#e8edf5"
        fontSize={amountFont}
        fontWeight="600"
      >
        {money(summary?.spent, !compactMoney)}
      </text>
      <text
        x={cx}
        y={cy + Math.round(amountFont * 0.55)}
        textAnchor="middle"
        fill="#6b778a"
        fontSize={spentFont}
      >
        spent
      </text>
    </svg>
  );
}

function FinanceBrief({ summary }: { summary: FinanceSummary | undefined }) {
  const over = (summary?.remaining ?? 0) < 0;
  const focus = summary?.focus ?? [];
  const pieSlices = financePieSlices(summary);
  const pieLayout = pieLayoutForSliceCount(pieSlices.length);

  return (
    <div className="tv-card tv-card-finance">
      <div style={{ overflow: "hidden", marginBottom: 6 }}>
        <div style={{ float: "left" }}>
          <Activity className="h-4 w-4 text-gain" style={{ display: "inline-block", verticalAlign: "middle" }} />
          <h2
            className="tv-card-title font-display tracking-tight"
            style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 8 }}
          >
            Finance
          </h2>
        </div>
        <span className="text-sm text-ink-faint" style={{ float: "right", marginTop: 3 }}>
          {summary?.month_label ?? "This month"}
        </span>
      </div>

      <div className="tv-finance-body">
        <div className="tv-finance-details">
          <div className="tv-chip" style={{ width: "100%", marginBottom: 8 }}>
            <div style={{ overflow: "hidden" }}>
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint" style={{ float: "left" }}>
                Overall
              </span>
              <span className={cn("tnum text-sm font-medium", over ? "text-loss" : "text-gain")} style={{ float: "right" }}>
                {over
                  ? `${money(Math.abs(summary?.remaining ?? 0), true)} over`
                  : `${money(summary?.remaining ?? 0, true)} left`}
              </span>
            </div>
            <div style={{ overflow: "hidden", marginTop: 3 }}>
              <span className="tnum tv-finance-overall font-display" style={{ float: "left" }}>
                {money(summary?.spent, true)}
              </span>
              <span className="tnum text-sm text-ink-muted" style={{ float: "right", marginTop: 6 }}>
                of {money(summary?.budgeted, true)}
              </span>
            </div>
            <div style={{ marginTop: 6 }}>
              <MiniBar pct={summary?.pct_used ?? 0} color={over ? "#F07178" : "#5B8CFF"} />
            </div>
          </div>

          {focus.length ? (
            <div className="tv-finance-focus">
              {focus.map((track, i) => {
                const tOver = track.remaining < 0;
                const subs = track.subcategories.slice(0, 2);
                return (
                  <div key={track.name} className="tv-finance-focus-col">
                    <div className="tv-chip tv-finance-focus-chip">
                      <p className="truncate text-sm font-semibold text-ink">{track.name}</p>
                      <p className="tnum tv-finance-track-amt">
                        {money(track.spent)}
                        <span className="text-sm font-normal text-ink-faint">
                          {" "}
                          / {money(track.budgeted)}
                        </span>
                      </p>
                      <div style={{ marginTop: 5 }}>
                        <MiniBar
                          pct={track.pct_used}
                          color={tOver ? "#F07178" : i === 0 ? "#F0B429" : "#3DDC97"}
                        />
                      </div>
                      <div className="tv-finance-subs">
                        {subs.map((sub) => (
                          <div key={sub.name} className="tv-mini-sub" style={{ overflow: "hidden", marginTop: 4 }}>
                            <span className="truncate" style={{ float: "left", maxWidth: "58%" }}>
                              {sub.name}
                            </span>
                            <span className="tnum" style={{ float: "right" }}>
                              {money(sub.spent, true)}
                            </span>
                          </div>
                        ))}
                        {subs.length < 2
                          ? Array.from({ length: 2 - subs.length }).map((_, j) => (
                              <div
                                key={`pad-${j}`}
                                className="tv-mini-sub tv-finance-sub-pad"
                                aria-hidden="true"
                              />
                            ))
                          : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="tv-finance-chart">
          <div
            className="tv-pie-wrap"
            style={{ width: pieLayout.size, height: pieLayout.size }}
          >
            <FinanceDonut summary={summary} layout={pieLayout} />
          </div>
          <div className="tv-pie-legend">
            {pieSlices.map((slice) => {
              const total = pieSlices.reduce((s, x) => s + x.value, 0);
              const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0;
              return (
                <div key={slice.label} className="tv-pie-legend-row">
                  <span className="tv-pie-dot" style={{ background: slice.color }} />
                  <span className="truncate" style={{ float: "left", maxWidth: "55%" }}>
                    {slice.label}
                  </span>
                  <span className="tnum" style={{ float: "right" }}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ clear: "both" }} />
      </div>
    </div>
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
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height={height}>
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

function MetricTile({
  icon,
  label,
  value,
  sub,
  extra,
  compact = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  extra?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("tv-mini", compact && "tv-mini-tight")}>
      <div className="tv-mini-label">
        <span style={{ display: "inline-block", verticalAlign: "middle" }}>{icon}</span>
        <span style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 5 }}>
          {label}
        </span>
      </div>
      <div className="tnum tv-mini-value font-display" style={{ marginTop: 3 }}>
        {value}
      </div>
      {sub ? <div className="tnum tv-mini-sub">{sub}</div> : null}
      {extra}
    </div>
  );
}

function HomelabStats({
  stats,
  groups,
}: {
  stats: SystemStats | undefined;
  groups: ServiceGroup[] | undefined;
}) {
  const services = (groups ?? []).flatMap((g) => g.services);
  const up = services.filter((s) => s.status === "up").length;
  const total = services.length;

  return (
    <div className="tv-card tv-card-compact">
      <div style={{ overflow: "hidden", marginBottom: 4 }}>
        <div style={{ float: "left" }}>
          <Server className="h-4 w-4 text-accent" style={{ display: "inline-block", verticalAlign: "middle" }} />
          <h2
            className="tv-card-title font-display tracking-tight"
            style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 8 }}
          >
            Homelab
          </h2>
        </div>
        <span className="tnum tv-homelab-inline">
          {stats ? formatUptime(stats.uptime_seconds) : "—"}
          {stats ? ` · load ${stats.load[0].toFixed(2)}` : ""}
        </span>
      </div>
      <div className="tv-metrics tv-metrics-compact tv-metrics-2col">
        <div className="tv-metrics-row">
          <div className="tv-metrics-cell">
            <MetricTile
              icon={<Cpu className="h-3.5 w-3.5" />}
              label="CPU"
              value={`${Math.round(stats?.cpu_pct ?? 0)}%`}
              extra={
                <div style={{ marginTop: 2 }}>
                  <Sparkline values={stats?.cpu_history ?? []} color="#5B8CFF" height={14} />
                </div>
              }
            />
          </div>
          <div className="tv-metrics-cell">
            <MetricTile
              icon={<MemoryStick className="h-3.5 w-3.5" />}
              label="Memory"
              value={`${Math.round(stats?.mem_pct ?? 0)}%`}
              sub={stats ? formatBytes(stats.mem_used) : undefined}
            />
          </div>
        </div>
        <div className="tv-metrics-row">
          <div className="tv-metrics-cell">
            <MetricTile
              icon={<Server className="h-3.5 w-3.5" />}
              label="Services"
              value={`${up}/${total}`}
              sub={up === total && total > 0 ? "all up" : "degraded"}
            />
          </div>
          <div className="tv-metrics-cell">
            <MetricTile
              icon={<HardDrive className="h-3.5 w-3.5" />}
              label="Disk"
              value={`${Math.round(stats?.disk_pct ?? 0)}%`}
              sub={stats ? formatBytes(stats.disk_used) : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TvDashboard() {
  const configQ = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const tz = configQ.data?.tz;

  const weatherQ = useQuery({
    queryKey: ["weather"],
    queryFn: api.weather,
    refetchInterval: 60_000,
  });
  const roomsQ = useQuery({ queryKey: ["rooms"], queryFn: api.rooms, refetchInterval: 10_000 });
  const financeQ = useQuery({
    queryKey: ["finance", TV_LAYOUT.financeDisplayMonth],
    queryFn: () =>
      api.finance(false, TV_LAYOUT.financeDisplayMonth || undefined),
    refetchInterval: 300_000,
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

  return (
    <div className="tv-page" style={tvLayoutStyle()}>
      <div className="tv-band tv-band-header">
        <TvHeader weather={weatherQ.data?.weather} tz={tz} />
      </div>

      <div className="tv-band tv-band-content">
        <div className="tv-col-left">
          <HomeworkCard data={homeworkQ.data} />
        </div>
        <div className="tv-col-right">
          <div className="tv-r-finance">
            <FinanceBrief summary={financeQ.data} />
          </div>
          <div className="tv-r-lights">
            <LightStatus rooms={roomsQ.data?.rooms} />
          </div>
          <div className="tv-r-homelab">
            <HomelabStats stats={systemQ.data} groups={servicesQ.data?.groups} />
          </div>
        </div>
      </div>
    </div>
  );
}
