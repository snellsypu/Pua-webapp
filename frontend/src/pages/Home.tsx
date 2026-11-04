import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowRight,
  LayoutGrid,
  Maximize2,
  MoonStar,
  Plus,
  Sunrise,
} from "lucide-react";
import { apiDelete, apiGet, apiPatch } from "@/lib/api";
import type {
  Appointment,
  DayContext,
  HabitStats,
  ShoppingItem,
} from "@/lib/types";
import { useWeather } from "@/lib/useWeather";
import { fmtDay } from "@/lib/dates";
import { weatherCodeInfo } from "@/lib/weatherCodes";
import { WeatherCard } from "@/components/WeatherCard";
import { DayAgenda } from "@/components/DayAgenda";
import { HabitList } from "@/components/HabitList";
import { ReminderList } from "@/components/ReminderList";
import { MealSlots } from "@/components/MealSlots";
import { AppointmentDialog, type AppointmentDraft } from "@/components/AppointmentDialog";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export default function Home() {
  const overview = useQuery({
    queryKey: ["overview", 0],
    queryFn: () => apiGet<DayContext>("/overview?offset=0"),
  });
  const habits = useQuery({ queryKey: ["habits"], queryFn: () => apiGet<HabitStats[]>("/habits") });
  const shopping = useQuery({
    queryKey: ["shopping"],
    queryFn: () => apiGet<ShoppingItem[]>("/shopping"),
  });
  const weather = useWeather();
  const qc = useQueryClient();
  const [widget, setWidget] = useState(() => localStorage.getItem("dailyloop:widget") === "1");
  const [apptOpen, setApptOpen] = useState(false);
  const [apptDraft, setApptDraft] = useState<AppointmentDraft | undefined>();

  const data = overview.data;
  const appointments = data?.appointments ?? [];
  const habitsData = habits.data;
  const doneCount = habitsData?.filter((h) => h.doneToday).length ?? 0;
  const habitCount = habitsData?.length ?? 0;
  const unchecked = (shopping.data ?? []).filter((i) => !i.checked);
  const today = data?.date;

  const nextAppt = useMemo(() => {
    const hhmm = `${String(new Date().getHours()).padStart(2, "0")}:${String(
      new Date().getMinutes(),
    ).padStart(2, "0")}`;
    return appointments.find((a) => a.startTime > hhmm) ?? appointments[0];
  }, [appointments]);

  const delAppt = useMutation({
    mutationFn: (id: string) => apiDelete(`/appointments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["range"] });
      toast.success("Appointment deleted");
    },
    onError: () => toast.error("Could not delete the appointment"),
  });
  const toggleShopping = useMutation({
    mutationFn: (i: ShoppingItem) => apiPatch<ShoppingItem>(`/shopping/${i.id}`, { checked: !i.checked }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping"] }),
    onError: () => toast.error("Could not update the shopping list"),
  });

  const toggleWidget = () => {
    const next = !widget;
    setWidget(next);
    localStorage.setItem("dailyloop:widget", next ? "1" : "0");
  };

  const greeting =
    new Date().getHours() < 12
      ? "Good morning"
      : new Date().getHours() < 18
        ? "Good afternoon"
        : "Good evening";

  if (widget) {
    const code = weather.bundle ? weatherCodeInfo(weather.bundle.now.code) : null;
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}>
        <Card className="mx-auto max-w-md rounded-3xl" data-testid="day-widget">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  My day
                </p>
                <p className="font-heading text-2xl font-bold tracking-tight" data-testid="widget-date">
                  {data ? fmtDay(data.date) : "…"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                data-testid="widget-mode-toggle"
                aria-label="Expand to full dashboard"
                onClick={toggleWidget}
              >
                <Maximize2 className="size-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-muted/70 p-3">
              <span className="text-3xl">{code?.emoji ?? "…"}</span>
              <div>
                <div className="font-mono text-lg font-semibold" data-testid="widget-weather">
                  {weather.bundle ? `${Math.round(weather.bundle.now.temperature)}° · ${code?.label}` : "Weather loading…"}
                </div>
                <div className="text-xs text-muted-foreground">{weather.locationLabel ?? "Set a home city in Settings"}</div>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Up next</p>
              {nextAppt ? (
                <p className="mt-0.5 text-sm font-medium" data-testid="widget-next">
                  <span className="font-mono text-muted-foreground">{nextAppt.startTime}</span>{" "}
                  {nextAppt.title}
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-muted-foreground">Nothing scheduled</p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="uppercase tracking-wide text-muted-foreground">Habits</span>
                <span className="font-mono" data-testid="widget-habits">
                  {doneCount}/{habitCount}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${habitCount ? (doneCount / habitCount) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Link to="/morning" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1")} data-testid="widget-morning-link">
                <Sunrise className="size-4" /> Morning
              </Link>
              <Link to="/evening" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1")} data-testid="widget-evening-link">
                <MoonStar className="size-4" /> Evening
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">{greeting}</h1>
          <p className="text-sm text-muted-foreground" data-testid="home-date">
            {data ? fmtDay(data.date) : "…"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" data-testid="widget-mode-toggle" onClick={toggleWidget}>
            <LayoutGrid className="size-4" /> Widget view
          </Button>
          <Button
            size="sm"
            data-testid="home-add-appointment-button"
            onClick={() => {
              setApptDraft({ date: today });
              setApptOpen(true);
            }}
          >
            <Plus className="size-4" /> Appointment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <div className="md:col-span-5">
          <WeatherCard showTomorrow />
        </div>
        <Card className="md:col-span-7" size="sm">
          <CardHeader>
            <CardDescription>Up next</CardDescription>
            <CardTitle className="font-heading" data-testid="home-up-next">
              {overview.isLoading
                ? "…"
                : nextAppt
                  ? `${nextAppt.startTime} — ${nextAppt.title}`
                  : "Nothing scheduled today"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link to="/morning" className={buttonVariants({ variant: "outline", size: "sm" })} data-testid="home-morning-link">
              <Sunrise className="size-4 text-amber-600" /> Morning briefing
            </Link>
            <Link to="/evening" className={buttonVariants({ variant: "outline", size: "sm" })} data-testid="home-evening-link">
              <MoonStar className="size-4 text-violet-600" /> Evening review
            </Link>
          </CardContent>
        </Card>

        <Card className="md:col-span-6">
          <CardHeader>
            <CardTitle className="font-heading">Today&apos;s agenda</CardTitle>
          </CardHeader>
          <CardContent>
            <DayAgenda
              appointments={appointments}
              onEdit={(a) => {
                setApptDraft({ ...a });
                setApptOpen(true);
              }}
              onDelete={(a) => delAppt.mutate(a.id)}
            />
          </CardContent>
        </Card>

        <Card className="md:col-span-6">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="font-heading">Habits</CardTitle>
            <Link
              to="/habits"
              className="flex items-center text-xs text-muted-foreground hover:text-foreground"
              data-testid="home-habits-link"
            >
              Manage <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <HabitList habits={habitsData} loading={habits.isLoading} />
          </CardContent>
        </Card>

        <Card className="md:col-span-4">
          <CardHeader>
            <CardTitle className="font-heading">Meals</CardTitle>
          </CardHeader>
          <CardContent>
            {today ? (
              <MealSlots date={today} meals={data?.meals ?? []} />
            ) : (
              <div className="h-40 animate-pulse rounded-xl bg-muted" />
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-4">
          <CardHeader>
            <CardTitle className="font-heading">Reminders</CardTitle>
          </CardHeader>
          <CardContent>
            <ReminderList reminders={data?.reminders ?? []} loading={overview.isLoading} quickAddDate={today} />
          </CardContent>
        </Card>

        <Card className="md:col-span-4">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="font-heading">Shopping list</CardTitle>
            <Link
              to="/planner"
              className="flex items-center text-xs text-muted-foreground hover:text-foreground"
              data-testid="home-planner-link"
            >
              Open planner <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {shopping.isLoading ? (
              <div className="h-24 animate-pulse rounded-xl bg-muted" />
            ) : unchecked.length ? (
              <ul className="space-y-1.5" data-testid="shopping-peek">
                {unchecked.slice(0, 5).map((i) => (
                  <li key={i.id} className="flex items-center gap-2.5" data-testid={`shopping-item-${i.id}`}>
                    <Checkbox
                      checked={i.checked}
                      onCheckedChange={() => toggleShopping.mutate(i)}
                      aria-label={`Mark ${i.name} as bought`}
                      data-testid={`shopping-check-${i.id}`}
                    />
                    <span className="text-sm">{i.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="shopping-peek-empty">
                All bought — nice.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <AppointmentDialog open={apptOpen} onOpenChange={setApptOpen} initial={apptDraft} />
    </motion.div>
  );
}
