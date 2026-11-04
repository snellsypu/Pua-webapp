import { useEffect, useState } from "react";
import { FlowerTick } from "@/components/Flower";
import { Lei } from "@/components/Lei";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Bell, BellOff, Flame, GripVertical, Moon, Pencil, Plus, Sunrise, X } from "lucide-react";
import { apiPost, apiPut } from "@/lib/api";
import type { RoutineState, RoutineUpdate } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { HandsFreeRoutine } from "@/components/HandsFreeRoutine";

export function RoutineCard({
  routine,
  loading,
  className,
}: {
  routine?: RoutineState;
  loading?: boolean;
  className?: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const toggle = useMutation({
    mutationFn: (stepId: string) =>
      apiPost<RoutineState>(`/routines/${routine!.kind}/steps/${stepId}/toggle`),
    onSuccess: (r) => {
      qc.setQueryData<RoutineState[]>(["routines"], (old) =>
        old?.map((x) => (x.kind === r.kind ? r : x)),
      );
      if (r.complete) toast.success(`${r.title} complete 🎉`);
    },
    onError: () => toast.error("Could not update the routine"),
  });

  if (loading || !routine) {
    return <div className={cn("h-48 animate-pulse rounded-2xl bg-muted", className)} />;
  }

  const Icon = routine.kind === "morning" ? Sunrise : Moon;
  const done = routine.doneStepIds.length;
  const total = routine.steps.length;
  const tint =
    routine.kind === "morning"
      ? "text-amber-600 dark:text-amber-300"
      : "text-violet-600 dark:text-violet-300";

  return (
    <Card className={className} data-testid={`routine-card-${routine.kind}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 font-heading">
              <Icon className={cn("size-4", tint)} /> {routine.title}
            </CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-mono" data-testid={`routine-time-${routine.kind}`}>
                {routine.time}
              </span>
              {routine.notify ? (
                <Bell className="size-3" aria-label="Notifications on" />
              ) : (
                <BellOff className="size-3" aria-label="Notifications off" />
              )}
              <Badge
                variant="secondary"
                className="gap-1 font-mono"
                data-testid={`routine-streak-${routine.kind}`}
              >
                <Flame className="size-3" /> {routine.streak} day{routine.streak === 1 ? "" : "s"}
                {routine.bestStreak > routine.streak ? ` · best ${routine.bestStreak}` : ""}
              </Badge>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Edit ${routine.title}`}
            data-testid={`routine-edit-${routine.kind}`}
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Lei streak={routine.streak} id={routine.kind}
          kinds={routine.kind === "morning" ? ["plumeria", "pink-plumeria", "ilima"] : ["hibiscus", "lehua", "pink-plumeria"]} />
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={false}
              animate={{ width: `${total ? (done / total) * 100 : 0}%` }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            />
          </div>
          <span className="font-mono text-xs text-muted-foreground" data-testid={`routine-progress-${routine.kind}`}>
            {done}/{total}
          </span>
        </div>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">No steps yet — tap edit to add some.</p>
        ) : (
          <ul className="space-y-1.5">
            {routine.steps.map((s) => {
              const checked = routine.doneStepIds.includes(s.id);
              return (
                <li key={s.id} className="flex items-center gap-2.5" data-testid={`routine-step-${s.id}`}>
                  <Checkbox
                    checked={checked}
                    disabled={toggle.isPending}
                    onCheckedChange={() => toggle.mutate(s.id)}
                    aria-label={`${checked ? "Untick" : "Tick"} ${s.text}`}
                    data-testid={`routine-step-check-${s.id}`}
                  />
                  <span
                    className={cn(
                      "text-sm transition-[color,opacity] duration-200",
                      checked && "text-muted-foreground line-through opacity-60",
                    )}
                  >
                    {s.text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {routine.complete ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-primary" data-testid={`routine-complete-${routine.kind}`}>
            <FlowerTick kind="hibiscus" className="size-5" /> All done for today
          </p>
        ) : (
          total > 0 && <HandsFreeRoutine kind={routine.kind as "morning" | "bedtime"} />
        )}
      </CardContent>
      <RoutineEditDialog routine={routine} open={editing} onOpenChange={setEditing} />
    </Card>
  );
}

function RoutineEditDialog({
  routine,
  open,
  onOpenChange,
}: {
  routine: RoutineState;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [time, setTime] = useState(routine.time);
  const [steps, setSteps] = useState<{ id?: string; text: string }[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open) {
      setTime(routine.time);
      setSteps(routine.steps.map((s) => ({ id: s.id, text: s.text })));
      setDraft("");
    }
  }, [open, routine]);

  const save = useMutation({
    mutationFn: () => {
      const body: RoutineUpdate = {
        time,
        // Existing steps keep their id so today's ticks survive the edit.
        steps: steps.filter((s) => s.text.trim()).map((s) => ({ ...s, text: s.text.trim() })),
      };
      return apiPut<RoutineState>(`/routines/${routine.kind}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routines"] });
      toast.success(`${routine.title} saved`);
      onOpenChange(false);
    },
    onError: () => toast.error("Could not save the routine"),
  });

  const addDraft = () => {
    if (!draft.trim()) return;
    setSteps((s) => [...s, { text: draft.trim() }]);
    setDraft("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={`routine-dialog-${routine.kind}`}>
        <DialogHeader>
          <DialogTitle>Edit {routine.title.toLowerCase()}</DialogTitle>
          <DialogDescription>
            The checklist resets every day. Turn on notifications in Settings to get a reminder at
            this time.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`routine-time-${routine.kind}`}>Reminder time</Label>
            <Input
              id={`routine-time-${routine.kind}`}
              type="time"
              className="w-36"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              data-testid="routine-time-input"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Steps</Label>
            <ul className="space-y-1.5">
              {steps.map((s, i) => (
                <li key={s.id ?? `new-${i}`} className="flex items-center gap-1.5">
                  <GripVertical className="size-4 shrink-0 text-muted-foreground/50" />
                  <Input
                    value={s.text}
                    onChange={(e) =>
                      setSteps((all) => all.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
                    }
                    className="h-8"
                    data-testid={`routine-step-input-${i}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${s.text}`}
                    data-testid={`routine-step-remove-${i}`}
                    onClick={() => setSteps((all) => all.filter((_, j) => j !== i))}
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex gap-1.5">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addDraft()}
                placeholder="Add a step…"
                className="h-8"
                data-testid="routine-step-new-input"
              />
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label="Add step"
                data-testid="routine-step-add-button"
                disabled={!draft.trim()}
                onClick={addDraft}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            data-testid="routine-save-button"
            disabled={!time || save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
