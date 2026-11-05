// Stats: leis completed, how long you've been using PUA and lifetime totals.
import { useQuery } from "@tanstack/react-query";
import { ShareStatsButton } from "@/components/ShareStatsCard";
import { useMe } from "@/lib/auth";
import { motion } from "motion/react";
import { apiGet } from "@/lib/api";
import type { Stats } from "@/lib/types";
import { WorkHoursCard } from "@/components/WorkRota";
import { fmtShort } from "@/lib/dates";
import { Flower, FLOWER_KINDS } from "@/components/Flower";
import { Lei } from "@/components/Lei";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const KINDS = { morning: ["plumeria", "pink-plumeria", "ilima"], bedtime: ["hibiscus", "lehua", "pink-plumeria"] } as const;

function Tile({ id, label, value, sub }: { id: string; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4" data-testid={`stat-${id}`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-3xl font-bold tabular-nums" data-testid={`stat-${id}-value`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function StatsPage() {
  const q = useQuery({ queryKey: ["stats"], queryFn: () => apiGet<Stats>("/stats") });
  const s = q.data;
  const me = useMe();
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6" data-testid="stats-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Your stats</h1>
          <p className="text-muted-foreground" data-testid="stats-member-since">
            {s ? `Using PUA for ${s.daysUsing} day${s.daysUsing === 1 ? "" : "s"} · since ${fmtShort(s.memberSince)}` : "…"}
          </p>
        </div>
        {s && <ShareStatsButton stats={s} name={me.data?.name.split(" ")[0] ?? "My"} />}
      </header>

      <Card className="overflow-hidden" data-testid="stats-leis-card">
        <CardContent className="flex flex-wrap items-center gap-6 p-6">
          <div className="relative grid size-32 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-100 to-rose-100 dark:from-amber-500/15 dark:to-rose-500/15">
            {FLOWER_KINDS.map((k, i) => (
              <span key={k} className="absolute" style={{ transform: `rotate(${i * 72}deg) translateY(-52px) rotate(${-i * 72}deg)` }}>
                <Flower kind={k} className="size-7" />
              </span>
            ))}
            <span className="font-heading text-4xl font-extrabold tabular-nums" data-testid="stats-leis-total">{s?.leisTotal ?? "–"}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-2xl font-bold">Leis completed</p>
            <p className="text-sm text-muted-foreground">A lei is 7 days in a row of finishing a routine. Every round you finish counts, even after a break.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {s?.routines.map((r) => (
          <Card key={r.kind} data-testid={`stats-routine-${r.kind}`}>
            <CardHeader className="pb-1"><CardTitle className="font-heading">{r.title}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Lei streak={r.streak} id={`stats-${r.kind}`} kinds={[...KINDS[r.kind]]} />
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="font-heading text-xl font-bold" data-testid={`stats-${r.kind}-leis`}>{r.leis}</p><p className="text-[11px] text-muted-foreground">leis</p></div>
                <div><p className="font-heading text-xl font-bold">{r.completeDays}</p><p className="text-[11px] text-muted-foreground">days finished</p></div>
                <div><p className="font-heading text-xl font-bold">{r.bestStreak}</p><p className="text-[11px] text-muted-foreground">best streak</p></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <WorkHoursCard />

      {s && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile id="active-days" label="Active days" value={s.activeDays} sub="days you ticked something off" />
          <Tile id="checkoffs" label="Habit check-offs" value={s.habitCheckOffs} sub={`${s.habits} habit${s.habits === 1 ? "" : "s"}`} />
          <Tile id="best-habit" label="Best habit streak" value={s.bestHabitStreak} sub="days in a row" />
          <Tile id="appointments" label="Appointments" value={s.appointments} />
          <Tile id="reminders" label="Reminders done" value={s.remindersDone} />
          <Tile id="bouquets" label="Bouquets" value={s.bouquets} />
          <Tile id="notes" label="Bouquet notes" value={s.notesWritten} sub="that you wrote" />
          <Tile id="days-using" label="Days with PUA" value={s.daysUsing} />
        </div>
      )}
    </motion.div>
  );
}
