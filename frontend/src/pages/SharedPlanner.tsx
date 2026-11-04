// View-only snapshot of a friend's planner — only the parts they chose to share.
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Check, Eye, Lock, MapPin, Pencil, Plus } from "lucide-react";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";
import type { SharedPlanner, ShoppingItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { fmtShort } from "@/lib/dates";
import { Avatar } from "@/components/AccountButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function Section({ title, id, empty, children }: { title: string; id: string; empty: boolean; children: React.ReactNode }) {
  return (
    <Card data-testid={`shared-${id}`}>
      <CardHeader><CardTitle className="font-heading text-lg">{title}</CardTitle></CardHeader>
      <CardContent>{empty ? <p className="text-sm text-muted-foreground">Nothing here.</p> : children}</CardContent>
    </Card>
  );
}

export default function SharedPlannerPage() {
  const { ownerId = "" } = useParams();
  const q = useQuery({ queryKey: ["shared", ownerId], queryFn: () => apiGet<SharedPlanner>(`/sharing/planner/${ownerId}`), retry: false });
  const p = q.data;
  const qc = useQueryClient();
  const [item, setItem] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["shared", ownerId] });
  const fail = (e: unknown) => toast.error(e instanceof ApiError && e.status === 403 ? "This shopping list is view-only now" : "Couldn't update the list");
  const add = useMutation({
    mutationFn: (name: string) => apiPost<ShoppingItem>(`/sharing/planner/${ownerId}/shopping`, { name }),
    onSuccess: (i) => { setItem(""); refresh(); toast.success(`Added ${i.name}`); },
    onError: (e) => { refresh(); fail(e); },
  });
  const tick = useMutation({
    mutationFn: (v: { id: string; checked: boolean }) => apiPatch<ShoppingItem>(`/sharing/planner/${ownerId}/shopping/${v.id}`, { checked: v.checked }),
    onSuccess: refresh,
    onError: (e) => { refresh(); fail(e); },
  });

  if (q.error) {
    return (
      <div className="mx-auto max-w-xl space-y-3 py-10 text-center" data-testid="shared-error">
        <p className="font-heading text-xl font-bold">Can&apos;t open this planner</p>
        <p className="text-muted-foreground">{q.error instanceof ApiError && q.error.status === 404 ? "You don't have access — it may have been unshared." : "Try again in a moment."}</p>
        <Link to="/sharing" className="text-sm text-primary underline">Back to Sharing</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="shared-planner-page">
      <Link to="/sharing" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground" data-testid="shared-back">
        <ArrowLeft className="size-4" /> Sharing
      </Link>
      <header className="flex flex-wrap items-center gap-4">
        {p && <Avatar name={p.owner.name} picture={p.owner.picture} size={10} />}
        <div className="flex-1">
          <h1 className="font-heading text-3xl font-bold tracking-tight" data-testid="shared-owner-name">{p ? `${p.owner.name.split(" ")[0]}'s planner` : "…"}</h1>
          <p className="text-sm text-muted-foreground">{p?.owner.email}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium" data-testid="shared-view-only">
          <Eye className="size-3.5" /> {p?.shoppingEdit ? "View only · shopping editable" : "View only"}
        </span>
      </header>

      {p && p.categories.length === 0 && (
        <p className="rounded-2xl border p-6 text-center text-muted-foreground" data-testid="shared-nothing">{p.owner.name.split(" ")[0]} isn&apos;t sharing anything right now.</p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {p?.appointments && (
          <Section title="Appointments · next 2 weeks" id="appointments" empty={!p.appointments.length}>
            <ul className="space-y-2">
              {p.appointments.map((a) => (
                <li key={a.id} className={cn("flex gap-3 rounded-xl border px-3 py-2", a.private && "border-dashed bg-muted/40")} data-testid={`shared-appointment-${a.id}`}>
                  <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{a.date === p.today ? "Today" : fmtShort(a.date)}<br />{a.startTime}{a.endTime ? `–${a.endTime}` : ""}</span>
                  <span className="min-w-0"><span className={cn("flex items-center gap-1.5 font-medium", a.private && "text-muted-foreground")}>
                    {a.private && <Lock className="size-3.5" />}{a.title}</span>
                    {a.location && <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" /> {a.location}</span>}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {p?.reminders && (
          <Section title="Reminders · next 2 weeks" id="reminders" empty={!p.reminders.length}>
            <ul className="space-y-1.5">
              {p.reminders.map((r) => (
                <li key={r.id} className={cn("flex gap-3 text-sm", r.done && "text-muted-foreground line-through")}>
                  <span className="w-24 shrink-0 font-mono text-xs">{r.date === p.today ? "Today" : fmtShort(r.date)} {r.time}</span>{r.title}
                </li>
              ))}
            </ul>
          </Section>
        )}
        {p?.habits && (
          <Section title="Habits" id="habits" empty={!p.habits.length}>
            <ul className="space-y-1.5">
              {p.habits.map((h) => (
                <li key={h.id} className="flex items-center gap-2 text-sm">
                  <span className={cn("grid size-5 place-items-center rounded-full border", h.doneToday && "border-primary bg-primary text-primary-foreground")}>
                    {h.doneToday && <Check className="size-3" />}</span>
                  {h.emoji} {h.name}
                  <span className="ml-auto font-mono text-xs text-muted-foreground">{h.mode === "streak" ? `🔥 ${h.streak}` : `${h.monthCount}/${h.monthlyTarget}`}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {p?.routines && (
          <Section title="Routines · today" id="routines" empty={!p.routines.length}>
            <div className="space-y-3">
              {p.routines.map((r) => (
                <div key={r.kind}>
                  <p className="text-sm font-medium">{r.title} <span className="font-mono text-xs text-muted-foreground">{r.doneStepIds.length}/{r.steps.length} · 🔥 {r.streak}</span></p>
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {r.steps.map((st) => <li key={st.id} className={cn(r.doneStepIds.includes(st.id) && "text-muted-foreground line-through")}>· {st.text}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        )}
        {p?.meals && (
          <Section title="Meal plan · this week" id="meals" empty={!p.meals.length}>
            <ul className="space-y-1 text-sm">
              {p.meals.map((m) => <li key={m.id}><span className="inline-block w-28 font-mono text-xs text-muted-foreground">{fmtShort(m.date)} · {m.slot}</span> {m.title}</li>)}
            </ul>
          </Section>
        )}
        {p?.shopping && (
          <Card data-testid="shared-shopping">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="font-heading text-lg">Shopping list</CardTitle>
              {p.shoppingEdit && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary" data-testid="shared-shopping-editable">
                  <Pencil className="size-3" /> You can tick &amp; add
                </span>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {p.shoppingEdit && (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (item.trim()) add.mutate(item.trim()); }}>
                  <Input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Add an item…" data-testid="shared-shopping-input" />
                  <Button type="submit" size="sm" className="h-9" disabled={!item.trim() || add.isPending} data-testid="shared-shopping-add"><Plus className="size-4" /> Add</Button>
                </form>
              )}
              {!p.shopping.length ? <p className="text-sm text-muted-foreground">Nothing here.</p> : (
                <ul className="space-y-1.5 text-sm">
                  {p.shopping.map((i) => (
                    <li key={i.id} className="flex items-center gap-2.5" data-testid={`shared-shopping-item-${i.id}`}>
                      {p.shoppingEdit ? (
                        <Checkbox checked={i.checked} disabled={tick.isPending} aria-label={`Tick ${i.name}`}
                          onCheckedChange={(v) => tick.mutate({ id: i.id, checked: v === true })} data-testid={`shared-shopping-check-${i.id}`} />
                      ) : <span className="text-muted-foreground">·</span>}
                      <span className={cn("transition-colors duration-150", i.checked && "text-muted-foreground line-through")}>{i.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
