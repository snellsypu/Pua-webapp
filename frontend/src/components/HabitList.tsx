import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { AppSettings, HabitLog, HabitStats, HabitToggleOut } from "@/lib/types";
import { fmtDist } from "@/lib/units";
import { DistanceDialog } from "@/components/DistanceDialog";
import { cn } from "@/lib/utils";

export function useToggleHabit(date?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; name: string }) =>
      apiPost<HabitToggleOut>(`/habits/${v.id}/toggle${date ? `?date=${date}` : ""}`),
    onSuccess: (out, v) => {
      qc.invalidateQueries({ queryKey: ["habits"] });
      qc.invalidateQueries({ queryKey: ["range"] });
      if (out.done) toast.success(`${v.name} — done`);
    },
    onError: () => toast.error("Could not update habit"),
  });
}

// Check off a distance habit with (or without) the distance run.
export function useLogHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; name: string; body: HabitLog }) =>
      apiPost<HabitToggleOut>(`/habits/${v.id}/log`, v.body),
    onSuccess: (_out, v) => {
      qc.invalidateQueries({ queryKey: ["habits"] });
      qc.invalidateQueries({ queryKey: ["range"] });
      toast.success(`${v.name} — done`);
    },
    onError: () => toast.error("Could not log the run"),
  });
}

// One click handler for every habit check button: distance habits that aren't
// done yet ask "how far?" first; everything else toggles straight away.
export function useHabitCheck() {
  const toggle = useToggleHabit();
  const log = useLogHabit();
  const [asking, setAsking] = useState<HabitStats | null>(null);
  const check = (h: HabitStats) => {
    if (h.tracksDistance && !h.doneToday) setAsking(h);
    else toggle.mutate({ id: h.id, name: h.name });
  };
  const dialog = (
    <DistanceDialog
      habit={asking}
      pending={log.isPending}
      onClose={() => setAsking(null)}
      onSubmit={(distanceKm) => {
        if (asking) log.mutate({ id: asking.id, name: asking.name, body: { distanceKm } });
        setAsking(null);
      }}
    />
  );
  return { check, dialog, pending: toggle.isPending || log.isPending };
}

export function HabitList({
  habits,
  loading,
  emptyLabel = "No habits yet — add one on the Habits page",
}: {
  habits?: HabitStats[];
  loading?: boolean;
  emptyLabel?: string;
}) {
  const { check, dialog, pending } = useHabitCheck();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const unit = settings.data?.distanceUnit ?? "km";

  if (loading) return <div className="h-32 animate-pulse rounded-xl bg-muted" />;
  if (!habits?.length)
    return (
      <p className="text-sm text-muted-foreground" data-testid="habits-empty">
        {emptyLabel}
      </p>
    );

  return (
    <ul className="space-y-2">
      {dialog}
      {habits.map((h) => {
        const pct =
          h.mode === "monthly"
            ? Math.min(100, Math.round((h.monthCount / Math.max(1, h.monthlyTarget)) * 100))
            : null;
        return (
          <li
            key={h.id}
            data-testid={`habit-row-${h.id}`}
            className="flex items-center gap-3 rounded-xl border p-3"
          >
            <motion.button
              whileTap={{ scale: 1.15 }}
              data-testid={`habit-check-${h.id}`}
              disabled={pending}
              aria-label={`Mark ${h.name} ${h.doneToday ? "not done" : "done"} today`}
              onClick={() => check(h)}
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors",
                h.doneToday
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input hover:border-primary",
              )}
            >
              {h.doneToday && <Check className="size-4" />}
            </motion.button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {h.emoji} {h.name}
              </div>
              <div className="font-mono text-xs text-muted-foreground" data-testid={`habit-stats-${h.id}`}>
                {h.mode === "streak"
                  ? `🔥 ${h.streak} day${h.streak === 1 ? "" : "s"} · best ${h.bestStreak}`
                  : `${h.monthCount}/${h.monthlyTarget} this month`}
              </div>
              {h.tracksDistance && (
                <div className="font-mono text-xs text-primary" data-testid={`habit-distance-${h.id}`}>
                  📏 {fmtDist(h.weekKm, unit)} this week · {fmtDist(h.monthKm, unit)} this month
                </div>
              )}
              {pct !== null && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
