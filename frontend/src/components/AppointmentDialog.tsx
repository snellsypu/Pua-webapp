import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, MapPin, Search, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from "@/lib/api";
import type { AppSettings, Appointment, GeoPlace, TravelMode } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** "Reading, Station Hill, Reading, England, RG1 1LZ, UK" → "Reading, Station Hill, Reading" */
export const shortName = (display: string) => display.split(",").map((p) => p.trim()).slice(0, 3).join(", ");

export const TRAVEL_LABELS: Record<TravelMode, string> = {
  car: "Driving", foot: "Walking", bike: "Cycling", transit: "Public transport",
};
/** Modes offered right now — public transport only once a Google Maps key is connected. */
export const travelModes = (transit: boolean) =>
  (Object.keys(TRAVEL_LABELS) as TravelMode[]).filter((m) => m !== "transit" || transit);
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
  travelMode?: TravelMode | null;
  locationLat?: number | null;
  locationLon?: number | null;
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
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const premium = settings.data?.premiumVoice ?? false;
  const [travel, setTravel] = useState<TravelMode | "default">("default");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [places, setPlaces] = useState<GeoPlace[] | null>(null);
  const find = useMutation({
    mutationFn: (q: string) => apiGet<GeoPlace[]>(`/address/search?q=${encodeURIComponent(q)}`),
    onSuccess: setPlaces,
    onError: () => toast.error("Address search is busy — try again shortly"),
  });
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
      setTravel(initial?.travelMode ?? "default");
      setCoords(initial?.locationLat != null && initial?.locationLon != null ? { lat: initial.locationLat, lon: initial.locationLon } : null);
      setPlaces(null);
    }
  }, [open, initial]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["overview"] });
    qc.invalidateQueries({ queryKey: ["range"] });
    qc.invalidateQueries({ queryKey: ["commute-next"] });
    qc.invalidateQueries({ queryKey: ["run-plan"] });
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
        locationLat: form.location.trim() && coords ? coords.lat : null,
        locationLon: form.location.trim() && coords ? coords.lon : null,
        // Premium only; without Premium the field is left untouched.
        ...(premium ? { travelMode: travel === "default" ? null : travel } : {}),
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
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="appt-location"
                  value={form.location}
                  onChange={(e) => {
                    setForm({ ...form, location: e.target.value });
                    setCoords(null); // typed text no longer matches the picked place
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && form.location.trim().length >= 3) {
                      e.preventDefault();
                      find.mutate(form.location.trim());
                    }
                  }}
                  placeholder="Where? (optional)"
                  className={coords ? "pr-8" : undefined}
                  data-testid="appointment-location-input"
                />
                {coords && (
                  <MapPin className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-primary" aria-label="On the map" data-testid="appointment-location-pinned" />
                )}
              </div>
              <Button type="button" variant="outline" size="sm" className="h-9"
                disabled={form.location.trim().length < 3 || find.isPending}
                onClick={() => find.mutate(form.location.trim())} data-testid="appointment-location-find">
                {find.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Find
              </Button>
            </div>
            {places && (
              <ul className="max-h-44 space-y-0.5 overflow-y-auto rounded-xl border p-1" data-testid="appointment-location-results">
                {places.length === 0 && (
                  <li className="px-2 py-1.5 text-xs text-muted-foreground">No matches — add the street or town, or keep it as text.</li>
                )}
                {places.map((p, i) => (
                  <li key={`${p.latitude},${p.longitude}`}>
                    <button type="button" data-testid={`appointment-location-result-${i}`}
                      className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-accent"
                      onClick={() => {
                        setForm({ ...form, location: shortName(p.name) });
                        setCoords({ lat: p.latitude, lon: p.longitude });
                        setPlaces(null);
                      }}>
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <span>
                        <span className="block font-medium">{shortName(p.name)}</span>
                        <span className="block text-xs text-muted-foreground">{p.name}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground" data-testid="appointment-location-hint">
              {coords ? (
                <><Check className="size-3 text-primary" /> On the map — travel times will use this exact place</>
              ) : (
                <>Tap Find to pick the real place so PUA can work out travel time · © OpenStreetMap</>
              )}
            </p>
          </div>
          {premium && (
            <div className="grid gap-1.5">
              <Label htmlFor="appt-travel">Getting there</Label>
              <Select value={travel} onValueChange={(v) => setTravel(v as TravelMode | "default")}>
                <SelectTrigger id="appt-travel" className="w-56" data-testid="appointment-travel-select">
                  <SelectValue>
                    {travel === "default" ? `Default (${TRAVEL_LABELS[settings.data?.travelMode ?? "car"]})` : TRAVEL_LABELS[travel]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default" data-testid="appointment-travel-default">
                    Default ({TRAVEL_LABELS[settings.data?.travelMode ?? "car"]})
                  </SelectItem>
                  {travelModes(!!settings.data?.transitAvailable).map((m) => (
                    <SelectItem key={m} value={m} data-testid={`appointment-travel-${m}`}>{TRAVEL_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
