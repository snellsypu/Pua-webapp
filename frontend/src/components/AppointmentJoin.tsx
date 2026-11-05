// Joining a bouquet friend's appointment (open → straight in; otherwise a request the owner
// approves). Joining copies it into your calendar; the owner manages guests in their dialog.
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Clock, Hand, UserPlus, X } from "lucide-react";
import { apiDelete, apiPost } from "@/lib/api";
import { useMe } from "@/lib/auth";
import type { Appointment, Attendee } from "@/lib/types";
import { Button } from "@/components/ui/button";

const first = (n: string) => n.split(" ")[0];

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ["friends-calendar", "shared", "overview", "range", "commute-next"]) qc.invalidateQueries({ queryKey: [k] });
}

/** "Going: Bob, Cara" line for anyone viewing the appointment. */
export function GoingLine({ attendees, className }: { attendees: Attendee[]; className?: string }) {
  const going = attendees.filter((a) => a.status === "going");
  if (!going.length) return null;
  return (
    <span className={className ?? "block text-xs text-emerald-700 dark:text-emerald-300"} data-testid="appointment-going-line">
      👥 Going: {going.map((a) => first(a.name)).join(", ")}
    </span>
  );
}

/** Join / Ask to join / Requested / Leave — for a friend's (non-private) appointment. */
export function FriendJoinButton({ ownerId, appt }: { ownerId: string; appt: Appointment }) {
  const qc = useQueryClient();
  const me = useMe();
  const [attendees, setAttendees] = useState(appt.attendees);
  useEffect(() => setAttendees(appt.attendees), [appt.attendees]);
  const mine = attendees.find((a) => a.user_id === me.data?.user_id);
  const path = `/sharing/planner/${ownerId}/appointments/${appt.id}/join`;
  const join = useMutation({
    mutationFn: () => apiPost<Appointment>(path),
    onSuccess: (a) => {
      setAttendees(a.attendees);
      invalidateAll(qc);
      const status = a.attendees.find((x) => x.user_id === me.data?.user_id)?.status;
      toast.success(status === "going" ? `You're going — "${a.title}" is in your calendar` : "Request sent — you'll be added once it's approved");
    },
    onError: () => toast.error("Couldn't join that appointment"),
  });
  const leave = useMutation({
    mutationFn: () => apiDelete<Appointment>(path),
    onSuccess: (a) => {
      setAttendees(a.attendees);
      invalidateAll(qc);
      toast.success(mine?.status === "pending" ? "Request withdrawn" : "You've left — removed from your calendar");
    },
    onError: () => toast.error("Couldn't update that appointment"),
  });
  if (appt.private || appt.joinedFrom) return null;
  const busy = join.isPending || leave.isPending;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      {!mine ? (
        <Button size="xs" variant={appt.openToJoin ? "default" : "outline"} disabled={busy} onClick={() => join.mutate()} data-testid={`appointment-join-${appt.id}`}>
          {appt.openToJoin ? <UserPlus className="size-3" /> : <Hand className="size-3" />} {appt.openToJoin ? "Join" : "Ask to join"}
        </Button>
      ) : (
        <>
          <span className={mine.status === "going" ? "flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-200" : "flex items-center gap-1 rounded-full bg-amber-400/25 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:text-amber-200"}
            data-testid={`appointment-join-status-${appt.id}`}>
            {mine.status === "going" ? <><Check className="size-3" /> Going</> : <><Clock className="size-3" /> Requested</>}
          </span>
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => leave.mutate()} data-testid={`appointment-leave-${appt.id}`}>
            {mine.status === "going" ? "Leave" : "Cancel request"}
          </Button>
        </>
      )}
      <GoingLine attendees={attendees} className="text-[11px] text-muted-foreground" />
    </span>
  );
}

/** Owner side, inside the appointment dialog: approve / decline requests, remove guests. */
export function AttendeeManager({ appointmentId, initial }: { appointmentId: string; initial: Attendee[] }) {
  const qc = useQueryClient();
  const [list, setList] = useState(initial);
  useEffect(() => setList(initial), [initial]);
  const approve = useMutation({
    mutationFn: (uid: string) => apiPost<Appointment>(`/appointments/${appointmentId}/attendees/${uid}/approve`),
    onSuccess: (a) => { setList(a.attendees); invalidateAll(qc); toast.success("Approved — it's in their calendar now"); },
    onError: () => toast.error("Couldn't approve"),
  });
  const remove = useMutation({
    mutationFn: (uid: string) => apiDelete<Appointment>(`/appointments/${appointmentId}/attendees/${uid}`),
    onSuccess: (a) => { setList(a.attendees); invalidateAll(qc); toast.success("Removed"); },
    onError: () => toast.error("Couldn't remove"),
  });
  if (!list.length) return null;
  return (
    <div className="grid gap-1.5 rounded-xl border p-3" data-testid="appointment-attendees">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Guests</p>
      <ul className="grid gap-1">
        {list.map((a) => (
          <li key={a.user_id} className="flex items-center gap-2 text-sm" data-testid={`appointment-attendee-${a.user_id}`}>
            <span className="min-w-0 flex-1 truncate">{a.name}</span>
            {a.status === "pending" ? (
              <>
                <span className="text-xs text-amber-700 dark:text-amber-300">wants to join</span>
                <Button size="xs" disabled={approve.isPending} onClick={() => approve.mutate(a.user_id)} data-testid={`appointment-attendee-approve-${a.user_id}`}>
                  <Check className="size-3" /> Approve
                </Button>
                <Button size="icon-xs" variant="ghost" aria-label={`Decline ${a.name}`} disabled={remove.isPending} onClick={() => remove.mutate(a.user_id)} data-testid={`appointment-attendee-decline-${a.user_id}`}>
                  <X className="size-3.5" />
                </Button>
              </>
            ) : (
              <>
                <span className="text-xs text-emerald-700 dark:text-emerald-300">going</span>
                <Button size="icon-xs" variant="ghost" aria-label={`Remove ${a.name}`} disabled={remove.isPending} onClick={() => remove.mutate(a.user_id)} data-testid={`appointment-attendee-remove-${a.user_id}`}>
                  <X className="size-3.5" />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
