// First sign-in: start with a sample planner (demo data to explore) or a clear one.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Loader2, Sparkles, Sprout } from "lucide-react";
import { apiPost } from "@/lib/api";
import type { AuthUser } from "@/lib/types";
import { useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";

export default function Onboarding() {
  const qc = useQueryClient();
  const me = useMe();
  const start = useMutation({
    mutationFn: (sample: boolean) => apiPost<AuthUser>("/auth/onboard", { sample }),
    onSuccess: (u, sample) => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      qc.setQueryData(["me"], u);
      toast.success(sample ? "Sample planner ready — explore and edit anything" : "Your clear planner is ready");
    },
    onError: () => toast.error("Couldn't set up your planner — try again"),
  });

  const options = [
    { sample: true, icon: Sparkles, title: "Sample planner", tone: "amber",
      text: "A few appointments, habits, routines, meals and a shopping list so you can see how PUA works. Edit or delete anything." },
    { sample: false, icon: Sprout, title: "Clear planner", tone: "primary",
      text: "Start empty and add your own appointments, habits and routines from day one." },
  ] as const;

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-10">
      <div className="pointer-events-none absolute -right-32 -top-32 size-[26rem] rounded-full bg-amber-400/20 blur-3xl" />
      <motion.main initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-2xl" data-testid="onboarding-page">
        <p className="text-sm text-muted-foreground">Welcome{me.data ? `, ${me.data.name.split(" ")[0]}` : ""} 👋</p>
        <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight">How would you like to start?</h1>
        <p className="mt-2 text-muted-foreground">This is your own private planner — only you see it unless you share it with a friend code.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {options.map(({ sample, icon: Icon, title, text, tone }) => (
            <button key={title} type="button" disabled={start.isPending} onClick={() => start.mutate(sample)}
              data-testid={sample ? "onboarding-sample-button" : "onboarding-clear-button"}
              className={cn(
                "group rounded-3xl border bg-card p-6 text-left shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60",
                tone === "amber" ? "hover:border-amber-500/50" : "hover:border-primary/50",
              )}>
              <span className={cn("grid size-11 place-items-center rounded-2xl",
                tone === "amber" ? "bg-amber-400/20 text-amber-700 dark:text-amber-300" : "bg-primary/15 text-primary")}>
                {start.isPending && start.variables === sample ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
              </span>
              <h2 className="mt-4 font-heading text-xl font-bold">{title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </button>
          ))}
        </div>
      </motion.main>
    </div>
  );
}
