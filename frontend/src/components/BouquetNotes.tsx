// Bouquet notes on shared appointments ("I'll bring the poke"). Each note lives in one
// bouquet — only that bouquet and the planner owner see it.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { apiDelete, apiGet, apiPost, ApiError } from "@/lib/api";
import type { AppointmentNote, BouquetRef, MyAppointmentNotes, NoteIn } from "@/lib/types";
import { Flower, flowerFor } from "@/components/Flower";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const errText = (e: unknown) =>
  e instanceof ApiError && e.body && typeof e.body === "object" && "detail" in e.body
    ? String((e.body as { detail: unknown }).detail) : "Couldn't save the note";

const timeAgo = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
};

/** Note list + composer. `post` sends one note; `remove` deletes one. */
function Thread({ id, notes, bouquets, post, onChanged }: {
  id: string; notes: AppointmentNote[]; bouquets: BouquetRef[];
  post: (body: NoteIn) => Promise<AppointmentNote>; onChanged: () => void;
}) {
  const [text, setText] = useState("");
  const [bouquetId, setBouquetId] = useState(bouquets[0]?.id ?? "");
  const chosen = bouquets.some((b) => b.id === bouquetId) ? bouquetId : bouquets[0]?.id ?? "";
  const add = useMutation({
    mutationFn: () => post({ text: text.trim(), bouquetId: chosen }),
    onSuccess: () => { setText(""); onChanged(); },
    onError: (e) => toast.error(errText(e)),
  });
  const del = useMutation({
    mutationFn: (noteId: string) => apiDelete(`/sharing/notes/${noteId}`),
    onSuccess: onChanged,
    onError: () => toast.error("Couldn't delete the note"),
  });

  return (
    <div className="space-y-2" data-testid={`notes-${id}`}>
      {notes.length > 0 && (
        <ul className="space-y-1.5">
          {notes.map((n) => (
            <li key={n.id} className={cn("group flex items-start gap-2 rounded-xl px-2.5 py-1.5 text-sm", n.mine ? "bg-primary/10" : "bg-muted/60")}
              data-testid={`note-${n.id}`}>
              <Flower kind={flowerFor(n.bouquetId)} className="mt-0.5 size-4 shrink-0" title={n.bouquetName} />
              <span className="min-w-0 flex-1">
                <span className="text-xs font-medium">{n.mine ? "You" : n.authorName.split(" ")[0]}</span>
                <span className="ml-1.5 text-[10px] text-muted-foreground">{n.bouquetName} · {timeAgo(n.createdAt)}</span>
                <span className="block break-words">{n.text}</span>
              </span>
              {n.canDelete && (
                <button type="button" aria-label="Delete note" onClick={() => del.mutate(n.id)} disabled={del.isPending}
                  className="rounded p-0.5 text-muted-foreground opacity-60 transition-opacity duration-150 hover:opacity-100" data-testid={`note-delete-${n.id}`}>
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {bouquets.length > 0 && (
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (text.trim() && chosen) add.mutate(); }}>
          {bouquets.length > 1 && (
            <Select value={chosen} onValueChange={(v) => setBouquetId(String(v))}>
              <SelectTrigger className="h-8 w-28 shrink-0 text-xs" data-testid={`notes-${id}-bouquet`} aria-label="Bouquet">
                <SelectValue>{bouquets.find((b) => b.id === chosen)?.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {bouquets.map((b) => <SelectItem key={b.id} value={b.id} data-testid={`notes-${id}-bouquet-${b.id}`}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={280} className="h-8 text-sm"
            placeholder={`Note to ${bouquets.length === 1 ? bouquets[0].name : "the bouquet"}…`} data-testid={`notes-${id}-input`} />
          <Button type="submit" size="icon-sm" disabled={!text.trim() || add.isPending} aria-label="Send note" data-testid={`notes-${id}-send`}>
            {add.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          </Button>
        </form>
      )}
    </div>
  );
}

/** Friend view: notes on one of the owner's appointments (data comes with the snapshot). */
export function SharedAppointmentNotes({ ownerId, appointmentId, notes, bouquets }: {
  ownerId: string; appointmentId: string; notes: AppointmentNote[]; bouquets: BouquetRef[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(notes.length > 0);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-testid={`notes-${appointmentId}-open`}
        className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground">
        <MessageCircle className="size-3.5" /> Add a note
      </button>
    );
  }
  return (
    <div className="mt-2">
      <Thread id={appointmentId} notes={notes} bouquets={bouquets}
        post={(body) => apiPost<AppointmentNote>(`/sharing/planner/${ownerId}/appointments/${appointmentId}/notes`, body)}
        onChanged={() => qc.invalidateQueries({ queryKey: ["shared", ownerId] })} />
    </div>
  );
}

/** Owner view inside the appointment dialog: every bouquet's notes + reply. */
export function OwnerAppointmentNotes({ appointmentId }: { appointmentId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["my-notes", appointmentId],
    queryFn: () => apiGet<MyAppointmentNotes>(`/sharing/my-notes/${appointmentId}`),
  });
  const d = q.data;
  if (!d || d.private || (!d.notes.length && !d.bouquets.length)) return null;
  return (
    <div className="grid gap-1.5 rounded-xl border border-dashed p-2.5" data-testid="owner-notes">
      <span className="flex items-center gap-1.5 text-sm font-medium"><MessageCircle className="size-4" /> Bouquet notes</span>
      <Thread id={appointmentId} notes={d.notes} bouquets={d.bouquets}
        post={(body) => apiPost<AppointmentNote>(`/sharing/my-notes/${appointmentId}`, body)}
        onChanged={() => {
          qc.invalidateQueries({ queryKey: ["my-notes", appointmentId] });
          qc.invalidateQueries({ queryKey: ["note-counts"] });
        }} />
    </div>
  );
}

export const useNoteCounts = () =>
  useQuery({ queryKey: ["note-counts"], queryFn: () => apiGet<Record<string, number>>("/sharing/note-counts"), staleTime: 30_000 });
