import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Flame, Plus } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import type { DayContext, HabitCreate, HabitStats, RangeBundle } from "@/lib/types";
import { useToggleHabit } from "@/components/HabitList";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const EMOJIS = ["🎯", "📚", "🏃", "🧘", "💧", "🏋️", "🥗", "😴", "✍️", "🎸", "🧹", "💻", "🎨", "☕"];

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

function HabitDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: HabitStats | null;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🎯");
  const [mode, setMode] = useState<"streak" | "monthly">("streak");
  const [target, setTarget] = useState(12);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setEmoji(initial?.emoji ?? "🎯");
      setMode(initial?.mode ?? "streak");
      setTarget(initial?.monthlyTarget ?? 12);
    }
  }, [open, initial]);

  const save = useMutation({
    mutationFn: () => {
      const payload: HabitCreate = { name: name.trim(), emoji, mode, monthlyTarget: target };
      return initial
        ? apiPut(`/habits/${initial.id}`, payload)
        : apiPost("/habits", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["habits"] });
      toast.success(initial ? "Habit updated" : "Habit created");
      onOpenChange(false);
    },
    onError: () => toast.error("Could not save the habit"),
  });

  const del = useMutation({
    mutationFn: () => apiDelete(`/habits/${initial!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["habits"] });
      qc.invalidateQueries({ queryKey: ["range"] });
      toast.success("Habit deleted");
      onOpenChange(false);
    },
    onError: () => toast.error("Could not delete the habit"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="habit-dialog">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit habit" : "New habit"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="habit-name">Name</Label>
            <Input
              id="habit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Read 20 pages…"
              data-testid="habit-name-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="habit-emoji">Icon</Label>
              <Select value={emoji} onValueChange={(v: string) => setEmoji(v)}>
                <SelectTrigger id="habit-emoji" data-testid="habit-emoji-select">
                  <SelectValue>{emoji}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {EMOJIS.map((e) => (
                    <SelectItem key={e} value={e} data-testid={`habit-emoji-${e}`}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="habit-mode">Tracking mode</Label>
              <Select value={mode} onValueChange={(v: string) => setMode(v as "streak" | "monthly")}>
                <SelectTrigger id="habit-mode" data-testid="habit-mode-select">
                  <SelectValue>{mode === "streak" ? "🔥 Streak" : "📅 Monthly"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="streak" data-testid="habit-mode-streak">
                    🔥 Streak — daily
                  </SelectItem>
                  <SelectItem value="monthly" data-testid="habit-mode-monthly">
                    📅 Monthly counter
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {mode === "monthly" && (
            <div className="grid gap-1.5">
              <Label htmlFor="habit-target">Monthly target</Label>
              <Input
                id="habit-target"
                type="number"
                min={1}
                max={99}
                value={target}
                onChange={(e) => setTarget(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                data-testid="habit-target-input"
              />
            </div>
          )}
        </div>
        <DialogFooter className="mt-2 gap-2 sm:justify-between">
          {initial ? (
            <Button
              variant="ghost"
              size="sm"
              data-testid="habit-delete-button"
              onClick={() => del.mutate()}
            >
              Delete
            </Button>
          ) : (
            <span />
          )}
          <Button
            data-testid="habit-save-button"
            disabled={!name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
