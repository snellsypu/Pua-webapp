import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { apiDelete, apiPost, apiPut, ApiError } from "@/lib/api";
import type { Appointment } from "@/lib/types";
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
import { Textarea } from "@/components/ui/textarea";

export interface AppointmentDraft {
  id?: string;
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string | null;
  location?: string;
  notes?: string;
}

export function AppointmentDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: AppointmentDraft;
}) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({
    title: "",
    date: "",
    startTime: "09:00",
    endTime: "",
    location: "",
    notes: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        title: initial?.title ?? "",
        date: initial?.date ?? "",
        startTime: initial?.startTime ?? "09:00",
        endTime: initial?.endTime ?? "",
        location: initial?.location ?? "",
        notes: initial?.notes ?? "",
      });
    }
  }, [open, initial]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["overview"] });
    qc.invalidateQueries({ queryKey: ["range"] });
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        title: form.title.trim(),
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime || null,
        location: form.location.trim(),
        notes: form.notes.trim(),
      };
      return isEdit
        ? apiPut<Appointment>(`/appointments/${initial!.id}`, payload)
        : apiPost<Appointment>("/appointments", payload);
    },
    onSuccess: () => {
      invalidate();
      toast.success(isEdit ? "Appointment updated" : "Appointment added");
      onOpenChange(false);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError && e.status === 422
          ? "A title and a date are required"
          : "Could not save the appointment",
      ),
  });

  const del = useMutation({
    mutationFn: () => apiDelete(`/appointments/${initial!.id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Appointment deleted");
      onOpenChange(false);
    },
    onError: () => toast.error("Could not delete the appointment"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="appointment-dialog">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit appointment" : "New appointment"}</DialogTitle>
          <Description />
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="appt-title">Title</Label>
            <Input
              id="appt-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Dentist, standup, dinner…"
              data-testid="appointment-title-input"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="appt-date">Date</Label>
              <Input
                id="appt-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                data-testid="appointment-date-input"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="appt-start">Start</Label>
              <Input
                id="appt-start"
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                data-testid="appointment-start-input"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="appt-end">End</Label>
              <Input
                id="appt-end"
                type="time"
                value={form.endTime ?? ""}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                data-testid="appointment-end-input"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="appt-location">Location</Label>
            <Input
              id="appt-location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Where? (optional)"
              data-testid="appointment-location-input"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="appt-notes">Notes</Label>
            <Textarea
              id="appt-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Anything to remember (optional)"
              rows={2}
              data-testid="appointment-notes-input"
            />
          </div>
        </div>
        <DialogFooter className="mt-2 gap-2 sm:justify-between">
          {isEdit ? (
            <Button
              variant="ghost"
              size="sm"
              data-testid="appointment-delete-button"
              onClick={() => del.mutate()}
              disabled={del.isPending}
            >
              <Trash2 className="size-4 text-destructive" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              data-testid="appointment-save-button"
              disabled={!form.title.trim() || !form.date || save.isPending}
              onClick={() => save.mutate()}
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Description() {
  return (
    <DialogDescription>
      Appointments show up on the calendar, the day widget, and your morning briefing.
    </DialogDescription>
  );
}
