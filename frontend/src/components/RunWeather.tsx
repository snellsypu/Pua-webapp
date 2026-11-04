// Running habit: next-hour rain + wind, plus the planner's best time today (weather +
// free time between appointments) with an optional reminder 15 min before.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, BellOff, Clock } from "lucide-react";
import { apiGet, apiPut } from "@/lib/api";
import type { AppSettings, DistanceUnit, RunPlan, SettingsUpdate } from "@/lib/types";
import { useWeather } from "@/lib/useWeather";
import { cn } from "@/lib/utils";

const KMH_PER_MPH = 1.609344;

const time12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};

export function RunWeather({ habitId, unit }: { habitId: string; unit: DistanceUnit }) {
  const qc = useQueryClient();
  const { bundle } = useWeather();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const plan = useQuery({
    queryKey: ["run-plan"],
    queryFn: () => apiGet<RunPlan | null>("/run-plan"),
    refetchInterval: 15 * 60_000,
  });
  const remind = useMutation({
    mutationFn: (u: SettingsUpdate) => apiPut<AppSettings>("/settings", u),
    onSuccess: (s) => {
      qc.setQueryData(["settings"], s);
      toast.success(s.runReminders ? "I'll remind you 15 min before your best run time" : "Run reminders off");
    },
    onError: () => toast.error("Could not save"),
  });

  const speed = (kmh: number) => (unit === "mi" ? `${Math.round(kmh / KMH_PER_MPH)} mph` : `${Math.round(kmh)} km/h`);
  const p = plan.data?.habitId === habitId ? plan.data : null;
  const on = settings.data?.runReminders ?? false;

  let chip = null;
  if (bundle && bundle.hourly.length > 0) {
    const next = bundle.hourly.slice(0, 2); // this hour + the next
    const rain = Math.max(...next.map((h) => h.precipProb));
    const wind = Math.max(bundle.now.windSpeed, ...next.map((h) => h.windSpeed));
    const gusts = bundle.now.windGusts;
    const verdict =
      rain >= 60 ? { text: "Rain likely — maybe run later", tone: "warn" }
        : wind >= 35 || gusts >= 55 ? { text: "Strong wind — pick a sheltered route", tone: "warn" }
          : rain >= 30 ? { text: "Some showers possible", tone: "meh" }
            : { text: "Good time for a run", tone: "good" };
    chip = (
      <div
        className={cn(
          "inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-2 py-1 text-xs",
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

  return (
    <div className="mt-1 space-y-1">
      {chip}
      {p && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-testid={`run-plan-${habitId}`}>
          <Clock className="size-3.5 text-primary" />
          <span>
            <span className="font-medium" data-testid={`run-plan-time-${habitId}`}>Best time today: {time12(p.time)}</span>
            <span className="text-muted-foreground"> · {p.reason} · {Math.round(p.temperature)}°</span>
          </span>
          <button
            type="button"
            onClick={() => remind.mutate({ runReminders: !on })}
            disabled={remind.isPending || settings.isLoading}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors duration-150",
              on ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={on}
            data-testid={`run-plan-remind-${habitId}`}
            title={on ? "Reminders on — notification 15 min before" : "Remind me 15 min before"}
          >
            {on ? <Bell className="size-3" /> : <BellOff className="size-3" />}
            {on ? `Reminder ${time12(p.remindAt)}` : "Remind me"}
          </button>
        </div>
      )}
    </div>
  );
}
