// View-only snapshot of a friend's planner — only the parts they chose to share.
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Eye, MapPin } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api";
import type { SharedPlanner } from "@/lib/types";
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
          <Eye className="size-3.5" /> View only
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
                <li key={a.id} className="flex gap-3 rounded-xl border px-3 py-2">
                  <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{a.date === p.today ? "Today" : fmtShort(a.date)}<br />{a.startTime}{a.endTime ? `–${a.endTime}` : ""}</span>
                  <span className="min-w-0"><span className="block font-medium">{a.title}</span>
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
          <Section title="Shopping list" id="shopping" empty={!p.shopping.length}>
            <ul className="space-y-1 text-sm">
              {p.shopping.map((i) => <li key={i.id} className={cn(i.checked && "text-muted-foreground line-through")}>· {i.name}</li>)}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
