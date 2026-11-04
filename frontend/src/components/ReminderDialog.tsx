import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import type { Reminder } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ReminderDialog({
  open,
  onOpenChange,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("08:00");

  useEffect(() => {
    if (open) {
      setTitle("");
      setDate(defaultDate ?? "");
      setTime("08:00");
    }
  }, [open, defaultDate]);

  const save = useMutation({
    mutationFn: () => apiPost<Reminder>("/reminders", { title: title.trim(), date, time }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["range"] });
      toast.success("Reminder added");
      onOpenChange(false);
    },
    onError: () => toast.error("Could not save the reminder"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="reminder-dialog">
        <DialogHeader>
          <DialogTitle>New reminder</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rem-title">What to remember</Label>
            <Input
              id="rem-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Call the plumber…"
              data-testid="reminder-title-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="rem-date">Date</Label>
              <Input
                id="rem-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                data-testid="reminder-date-input"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rem-time">Time</Label>
              <Input
                id="rem-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                data-testid="reminder-time-input"
              />
            </div>
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            data-testid="reminder-save-button"
            disabled={!title.trim() || !date || !time || save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
