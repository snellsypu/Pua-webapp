// First sign-in: a sample planner (demo data), ready-made starter packs, or a clear planner.
import { useState } from "react";
import { FlowerTick, flowerFor } from "@/components/Flower";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Loader2, Package, Sparkles, Sprout } from "lucide-react";
import { apiPost } from "@/lib/api";
import type { AuthUser, OnboardIn, StarterPack } from "@/lib/types";
import { useMe } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Labels for the packs defined in backend/lib/packs.py
const STARTER_PACKS: { id: StarterPack; emoji: string; title: string; items: string; group: "Habits" | "Routines" }[] = [
  { id: "fitness", emoji: "🏃", title: "Fitness", items: "Morning run (tracks km) · Gym 12×/month · 10k steps", group: "Habits" },
  { id: "mindful", emoji: "🧘", title: "Mindful", items: "Meditate · Read 20 pages · Journal", group: "Habits" },
  { id: "home", emoji: "💧", title: "Healthy home", items: "Drink 8 glasses of water · Cook at home 16×/month · Tidy 10 min", group: "Habits" },
  { id: "morning", emoji: "🌅", title: "Morning routine", items: "Make the bed · Water · Stretch · Check today's plan", group: "Routines" },
  { id: "bedtime", emoji: "🌙", title: "Bedtime routine", items: "Lay out clothes · Screens off · Brush teeth · Read", group: "Routines" },
];

type Choice = "sample" | "packs" | "clear";

export default function Onboarding() {
  const qc = useQueryClient();
  const me = useMe();
  const [picking, setPicking] = useState(false);
  const [packs, setPacks] = useState<Set<StarterPack>>(new Set(["mindful", "morning", "bedtime"]));
  const start = useMutation({
    mutationFn: (v: { choice: Choice; body: OnboardIn }) => apiPost<AuthUser>("/auth/onboard", v.body),
    onSuccess: (u, v) => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      qc.setQueryData(["me"], u);
      toast.success(
        v.choice === "sample" ? "Sample planner ready — explore and edit anything"
          : v.choice === "packs" ? "Your starter packs are in — make them your own"
          : "Your clear planner is ready",
      );
    },
    onError: () => toast.error("Couldn't set up your planner — try again"),
  });
  const busy = (c: Choice) => start.isPending && start.variables?.choice === c;
  const togglePack = (id: StarterPack) =>
    setPacks((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const cardCls = "group rounded-3xl border bg-card p-6 text-left shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60";

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-10">
      <div className="pointer-events-none absolute -right-32 -top-32 size-[26rem] rounded-full bg-amber-400/20 blur-3xl" />
      <motion.main initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-3xl" data-testid="onboarding-page">
        <p className="text-sm text-muted-foreground">Welcome{me.data ? `, ${me.data.name.split(" ")[0]}` : ""} 👋</p>
        <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight">How would you like to start?</h1>
        <p className="mt-2 text-muted-foreground">This is your own private planner — only you see it unless you share it with a friend code.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <button type="button" disabled={start.isPending} onClick={() => start.mutate({ choice: "sample", body: { sample: true } })}
            data-testid="onboarding-sample-button" className={cn(cardCls, "hover:border-amber-500/50")}>
            <span className="grid size-11 place-items-center rounded-2xl bg-amber-400/20 text-amber-700 dark:text-amber-300">
              {busy("sample") ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
            </span>
            <h2 className="mt-4 font-heading text-xl font-bold">Sample planner</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">Appointments, habits, routines, meals and a shopping list to see how PUA works. Edit or delete anything.</p>
          </button>
          <button type="button" disabled={start.isPending} onClick={() => setPicking(true)} aria-expanded={picking}
            data-testid="onboarding-packs-button" className={cn(cardCls, "hover:border-sky-500/50", picking && "border-sky-500/60 ring-2 ring-sky-500/20")}>
            <span className="grid size-11 place-items-center rounded-2xl bg-sky-500/15 text-sky-700 dark:text-sky-300"><Package className="size-5" /></span>
            <h2 className="mt-4 font-heading text-xl font-bold">Starter packs</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">Pick ready-made habit and routine packs — no sample appointments or meals.</p>
          </button>
          <button type="button" disabled={start.isPending} onClick={() => start.mutate({ choice: "clear", body: { sample: false } })}
            data-testid="onboarding-clear-button" className={cn(cardCls, "hover:border-primary/50")}>
            <span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary">
              {busy("clear") ? <Loader2 className="size-5 animate-spin" /> : <Sprout className="size-5" />}
            </span>
            <h2 className="mt-4 font-heading text-xl font-bold">Clear planner</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">Start empty and add your own appointments, habits and routines from day one.</p>
          </button>
        </div>

        <AnimatePresence>
          {picking && (
            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
              className="mt-5 rounded-3xl border bg-card/80 p-5 shadow-sm backdrop-blur" data-testid="onboarding-packs-panel">
              {(["Habits", "Routines"] as const).map((group) => (
                <div key={group} className="mb-4">
                  <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{group}</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {STARTER_PACKS.filter((p) => p.group === group).map((p) => {
                      const on = packs.has(p.id);
                      return (
                        <button key={p.id} type="button" onClick={() => togglePack(p.id)} aria-pressed={on} data-testid={`onboarding-pack-${p.id}`}
                          className={cn("relative rounded-2xl border p-3 text-left transition-[background-color,border-color,transform] duration-150 active:scale-[0.98]",
                            on ? "border-sky-500/60 bg-sky-500/10" : "hover:bg-accent")}>
                          <span className={cn("absolute right-2.5 top-2.5 grid size-5 place-items-center rounded-full border transition-colors duration-150",
                            on && "border-transparent")}>{on && <FlowerTick kind={flowerFor(p.id)} className="size-6" />}</span>
                          <span className="block text-sm font-semibold">{p.emoji} {p.title}</span>
                          <span className="mt-1 block pr-4 text-xs leading-relaxed text-muted-foreground">{p.items}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground" data-testid="onboarding-packs-count">
                  {packs.size ? `${packs.size} pack${packs.size > 1 ? "s" : ""} picked` : "Pick at least one pack"}
                </p>
                <Button disabled={!packs.size || start.isPending} data-testid="onboarding-packs-start"
                  onClick={() => start.mutate({ choice: "packs", body: { sample: false, packs: [...packs] } })}>
                  {busy("packs") && <Loader2 className="size-4 animate-spin" />} Start with these packs
                </Button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </motion.main>
    </div>
  );
}
