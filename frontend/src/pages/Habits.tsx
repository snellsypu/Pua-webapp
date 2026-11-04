import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Flame, Plus } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { DayContext, HabitStats, RangeBundle } from "@/lib/types";
import { useToggleHabit } from "@/components/HabitList";
import { HabitDialog } from "@/components/HabitDialog";
import { addDaysIso } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function Habits() {
  const habits = useQuery({ queryKey: ["habits"], queryFn: () => apiGet<HabitStats[]>("/habits") });
  const todayQ = useQuery({
    queryKey: ["overview", 0],
    queryFn: () => apiGet<DayContext>("/overview?offset=0"),
  });
  const today = todayQ.data?.date;

  const from = today ? addDaysIso(today, -27) : undefined;
  const range = useQuery({
    queryKey: ["range", from, today],
    queryFn: () => apiGet<RangeBundle>(`/range?from=${from}&to=${today}`),
    enabled: !!from && !!today,
  });
  const completionsByHabit = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const c of range.data?.completions ?? []) {
      if (!map.has(c.habitId)) map.set(c.habitId, new Set());
      map.get(c.habitId)!.add(c.date);
    }
    return map;
  }, [range.data]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HabitStats | null>(null);
  const toggle = useToggleHabit();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Habits</h1>
          <p className="text-sm text-muted-foreground">
            Streak habits reward every consecutive day; monthly counters track a monthly target.
          </p>
        </div>
        <Button
          data-testid="habit-new-button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> New habit
        </Button>
      </div>

      {habits.isLoading ? (
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
      ) : !habits.data?.length ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground" data-testid="habits-page-empty">
            No habits yet. Create your first one — try a streak like &ldquo;Read 20 pages&rdquo;.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {habits.data.map((h) => {
            const dates = completionsByHabit.get(h.id) ?? new Set<string>();
            const strip = today
              ? Array.from({ length: 28 }, (_, i) => addDaysIso(today, i - 27))
              : [];
            return (
              <Card key={h.id} data-testid={`habit-card-${h.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="font-heading text-lg">
                        {h.emoji} {h.name}
                      </CardTitle>
                      <CardDescription>
                        {h.mode === "streak" ? "Streak mode" : `Monthly counter · target ${h.monthlyTarget}`}
                      </CardDescription>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        variant="ghost"
                        size="xs"
                        data-testid={`habit-edit-${h.id}`}
                        onClick={() => {
                          setEditing(h);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {h.mode === "streak" ? (
                        <Badge className="gap-1 bg-orange-100 font-mono text-orange-800 dark:bg-orange-950 dark:text-orange-300" data-testid={`habit-streak-badge-${h.id}`}>
                          <Flame className="size-3.5" /> {h.streak} day{h.streak === 1 ? "" : "s"} ·
                          best {h.bestStreak}
                        </Badge>
                      ) : (
                        <Badge className="bg-indigo-100 font-mono text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300" data-testid={`habit-counter-badge-${h.id}`}>
                          {h.monthCount}/{h.monthlyTarget} this month
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant={h.doneToday ? "default" : "outline"}
                      size="sm"
                      data-testid={`habit-today-check-${h.id}`}
                      onClick={() => toggle.mutate({ id: h.id, name: h.name })}
                    >
                      {h.doneToday ? "Done today" : "Check off today"}
                    </Button>
                  </div>
                  {h.mode === "monthly" && (
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${Math.min(100, (h.monthCount / Math.max(1, h.monthlyTarget)) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Last 28 days</p>
                    <div className="flex flex-wrap gap-1" data-testid={`habit-heat-${h.id}`}>
                      {strip.map((d) => (
                        <span
                          key={d}
                          title={d}
                          className={cn(
                            "size-3.5 rounded-[4px]",
                            dates.has(d) ? "bg-primary" : "bg-muted",
                            d === today && "ring-1 ring-ring",
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <HabitDialog open={open} onOpenChange={setOpen} initial={editing} />
    </motion.div>
  );
}
