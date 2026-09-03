import { Cloud, CloudRain, CloudSnow, Sun, Cloudy } from "lucide-react";
import type { Weather } from "@/lib/types";
import { formatDate, formatTime, greetingForHour, hourInZone, useNow } from "@/lib/utils";

function WeatherIcon({ state }: { state: string }) {
  const s = state.toLowerCase();
  if (s.includes("rain") || s.includes("pour")) return <CloudRain className="h-5 w-5" />;
  if (s.includes("snow")) return <CloudSnow className="h-5 w-5" />;
  if (s.includes("cloud") || s.includes("fog") || s.includes("mist"))
    return <Cloudy className="h-5 w-5" />;
  if (s.includes("clear") || s.includes("sunny")) return <Sun className="h-5 w-5" />;
  return <Cloud className="h-5 w-5" />;
}

export function Header({
  weather,
  tz,
}: {
  weather: Weather | null | undefined;
  tz?: string;
}) {
  const now = useNow();

  const greeting = greetingForHour(hourInZone(now, tz));
  const time = formatTime(now, tz);
  const date = formatDate(now, tz);

  return (
    <header className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-muted">{greeting}</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink dash:text-3xl">
          Homelab
        </h1>
        <p className="mt-0.5 truncate text-sm text-ink-faint dash:hidden">{date}</p>
      </div>

      <div className="flex shrink-0 items-end gap-4 dash:gap-6">
        {weather ? (
          <div className="hidden items-center gap-2 rounded-full border border-hairline bg-panel/70 px-3 py-1.5 text-sm text-ink-muted sm:flex">
            <span className="text-accent">
              <WeatherIcon state={weather.state} />
            </span>
            <span className="tnum font-medium text-ink">
              {weather.temperature != null
                ? `${Math.round(weather.temperature)}${weather.temperature_unit.replace("°", "°")}`
                : "—"}
            </span>
            <span className="capitalize text-ink-faint">{weather.state.replace(/-/g, " ")}</span>
          </div>
        ) : null}

        <div className="text-right">
          <div className="font-display tnum text-2xl font-semibold tracking-tight text-ink dash:text-3xl">
            {time}
          </div>
          <div className="hidden text-sm text-ink-faint dash:block">{date}</div>
        </div>
      </div>
    </header>
  );
}
