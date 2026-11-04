import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Sprout } from "lucide-react";
import { apiDelete, apiGet } from "@/lib/api";
import type {
  Appointment,
  DayContext,
  HabitStats,
  Meal,
  RangeBundle,
  Reminder,
} from "@/lib/types";
import { useToggleHabit } from "@/components/HabitList";
import { addDaysIso, fmtDay } from "@/lib/dates";
import { DayAgenda } from "@/components/DayAgenda";
import { MealSlots } from "@/components/MealSlots";
import { ReminderList } from "@/components/ReminderList";
import { AppointmentDialog, type AppointmentDraft } from "@/components/AppointmentDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export default function Calendar() {
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const [apptOpen, setApptOpen] = useState(false);
  const [apptDraft, setApptDraft] = useState<AppointmentDraft | undefined>();
  const qc = useQueryClient();

  const todayQ = useQuery({
    queryKey: ["overview", 0],
    queryFn: () => apiGet<DayContext>("/overview?offset=0"),
  });
  const today = todayQ.data?.date;

  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const from = format(gridStart, "yyyy-MM-dd");
  const to = format(gridEnd, "yyyy-MM-dd");
  const range = useQuery({
    queryKey: ["range", from, to],
    queryFn: () => apiGet<RangeBundle>(`/range?from=${from}&to=${to}`),
  });
  const habits = useQuery({ queryKey: ["habits"], queryFn: () => apiGet<HabitStats[]>("/habits") });

  const days = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, to],
  );

  const byDate = useMemo(() => {
    const appts = new Map<string, Appointment[]>();
    const meals = new Map<string, Meal[]>();
    const comps = new Map<string, Set<string>>();
    for (const a of range.data?.appointments ?? []) {
      appts.set(a.date, [...(appts.get(a.date) ?? []), a]);
    }
    for (const m of range.data?.meals ?? []) {
      meals.set(m.date, [...(meals.get(m.date) ?? []), m]);
    }
    for (const c of range.data?.completions ?? []) {
      if (!comps.has(c.date)) comps.set(c.date, new Set());
      comps.get(c.date)!.add(c.habitId);
    }
    return { appts, meals, comps };
  }, [range.data]);

  const delAppt = useMutation({
    mutationFn: (id: string) => apiDelete(`/appointments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["range"] });
      toast.success("Appointment deleted");
    },
    onError: () => toast.error("Could not delete the appointment"),
  });
  const selectedCompletions = new Set(
    (range.data?.completions ?? []).filter((c) => c.date === selected).map((c) => c.habitId),
  );
  const toggleDate = useToggleHabit(selected ?? undefined);

  const selectedAppointments = byDate.appts.get(selected ?? "") ?? [];
  const selectedMeals = byDate.meals.get(selected ?? "") ?? [];
  const selectedReminders = (range.data?.reminders ?? []).filter((r) => r.date === selected);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-bold tracking-tight">{format(month, "MMMM yyyy")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="icon-sm" data-testid="calendar-prev-month" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" data-testid="calendar-today-button" onClick={() => setMonth(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="icon-sm" data-testid="calendar-next-month" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2" data-testid="calendar-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="pb-1 text-center font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const iso = format(d, "yyyy-MM-dd");
          const appts = byDate.appts.get(iso) ?? [];
          const mealCount = (byDate.meals.get(iso) ?? []).length;
          const habitDone = byDate.comps.get(iso)?.size ?? 0;
          const habitTotal = habits.data?.length ?? 0;
          return (
            <button
              key={iso}
              data-testid={`calendar-cell-${iso}`}
              onClick={() => setSelected(iso)}
              className={cn(
                "flex h-20 flex-col rounded-xl border p-1.5 text-left transition-colors hover:bg-accent sm:h-24",
                isSameMonth(d, month) ? "bg-card" : "bg-muted/40 text-muted-foreground",
                iso === today && "ring-2 ring-primary",
              )}
            >
              <span className={cn("font-mono text-xs", iso === today && "font-bold text-primary")}>
                {format(d, "d")}
              </span>
              <div className="mt-auto flex items-center gap-1">
                {appts.length > 0 && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 font-mono text-[10px] text-primary-foreground" title={`${appts.length} appointments`}>
                    {appts.length}
                  </span>
                )}
                {habitTotal > 0 && habitDone > 0 && (
                  <span className="rounded-full bg-emerald-600/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-400" title={`${habitDone}/${habitTotal} habits`}>
                    {habitDone}/{habitTotal}
                  </span>
                )}
                {mealCount > 0 && (
                  <span className="rounded-full bg-violet-600/15 px-1.5 py-0.5 font-mono text-[10px] text-violet-700 dark:text-violet-400" title={`${mealCount} meals planned`}>
                    {mealCount}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sprout className="size-3.5" /> Tap a day to see its plan — appointments, habits, meals and
        reminders.
      </p>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md" data-testid="calendar-day-sheet">
          <SheetHeader>
            <SheetTitle className="font-heading" data-testid="calendar-sheet-title">
              {selected ? fmtDay(selected) : ""}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-6 overflow-y-auto px-4 pb-10">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Appointments
                </h3>
                <Button
                  size="xs"
                  variant="outline"
                  data-testid="sheet-add-appointment-button"
                  onClick={() => {
                    setApptDraft({ date: selected ?? undefined });
                    setApptOpen(true);
                  }}
                >
                  <Plus className="size-3.5" /> Add
                </Button>
              </div>
              <DayAgenda
                appointments={selectedAppointments}
                onEdit={(a) => {
                  setApptDraft({ ...a });
                  setApptOpen(true);
                }}
                onDelete={(a) => delAppt.mutate(a.id)}
              />
            </section>
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Habits
              </h3>
              {habits.data?.length ? (
                <ul className="space-y-1.5">
                  {habits.data.map((h) => (
                    <li key={h.id} className="flex items-center gap-2.5" data-testid={`calendar-habit-row-${h.id}`}>
                      <Checkbox
                        checked={selectedCompletions.has(h.id)}
                        onCheckedChange={() => toggleDate.mutate({ id: h.id, name: h.name })}
                        data-testid={`calendar-habit-check-${h.id}`}
                        aria-label={`Toggle ${h.name} on ${selected ?? ""}`}
                      />
                      <span className="text-sm">
                        {h.emoji} {h.name}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No habits yet.</p>
              )}
            </section>
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Meals
              </h3>
              {selected && <MealSlots date={selected} meals={selectedMeals} />}
            </section>
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Reminders
              </h3>
              <ReminderList reminders={selectedReminders} quickAddDate={selected ?? undefined} />
            </section>
          </div>
        </SheetContent>
      </Sheet>

      <AppointmentDialog open={apptOpen} onOpenChange={setApptOpen} initial={apptDraft} />
    </motion.div>
  );
}
