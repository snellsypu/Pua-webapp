// Bouquet leaderboard: everyone in a bouquet ranked by their longest lei this month.
import { useEffect, useState } from "react";
import { Orchid } from "@/components/Jungle";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
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
const PETALS = Array.from({ length: 26 }, (_, i) => ({ left: (i * 41) % 100, delay: (i % 9) * 0.11, size: 22 + ((i * 17) % 22), spin: i % 2 ? 200 : -200 }));

/** A shower of pink orchids — shown whenever you open a leaderboard you lead. */
function OrchidShower({ name }: { name: string }) {
  const [show, setShow] = useState(true);
  useEffect(() => { const t = window.setTimeout(() => setShow(false), 3800); return () => window.clearTimeout(t); }, []);
  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          data-testid="orchid-shower">
          {PETALS.map((p, i) => (
            <motion.span key={i} className="absolute top-0" style={{ left: `${p.left}%` }}
              initial={{ y: -70, rotate: 0, opacity: 0 }} animate={{ y: "105vh", rotate: p.spin, opacity: [0, 1, 1, 0.8] }}
              transition={{ duration: 3.3, delay: p.delay, ease: "easeIn" }}>
              <Orchid className="drop-shadow" />
            </motion.span>
          ))}
          <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16 }}
            className="absolute left-1/2 top-[18%] -translate-x-1/2 rounded-full bg-pink-500 px-5 py-2 font-heading text-lg font-bold text-white shadow-xl"
            data-testid="orchid-shower-title">🌸 You&apos;re top of {name}!</motion.p>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Board({ bouquetId }: { bouquetId: string }) {
  const q = useQuery({ queryKey: ["leaderboard", bouquetId], queryFn: () => apiGet<Leaderboard>(`/sharing/bouquets/${bouquetId}/leaderboard`) });
  const d = q.data;
  if (!d) return <p className="py-6 text-center text-sm text-muted-foreground">Gathering the flowers…</p>;
  const leading = d.entries.find((e) => e.me && e.rank === 1 && e.longestLei > 0);
  const month = new Date(`${d.month}-01T12:00:00`).toLocaleDateString(undefined, { month: "long" });
  return (
    <>
      {leading && <OrchidShower name={d.bouquetName} />}
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
