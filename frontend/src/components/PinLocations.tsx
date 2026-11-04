// Settings → Commute times: one-tap map pins for upcoming appointments whose location
// is only text. Lookups run on an explicit tap (Nominatim policy), ~1 place per second.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MapPin, MapPinned } from "lucide-react";
import { apiGet, apiPut } from "@/lib/api";
import type { Appointment, LocationSuggestion } from "@/lib/types";
import { fmtShort } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { AppointmentDialog, type AppointmentDraft } from "@/components/AppointmentDialog";

export function PinLocations() {
  const qc = useQueryClient();
  const [items, setItems] = useState<LocationSuggestion[] | null>(null);
  const [editing, setEditing] = useState<AppointmentDraft | undefined>();

  const find = useMutation({
    mutationFn: () => apiGet<LocationSuggestion[]>("/commute/unpinned"),
    onSuccess: setItems,
    onError: () => toast.error("Couldn't look up places right now — try again shortly"),
  });

  const pin = useMutation({
    mutationFn: (s: LocationSuggestion) =>
      apiPut<Appointment>(`/appointments/${s.appointmentId}`, { locationLat: s.matchLat, locationLon: s.matchLon }),
    onSuccess: (_a, s) => {
      setItems((all) => all?.filter((x) => x.appointmentId !== s.appointmentId) ?? null);
      for (const k of ["overview", "range", "commute-next"]) qc.invalidateQueries({ queryKey: [k] });
      toast.success(`Pinned ${s.title}`);
    },
    onError: () => toast.error("Could not pin that appointment"),
  });

  const skip = (id: string) => setItems((all) => all?.filter((x) => x.appointmentId !== id) ?? null);

  return (
    <div className="space-y-2 rounded-xl border p-3" data-testid="pin-locations">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">Pin appointment places</span>
          <span className="text-xs text-muted-foreground">
            Upcoming appointments with a typed location — confirm the map match so they get travel times.
          </span>
        </span>
        <Button size="sm" variant="outline" disabled={find.isPending} onClick={() => find.mutate()} data-testid="pin-locations-find">
          {find.isPending ? <Loader2 className="size-4 animate-spin" /> : <MapPinned className="size-4" />}
          {find.isPending ? "Looking up…" : items ? "Look again" : "Find matches"}
        </Button>
      </div>
      {items && items.length === 0 && (
        <p className="text-xs text-muted-foreground" data-testid="pin-locations-empty">All upcoming appointment places are pinned. 🎉</p>
      )}
      {items && items.length > 0 && (
        <ul className="divide-y" data-testid="pin-locations-list">
          {items.map((s) => (
            <li key={s.appointmentId} className="flex flex-wrap items-start gap-2 py-2" data-testid={`pin-item-${s.appointmentId}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {s.title} <span className="font-normal text-muted-foreground">· {fmtShort(s.date)} {s.startTime}</span>
                </p>
                <p className="text-xs text-muted-foreground">“{s.location}”</p>
                {s.matchName ? (
                  <p className="mt-0.5 flex items-start gap-1 text-xs" data-testid={`pin-match-${s.appointmentId}`}>
                    <MapPin className="mt-0.5 size-3 shrink-0 text-primary" /> {s.matchName}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300" data-testid={`pin-nomatch-${s.appointmentId}`}>
                    No match near home — edit it and use Find with a street or town.
                  </p>
                )}
              </div>
              <div className="flex gap-1.5">
                {s.matchName ? (
                  <Button size="xs" disabled={pin.isPending} onClick={() => pin.mutate(s)} data-testid={`pin-confirm-${s.appointmentId}`}>
                    Pin
                  </Button>
                ) : (
                  <Button size="xs" variant="outline" data-testid={`pin-edit-${s.appointmentId}`}
                    onClick={async () => {
                      const all = await apiGet<Appointment[]>(`/appointments?from=${s.date}&to=${s.date}`);
                      const a = all.find((x) => x.id === s.appointmentId);
                      if (a) setEditing({ ...a });
                    }}>
                    Edit
                  </Button>
                )}
                <Button size="xs" variant="ghost" onClick={() => skip(s.appointmentId)} data-testid={`pin-skip-${s.appointmentId}`}>
                  {s.matchName ? "Not this" : "Skip"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <AppointmentDialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) {
            if (editing?.id) skip(editing.id);
            setEditing(undefined);
          }
        }}
        initial={editing}
      />
    </div>
  );
}
