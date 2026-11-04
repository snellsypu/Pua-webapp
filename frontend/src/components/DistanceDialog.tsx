import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { AppSettings, HabitStats } from "@/lib/types";
import { fromKm, toKm } from "@/lib/units";
import { Button } from "@/components/ui/button";
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

// Asked when checking off a distance-tracking (running) habit. Distance is
// optional: "Just mark done" still counts the day, without kilometres.
export function DistanceDialog({
  habit,
  onClose,
  onSubmit,
  pending,
}: {
  habit: HabitStats | null;
  onClose: () => void;
  onSubmit: (distanceKm: number | null) => void;
  pending?: boolean;
}) {
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const unit = settings.data?.distanceUnit ?? "km";
  const [value, setValue] = useState("");
  useEffect(() => {
    if (habit) setValue(habit.todayKm ? fromKm(habit.todayKm, unit).toFixed(1) : "");
  }, [habit, unit]);

  const num = Number(value.replace(",", "."));
  const valid = value.trim() !== "" && Number.isFinite(num) && num > 0 && num <= 300;

  return (
    <Dialog open={!!habit} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="distance-dialog" className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {habit?.emoji} {habit?.name}
          </DialogTitle>
          <DialogDescription>How far did you go today?</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="distance-input">Distance ({unit})</Label>
          <Input
            id="distance-input"
            inputMode="decimal"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && valid && onSubmit(Math.round(toKm(num, unit) * 100) / 100)}
            placeholder={unit === "km" ? "5.0" : "3.1"}
            className="font-mono text-lg"
            data-testid="distance-input"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" data-testid="distance-skip-button" disabled={pending} onClick={() => onSubmit(null)}>
            Just mark done
          </Button>
          <Button
            size="sm"
            data-testid="distance-save-button"
            disabled={!valid || pending}
            onClick={() => onSubmit(Math.round(toKm(num, unit) * 100) / 100)}
          >
            Save run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
