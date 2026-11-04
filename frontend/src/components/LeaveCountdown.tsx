// Today screen: live "Leave in 12 min" countdown for the next appointment with a
// travel time. The server computes leaveInMin; the client ticks it down each second.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { CloudRain, Navigation } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { AppSettings, CommuteNext } from "@/lib/types";
import { TRAVEL_LABELS } from "@/components/AppointmentDialog";
import { cn } from "@/lib/utils";

const pos = (): Promise<GeolocationPosition | null> =>
  new Promise((res) =>
    "geolocation" in navigator
      ? navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 8000, maximumAge: 300_000 })
      : res(null),
  );

const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);

export function LeaveCountdown({ className }: { className?: string }) {
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const live = !!settings.data?.premiumVoice && !!settings.data?.liveLocation;
  const next = useQuery({
    queryKey: ["commute-next", live],
    enabled: settings.isSuccess,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const p = live ? await pos() : null;
      const q = p ? `?lat=${p.coords.latitude}&lon=${p.coords.longitude}` : "";
      return { data: await apiGet<CommuteNext | null>(`/commute/next${q}`), at: Date.now() };
    },
  });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const c = next.data?.data;
  if (!c || !next.data) return null;
  const secsLeft = c.leaveInMin * 60 - Math.floor((now - next.data.at) / 1000);
  const mins = Math.ceil(secsLeft / 60);
  const urgent = mins <= 5;
  const label = mins <= 0 ? "Leave now" : `Leave in ${hm(mins)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-3",
        urgent ? "border-rose-500/40 bg-rose-500/10" : "border-primary/30 bg-primary/5",
        className,
      )}
      data-testid="leave-countdown"
    >
      <span className={cn("grid size-9 place-items-center rounded-full", urgent ? "bg-rose-500 text-white" : "bg-primary text-primary-foreground")}>
        <Navigation className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("font-heading text-lg font-bold tabular-nums", urgent && "text-rose-700 dark:text-rose-300")} data-testid="leave-countdown-label">
          {label}
          {mins > 0 && mins <= 10 && (
            <span className="ml-2 font-mono text-sm font-normal opacity-70">
              {String(Math.floor(Math.max(0, secsLeft) / 60)).padStart(2, "0")}:{String(Math.max(0, secsLeft) % 60).padStart(2, "0")}
            </span>
          )}
        </p>
        <p className="truncate text-sm text-muted-foreground" data-testid="leave-countdown-detail">
          {c.title} at {c.startTime} · {c.location} · {hm(c.minutes)} {TRAVEL_LABELS[c.mode].toLowerCase()} · leave by {c.leaveBy}
        </p>
      </div>
      {c.rainMinutes != null && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300" data-testid="leave-countdown-rain">
          <CloudRain className="size-4" /> Heavy rain — driving is {hm(c.rainMinutes)} (leave by {c.rainLeaveBy})
        </p>
      )}
    </motion.div>
  );
}
