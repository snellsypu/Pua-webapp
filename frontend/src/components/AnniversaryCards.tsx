// Anniversary heads-ups (today / tomorrow / in a week) for Today + the morning briefing,
// and the Settings checklist of holiday sets grouped by religion.
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarHeart } from "lucide-react";
import { apiGet, apiPut } from "@/lib/api";
import type { HolidaySetState, UpcomingEvent } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

const when = (d: number) => (d === 0 ? "Today" : d === 1 ? "Tomorrow" : "In 1 week");

export function AnniversaryHeadsUp({ className }: { className?: string }) {
  const q = useQuery({ queryKey: ["anniversaries", "heads-up"], queryFn: () => apiGet<UpcomingEvent[]>("/anniversaries/heads-up") });
  if (!q.data?.length) return null;
  return (
    <Card size="sm" className={className} data-testid="anniversary-heads-up">
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 font-heading text-base"><CalendarHeart className="size-4 text-pink-500" /> Coming up</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-wrap gap-2">
          {q.data.map((e) => (
            <li key={e.id} className="flex items-center gap-2 rounded-full bg-pink-500/10 px-3 py-1 text-sm" data-testid={`heads-up-${e.id}`}>
              <span>{e.emoji}</span>
              <span className="font-medium">{e.kind === "birthday" ? `${e.title}'s birthday` : e.title}</span>
              <span className="text-xs text-muted-foreground">{when(e.daysUntil)}</span>
            </li>
          ))}
          <li><Link to="/anniversaries" className="text-xs text-primary underline" data-testid="heads-up-all">All anniversaries</Link></li>
        </ul>
      </CardContent>
    </Card>
  );
}

export function HolidaySetsCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["holiday-sets"], queryFn: () => apiGet<HolidaySetState[]>("/anniversaries/holiday-sets") });
  const save = useMutation({
    mutationFn: (sets: string[]) => apiPut<HolidaySetState[]>("/anniversaries/holiday-sets", { sets }),
    onSuccess: (s) => { qc.setQueryData(["holiday-sets"], s); qc.invalidateQueries({ queryKey: ["anniversaries"] }); toast.success("Holidays updated"); },
    onError: () => toast.error("Couldn't update holidays"),
  });
  const sets = q.data ?? [];
  const groups = [...new Set(sets.map((s) => s.group))];
  const toggle = (id: string, on: boolean) => save.mutate(sets.filter((s) => (s.id === id ? on : s.enabled)).map((s) => s.id));
  return (
    <Card id="holidays" data-testid="holiday-sets-card">
      <CardHeader>
        <CardTitle className="font-heading">Holidays in Anniversaries</CardTitle>
        <CardDescription>Pick which holidays get countdowns and a heads-up in your morning briefing. Lunar dates can differ by a day locally.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        {groups.map((g) => (
          <div key={g} className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g === "Religious" ? "By religion" : g}</p>
            {sets.filter((s) => s.group === g).map((s) => (
              <label key={s.id} htmlFor={`holiday-set-${s.id}`} className="flex items-center gap-2.5 text-sm">
                <Checkbox id={`holiday-set-${s.id}`} checked={s.enabled} disabled={save.isPending} onCheckedChange={(v) => toggle(s.id, v === true)} data-testid={`holiday-set-${s.id}`} />
                {s.label}
              </label>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
