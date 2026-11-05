import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { apiGet } from "@/lib/api";
import type { DayContext, HabitStats, RoutineState } from "@/lib/types";
import { RoutineCard } from "@/components/RoutineCard";
import { useWeather } from "@/lib/useWeather";
import { addDaysIso, fmtDay, fmtShort } from "@/lib/dates";
import { fmtDeg, weatherCodeInfo } from "@/lib/weatherCodes";
import { DayAgenda } from "@/components/DayAgenda";
import { HabitList } from "@/components/HabitList";
import { ReminderList } from "@/components/ReminderList";
import { MealSlots } from "@/components/MealSlots";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Evening() {
  const todayQ = useQuery({
    queryKey: ["overview", 0],
    queryFn: () => apiGet<DayContext>("/overview?offset=0"),
  });
  const tomorrowQ = useQuery({
    queryKey: ["overview", 1],
    queryFn: () => apiGet<DayContext>("/overview?offset=1"),
  });
  const habits = useQuery({ queryKey: ["habits"], queryFn: () => apiGet<HabitStats[]>("/habits") });
  const routines = useQuery({
    queryKey: ["routines"],
    queryFn: () => apiGet<RoutineState[]>("/routines"),
  });
  const weather = useWeather();

  const today = todayQ.data;
  const tomorrow = tomorrowQ.data;
  const habitsData = habits.data;
  const doneToday = habitsData?.filter((h) => h.doneToday).length ?? 0;
  const tomorrowWx = weather.appToday
    ? weather.bundle?.days.find((d) => d.date === addDaysIso(weather.appToday!, 1))
    : undefined;
  const tomorrowCode = tomorrowWx ? weatherCodeInfo(tomorrowWx.code) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="space-y-6"
    >
      <section
        className="rounded-3xl border bg-gradient-to-br from-indigo-400/15 via-purple-400/10 to-transparent p-6 dark:from-indigo-400/10 dark:via-purple-400/5"
        data-testid="evening-hero"
      >
        <p className="text-sm font-medium text-violet-700 dark:text-violet-300">Evening review</p>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Wind down &amp; look ahead</h1>
        <p className="text-sm text-muted-foreground" data-testid="evening-date">
          {today ? fmtDay(today.date) : "…"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2" data-testid="evening-scorecard">
          <Badge variant="secondary" className="font-mono" data-testid="evening-habit-score">
            {doneToday}/{habitsData?.length ?? 0} habits done
          </Badge>
          <Badge variant="secondary" className="font-mono" data-testid="evening-appointment-score">
            {today?.appointments.length ?? 0} appointments today
          </Badge>
          <Badge variant="secondary" className="font-mono" data-testid="evening-reminder-score">
            {(today?.reminders.filter((r) => r.done).length ?? 0)}/{today?.reminders.length ?? 0}{" "}
            reminders done
          </Badge>
        </div>
      </section>

      <RoutineCard
        loading={routines.isLoading}
        routine={routines.data?.find((r) => r.kind === "bedtime")}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="font-heading">Today, recapped</CardTitle>
            <CardDescription>Close the loop — check off anything still open.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Appointments
              </p>
              <DayAgenda appointments={today?.appointments ?? []} workBlocks={today?.workBlocks ?? []} emptyLabel="No appointments today" />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Habits
              </p>
              <HabitList habits={habitsData} loading={habits.isLoading} />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Reminders
              </p>
              <ReminderList
                reminders={today?.reminders ?? []}
                loading={todayQ.isLoading}
                emptyLabel="No reminders today"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="font-heading">
              Tomorrow —{" "}
              <span className="text-muted-foreground">
                {tomorrow ? fmtShort(tomorrow.date) : "…"}
              </span>
            </CardTitle>
            <CardDescription data-testid="tomorrow-weather">
              {tomorrowCode && tomorrowWx
                ? `${tomorrowCode.emoji} ${tomorrowCode.label} · H ${fmtDeg(tomorrowWx.tempMax)} L ${fmtDeg(tomorrowWx.tempMin)} · ☔ ${Math.round(tomorrowWx.precipProb)}%`
                : "Tomorrow's forecast will appear here"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Appointments
              </p>
              <DayAgenda
                workBlocks={tomorrow?.workBlocks ?? []}
                appointments={tomorrow?.appointments ?? []}
                emptyLabel="Tomorrow is wide open"
              />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Meals
              </p>
              {tomorrow ? (
                <MealSlots date={tomorrow.date} meals={tomorrow.meals} />
              ) : (
                <div className="h-40 animate-pulse rounded-xl bg-muted" />
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Reminders
              </p>
              <ReminderList
                reminders={tomorrow?.reminders ?? []}
                loading={tomorrowQ.isLoading}
                quickAddDate={tomorrow?.date}
                emptyLabel="No reminders for tomorrow yet"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
