import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Umbrella } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { DayContext, HabitStats, RoutineState } from "@/lib/types";
import { RoutineCard } from "@/components/RoutineCard";
import { useWeather } from "@/lib/useWeather";
import { fmtDay } from "@/lib/dates";
import { WeatherCard } from "@/components/WeatherCard";
import { DayAgenda } from "@/components/DayAgenda";
import { HabitList } from "@/components/HabitList";
import { ReminderList } from "@/components/ReminderList";
import { MealSlots } from "@/components/MealSlots";
import { AppointmentDialog, type AppointmentDraft } from "@/components/AppointmentDialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";

export default function Morning() {
  const overview = useQuery({
    queryKey: ["overview", 0],
    queryFn: () => apiGet<DayContext>("/overview?offset=0"),
  });
  const habits = useQuery({ queryKey: ["habits"], queryFn: () => apiGet<HabitStats[]>("/habits") });
  const routines = useQuery({
    queryKey: ["routines"],
    queryFn: () => apiGet<RoutineState[]>("/routines"),
  });
  const weather = useWeather();
  const [apptOpen, setApptOpen] = useState(false);
  const [apptDraft, setApptDraft] = useState<AppointmentDraft | undefined>();

  const data = overview.data;
  const todayWx = weather.bundle?.days.find((d) => d.date === weather.appToday);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="space-y-6"
    >
      <section
        className="rounded-3xl border bg-gradient-to-br from-amber-400/20 via-orange-300/10 to-transparent p-6 dark:from-amber-400/10 dark:via-orange-300/5"
        data-testid="morning-hero"
      >
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Morning briefing</p>
            <h1 className="font-heading text-3xl font-bold tracking-tight">Good morning</h1>
            <p className="text-sm text-muted-foreground" data-testid="morning-date">
              {data ? fmtDay(data.date) : "…"}
            </p>
            {todayWx && todayWx.precipProb >= 40 && (
              <Badge className="mt-3 gap-1.5" data-testid="umbrella-tip">
                <Umbrella className="size-3.5" /> {Math.round(todayWx.precipProb)}% chance of rain —
                take an umbrella
              </Badge>
            )}
          </div>
          <WeatherCard className="w-full max-w-sm" showHourly />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="font-heading">Today&apos;s schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <DayAgenda
              appointments={data?.appointments ?? []}
              onEdit={(a) => {
                setApptDraft({ ...a });
                setApptOpen(true);
              }}
            />
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-5">
          <RoutineCard
            loading={routines.isLoading}
            routine={routines.data?.find((r) => r.kind === "morning")}
          />
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Habit intentions</CardTitle>
            </CardHeader>
            <CardContent>
              <HabitList habits={habits.data} loading={habits.isLoading} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Reminders</CardTitle>
            </CardHeader>
            <CardContent>
              <ReminderList
                reminders={data?.reminders ?? []}
                loading={overview.isLoading}
                quickAddDate={data?.date}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Meals</CardTitle>
            </CardHeader>
            <CardContent>
              {data ? (
                <MealSlots date={data.date} meals={data.meals} />
              ) : (
                <div className="h-40 animate-pulse rounded-xl bg-muted" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AppointmentDialog open={apptOpen} onOpenChange={setApptOpen} initial={apptDraft} />
    </motion.div>
  );
}
