// Premium paywall — Stripe Checkout (test mode until the Stripe sandbox is claimed).
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Briefcase, CreditCard, Loader2, Lock, Mic, Route, Sparkles, Users } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { CheckoutIn, CheckoutOut, PremiumPlan, PremiumState } from "@/lib/types";
import { Flower, FlowerTick } from "@/components/Flower";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const usePremium = () => useQuery({ queryKey: ["premium"], queryFn: () => apiGet<PremiumState>("/premium") });

const PaywallCtx = createContext<(reason?: string) => void>(() => {});
/** open the paywall from anywhere: const openPaywall = usePaywall(); openPaywall("More bouquets") */
export const usePaywall = () => useContext(PaywallCtx);

export const PERKS = [
  { icon: Mic, text: "AI voice — say it any way you like, works on iPhone" },
  { icon: Users, text: "Unlimited bouquets, with more than 6 people in each" },
  { icon: Route, text: "Travel mode per appointment & live-location commutes" },
  { icon: Sparkles, text: "AI ingredient ideas for every meal you plan" },
  { icon: Briefcase, text: "As many jobs on your work rota as you need" },
];

/** "Save 16%" — yearly vs 12 × monthly, from the live prices. */
export function yearlySaving(prices: PremiumState["prices"] | undefined): number {
  const m = prices?.find((p) => p.plan === "monthly")?.amount;
  const y = prices?.find((p) => p.plan === "yearly")?.amount;
  return m && y ? Math.round((1 - y / (m * 12)) * 100) : 0;
}

/** Settings → Premium tab: what you get, prices, and buy / manage. */
export function PremiumFeaturesCard() {
  const qc = useQueryClient();
  const premium = usePremium();
  const openPaywall = usePaywall();
  const p = premium.data;
  const cancel = useMutation({
    mutationFn: () => apiPost<PremiumState>("/premium/cancel"),
    onSuccess: (st) => { qc.setQueryData(["premium"], st); qc.invalidateQueries({ queryKey: ["sharing"] }); qc.invalidateQueries({ queryKey: ["settings"] }); toast.success("Premium cancelled — bouquets past your first one are paused"); },
    onError: () => toast.error("Could not cancel Premium"),
  });
  const saving = yearlySaving(p?.prices);
  return (
    <div className="relative overflow-hidden rounded-3xl border border-amber-400/50 bg-gradient-to-br from-amber-300/20 via-pink-400/10 to-emerald-500/10 p-6 shadow-sm" data-testid="premium-features-card">
      <Flower kind="hibiscus" className="pua-bloom absolute -right-6 -top-6 size-28 opacity-30" />
      <div className="relative space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-300">PUA Premium</p>
          <h2 className="font-heading text-2xl font-bold" data-testid="premium-status-title">{p?.active ? "You're Premium 🌺" : "Unlock everything PUA can do"}</h2>
          {p?.active && (
            <p className="text-sm text-muted-foreground" data-testid="premium-status-detail">
              {p.plan === "yearly" ? "Yearly" : "Monthly"} plan{p.renewsOn ? ` · renews ${p.renewsOn}` : ""}
            </p>
          )}
        </div>
        <ul className="grid gap-2 text-sm sm:grid-cols-2" data-testid="premium-perks">
          {PERKS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-2 rounded-xl bg-background/60 p-2.5 backdrop-blur"><Icon className="mt-0.5 size-4 shrink-0 text-primary" /> {text}</li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2" data-testid="premium-prices">
          {(p?.prices ?? []).map((x) => (
            <div key={x.plan} className="relative rounded-2xl border bg-background/70 p-3" data-testid={`premium-price-${x.plan}`}>
              {x.plan === "yearly" && saving > 0 && <span className="absolute -top-2 right-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-amber-950">Save {saving}%</span>}
              <span className="block text-xs capitalize text-muted-foreground">{x.plan}</span>
              <span className="block font-heading text-lg font-bold">{x.label}</span>
            </div>
          ))}
        </div>
        {p?.active ? (
          <Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate()} data-testid="premium-cancel-button">Cancel Premium</Button>
        ) : (
          <Button size="lg" className="w-full sm:w-auto" onClick={() => openPaywall()} disabled={!p} data-testid="premium-buy-button">
            <CreditCard className="size-4" /> Get Premium
          </Button>
        )}
        <p className="text-[11px] text-muted-foreground">Secure payments by Stripe · cancel any time here.</p>
      </div>
    </div>
  );
}

function PaywallDialog({ open, onOpenChange, reason }: { open: boolean; onOpenChange: (o: boolean) => void; reason?: string }) {
  const qc = useQueryClient();
  const premium = usePremium();
  const [plan, setPlan] = useState<PremiumPlan>("yearly");
  const buy = useMutation({
    mutationFn: (body: CheckoutIn) => apiPost<CheckoutOut>("/premium/checkout", body),
    onSuccess: (r) => { window.location.href = r.checkout_url; },
    onError: () => toast.error("Checkout didn't go through — try again"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md" data-testid="paywall-dialog">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Flower kind="hibiscus" className="pua-bloom size-10" />
            <div>
              <DialogTitle className="font-heading text-xl">PUA Premium</DialogTitle>
              <DialogDescription>{reason ? `${reason} is a Premium feature.` : "Unlock everything PUA can do."}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <ul className="space-y-1.5 text-sm">
          {PERKS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2"><Icon className="size-4 text-primary" /> {text}</li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Plan">
          {(premium.data?.prices ?? []).map((p) => (
            <button key={p.plan} type="button" role="radio" aria-checked={plan === p.plan} onClick={() => setPlan(p.plan)}
              data-testid={`paywall-plan-${p.plan}`}
              className={cn("relative rounded-2xl border p-3 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.98]",
                plan === p.plan ? "border-primary bg-primary/10" : "hover:bg-accent")}>
              {p.plan === "yearly" && yearlySaving(premium.data?.prices) > 0 && <span className="absolute -top-2 right-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-amber-950">Save {yearlySaving(premium.data?.prices)}%</span>}
              <span className="block text-xs capitalize text-muted-foreground">{p.plan}</span>
              <span className="block font-heading text-lg font-bold">{p.label}</span>
              {plan === p.plan && <FlowerTick kind="plumeria" className="absolute bottom-2 right-2 size-5" />}
            </button>
          ))}
        </div>
        {premium.data?.testMode && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-400/10 p-2.5 text-xs" data-testid="paywall-test-note">
            <Lock className="mt-0.5 size-3.5 shrink-0" /> Stripe test mode — use card 4242 4242 4242 4242, any future date and any CVC. No real money moves yet.
          </p>
        )}
        <Button size="lg" disabled={buy.isPending || !premium.data} onClick={() => buy.mutate({ plan, origin_url: window.location.origin })} data-testid="paywall-subscribe">
          {buy.isPending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
          Continue to secure checkout · {premium.data?.prices.find((p) => p.plan === plan)?.label ?? ""}
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">Payments by Stripe · cancel any time in Settings</p>
      </DialogContent>
    </Dialog>
  );
}

export function PaywallProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; reason?: string }>({ open: false });
  const open = useCallback((reason?: string) => setState({ open: true, reason }), []);
  return (
    <PaywallCtx.Provider value={open}>
      {children}
      <PaywallDialog open={state.open} reason={state.reason} onOpenChange={(o) => setState((s) => ({ ...s, open: o }))} />
    </PaywallCtx.Provider>
  );
}
