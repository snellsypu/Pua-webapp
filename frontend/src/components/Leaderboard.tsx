// Bouquet leaderboard: everyone in a bouquet ranked by their longest lei this month.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Leaderboard } from "@/lib/types";
import { Avatar } from "@/components/AccountButton";
import { Flower, FLOWER_KINDS } from "@/components/Flower";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MEDAL = ["🥇", "🥈", "🥉"];

function Board({ bouquetId }: { bouquetId: string }) {
  const q = useQuery({ queryKey: ["leaderboard", bouquetId], queryFn: () => apiGet<Leaderboard>(`/sharing/bouquets/${bouquetId}/leaderboard`) });
  const d = q.data;
  if (!d) return <p className="py-6 text-center text-sm text-muted-foreground">Gathering the flowers…</p>;
  const month = new Date(`${d.month}-01T12:00:00`).toLocaleDateString(undefined, { month: "long" });
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-heading"><Trophy className="size-5 text-amber-500" /> {d.bouquetName} · {month}</DialogTitle>
        <DialogDescription>Longest lei this month — days in a row with a finished routine.</DialogDescription>
      </DialogHeader>
      <ol className="space-y-2" data-testid={`leaderboard-${bouquetId}`}>
        {d.entries.map((e) => (
          <li key={e.user_id} className={cn("flex items-center gap-3 rounded-2xl border px-3 py-2", e.me && "border-primary/50 bg-primary/5")}
            data-testid={`leaderboard-entry-${e.user_id}`}>
            <span className="w-7 text-center font-heading text-lg font-bold">{MEDAL[e.rank - 1] ?? e.rank}</span>
            <Avatar name={e.name} picture={e.picture} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{e.me ? "You" : e.name}{e.isOwner && <span className="ml-1.5 text-[10px] text-muted-foreground">admin</span>}</span>
              <span className="mt-1 flex h-4 items-center gap-0.5" aria-hidden="true">
                {Array.from({ length: Math.min(e.longestLei, 14) }, (_, i) => <Flower key={i} kind={FLOWER_KINDS[i % FLOWER_KINDS.length]} className="size-3.5" />)}
                {e.longestLei > 14 && <span className="text-[10px] text-muted-foreground">+{e.longestLei - 14}</span>}
                {e.longestLei === 0 && <span className="text-[10px] text-muted-foreground">no lei yet</span>}
              </span>
            </span>
            <span className="text-right">
              <span className="block font-heading text-xl font-bold tabular-nums" data-testid={`leaderboard-lei-${e.user_id}`}>{e.longestLei}</span>
              <span className="block text-[10px] text-muted-foreground">{e.daysFinished} day{e.daysFinished === 1 ? "" : "s"} done</span>
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

export function LeaderboardButton({ bouquetId, label, testid }: { bouquetId: string; label?: string; testid: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={label ? "xs" : "icon-sm"} variant="outline" aria-label="Leaderboard" title="Leaderboard" onClick={() => setOpen(true)} data-testid={testid}>
        <Trophy className="size-3.5 text-amber-500" />{label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" data-testid={`${testid}-dialog`}>
          {open && <Board bouquetId={bouquetId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
