// Running habit: rain + wind for the next hour so you can decide before heading out.
import type { DistanceUnit } from "@/lib/types";
import { useWeather } from "@/lib/useWeather";
import { cn } from "@/lib/utils";

const KMH_PER_MPH = 1.609344;

export function RunWeather({ habitId, unit }: { habitId: string; unit: DistanceUnit }) {
  const { bundle } = useWeather();
  if (!bundle || bundle.hourly.length === 0) return null;
  const next = bundle.hourly.slice(0, 2); // this hour + the next
  const rain = Math.max(...next.map((h) => h.precipProb));
  const wind = Math.max(bundle.now.windSpeed, ...next.map((h) => h.windSpeed));
  const gusts = bundle.now.windGusts;
  const speed = (kmh: number) => (unit === "mi" ? `${Math.round(kmh / KMH_PER_MPH)} mph` : `${Math.round(kmh)} km/h`);

  const verdict =
    rain >= 60 ? { text: "Rain likely — maybe run later", tone: "warn" }
      : wind >= 35 || gusts >= 55 ? { text: "Strong wind — pick a sheltered route", tone: "warn" }
        : rain >= 30 ? { text: "Some showers possible", tone: "meh" }
          : { text: "Good time for a run", tone: "good" };

  return (
    <div
      className={cn(
        "mt-1 inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-2 py-1 text-xs",
        verdict.tone === "good" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        verdict.tone === "meh" && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
        verdict.tone === "warn" && "bg-rose-500/10 text-rose-700 dark:text-rose-300",
      )}
      data-testid={`run-weather-${habitId}`}
    >
      <span className="font-medium" data-testid={`run-weather-verdict-${habitId}`}>{verdict.text}</span>
      <span className="font-mono opacity-80" data-testid={`run-weather-details-${habitId}`}>
        next hour · ☔ {Math.round(rain)}% · 💨 {speed(wind)}{gusts > wind + 10 ? ` (gusts ${speed(gusts)})` : ""}
      </span>
    </div>
  );
}
