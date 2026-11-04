import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { apiPost } from "@/lib/api";
import type { HabitStats, HabitToggleOut } from "@/lib/types";
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

export function HabitList({
  habits,
  loading,
  emptyLabel = "No habits yet — add one on the Habits page",
}: {
  habits?: HabitStats[];
  loading?: boolean;
  emptyLabel?: string;
}) {
  const toggle = useToggleHabit();

  if (loading) return <div className="h-32 animate-pulse rounded-xl bg-muted" />;
  if (!habits?.length)
    return (
      <p className="text-sm text-muted-foreground" data-testid="habits-empty">
        {emptyLabel}
      </p>
    );

  return (
    <ul className="space-y-2">
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
              disabled={toggle.isPending}
              aria-label={`Mark ${h.name} ${h.doneToday ? "not done" : "done"} today`}
              onClick={() => toggle.mutate({ id: h.id, name: h.name })}
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
