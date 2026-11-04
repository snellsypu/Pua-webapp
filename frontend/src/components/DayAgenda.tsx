import { Lock, MapPin, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Appointment } from "@/lib/types";

export function DayAgenda({
  appointments,
  onEdit,
  onDelete,
  emptyLabel = "Nothing scheduled",
}: {
  appointments: Appointment[];
  onEdit?: (a: Appointment) => void;
  onDelete?: (a: Appointment) => void;
  emptyLabel?: string;
}) {
  if (!appointments.length) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="agenda-empty">
        {emptyLabel}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {appointments.map((a) => (
        <li
          key={a.id}
          data-testid={`appointment-item-${a.id}`}
          className="flex items-center gap-3 rounded-xl border bg-card p-3"
        >
          <div className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
            {a.startTime}
            {a.endTime ? `–${a.endTime}` : ""}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 truncate text-sm font-medium">
              {a.private && <Lock className="size-3 shrink-0 text-muted-foreground" aria-label="Private" data-testid={`appointment-private-${a.id}`} />}
              <span className="truncate">{a.title}</span>
            </div>
            {a.location && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{a.location}</span>
              </div>
            )}
          </div>
          {onEdit && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Edit ${a.title}`}
              data-testid={`appointment-edit-${a.id}`}
              onClick={() => onEdit(a)}
            >
              <Pencil className="size-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Delete ${a.title}`}
              data-testid={`appointment-delete-${a.id}`}
              onClick={() => onDelete(a)}
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
