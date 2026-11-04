import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiDelete, apiPost, apiPut, ApiError } from "@/lib/api";
import type { HabitCreate, HabitStats } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMOJIS = ["🎯", "📚", "🏃", "🧘", "💧", "🏋️", "🥗", "😴", "✍️", "🎸", "🧹", "💻", "🎨", "☕"];

export function HabitDialog({
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
  const [tracksDistance, setTracksDistance] = useState(false);
  const [duo, setDuo] = useState("");

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setEmoji(initial?.emoji ?? "🎯");
      setMode(initial?.mode ?? "streak");
      setTarget(initial?.monthlyTarget ?? 12);
      setTracksDistance(initial?.tracksDistance ?? false);
      setDuo(initial?.duolingoUsername ?? "");
    }
  }, [open, initial]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: HabitCreate = {
        name: name.trim(),
        emoji,
        mode,
        monthlyTarget: target,
        tracksDistance,
      };
      const id = initial ? (await apiPut<{ id: string }>(`/habits/${initial.id}`, payload)).id
        : (await apiPost<{ id: string }>("/habits", payload)).id;
      if (duo.trim() === (initial?.duolingoUsername ?? "")) return null;
      try {
        await apiPut(`/habits/${id}`, { duolingoUsername: duo.trim() });
        return duo.trim() ? "linked" : null;
      } catch (e) {
        return e instanceof ApiError && e.status === 404 ? "No Duolingo profile with that username — saved without the link"
          : "Couldn't reach Duolingo — saved without the link, try again shortly";
      }
    },
    onSuccess: (duoResult) => {
      qc.invalidateQueries({ queryKey: ["habits"] });
      if (duoResult && duoResult !== "linked") toast.warning(duoResult);
      else toast.success(duoResult === "linked" ? "Saved — Duolingo linked 🦉" : initial ? "Habit updated" : "Habit created");
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
          <label className="flex items-start gap-2.5 rounded-xl border p-3" htmlFor="habit-distance">
            <Checkbox
              id="habit-distance"
              checked={tracksDistance}
              onCheckedChange={(c) => setTracksDistance(c === true)}
              data-testid="habit-distance-checkbox"
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">Track running distance</span>
              <span className="text-xs text-muted-foreground">
                Asks how far when you check it off, adds Samsung Health runs, and keeps weekly and
                monthly totals.
              </span>
            </span>
          </label>
          <div className="grid gap-1.5 rounded-xl border p-3" data-testid="habit-duolingo">
            <Label htmlFor="habit-duolingo" className="flex items-center gap-1.5">🦉 Link Duolingo (optional)</Label>
            <Input id="habit-duolingo" value={duo} onChange={(e) => setDuo(e.target.value)} placeholder="Your Duolingo username" maxLength={60}
              autoCapitalize="none" autoCorrect="off" data-testid="habit-duolingo-input" />
            <span className="text-xs text-muted-foreground">
              PUA checks your public Duolingo profile through the day and ticks this habit once you&apos;ve practised. Duolingo has no official link, so this may stop working if they change their site.
            </span>
          </div>
        </div>
        <DialogFooter className="mt-2 gap-2 sm:justify-between">
          {initial ? (
            <Button variant="ghost" size="sm" data-testid="habit-delete-button" onClick={() => del.mutate()}>
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
