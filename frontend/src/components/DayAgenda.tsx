import { GoingLine } from "@/components/AppointmentJoin";
import { Lock, MapPin, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { useNoteCounts } from "@/components/BouquetNotes";
import { Button } from "@/components/ui/button";
import type { Appointment, WorkBlock } from "@/lib/types";
import { WorkBlockList } from "@/components/WorkRota";

export function DayAgenda({
  appointments,
  workBlocks = [],
  onEdit,
  onDelete,
  emptyLabel = "Nothing scheduled",
}: {
  appointments: Appointment[];
  workBlocks?: WorkBlock[];
  onEdit?: (a: Appointment) => void;
  onDelete?: (a: Appointment) => void;
  emptyLabel?: string;
}) {
  const counts = useNoteCounts();
  if (!appointments.length) {
    return workBlocks.length ? <WorkBlockList blocks={workBlocks} /> : (
      <p className="text-sm text-muted-foreground" data-testid="agenda-empty">
        {emptyLabel}
      </p>
    );
  }
  return (
    <>
    <WorkBlockList blocks={workBlocks} />
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
              {!!counts.data?.[a.id] && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-rose-500/15 px-1.5 text-[10px] font-medium text-rose-700 dark:text-rose-300"
                  title="Bouquet notes" data-testid={`appointment-notes-count-${a.id}`}>
                  <MessageCircle className="size-3" /> {counts.data[a.id]}
                </span>
              )}
            </div>
            {a.joinedFrom && (
              <div className="text-xs text-emerald-700 dark:text-emerald-300" data-testid={`appointment-joined-${a.id}`}>👥 With {a.joinedFrom.ownerName.split(" ")[0]}</div>
            )}
            {!a.joinedFrom && a.attendees.some((x) => x.status === "pending") && (
              <div className="text-xs font-medium text-amber-700 dark:text-amber-300" data-testid={`appointment-requests-${a.id}`}>
                🙋 {a.attendees.filter((x) => x.status === "pending").length} asking to join — tap edit to approve
              </div>
            )}
            {!a.joinedFrom && <GoingLine attendees={a.attendees} />}
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
    </>
  );
}
