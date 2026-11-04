// Premium paywall — MOCKED checkout: the card form is a placeholder and nothing is charged.
// Swap the POST /premium/checkout call for Stripe Checkout later.
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard, Loader2, Lock, Mic, Route, Sparkles, Users } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { CheckoutIn, PremiumPlan, PremiumState } from "@/lib/types";
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

const PERKS = [
  { icon: Mic, text: "AI voice — say it any way you like, works on iPhone" },
  { icon: Users, text: "More than 2 bouquets to share with" },
  { icon: Route, text: "Travel mode per appointment & live-location commutes" },
];

function PaywallDialog({ open, onOpenChange, reason }: { open: boolean; onOpenChange: (o: boolean) => void; reason?: string }) {
  const qc = useQueryClient();
  const premium = usePremium();
  const [plan, setPlan] = useState<PremiumPlan>("yearly");
  const [card, setCard] = useState({ name: "", number: "", exp: "", cvc: "" });
  const digits = card.number.replace(/\D/g, "");
  const valid = card.name.trim() && digits.length >= 12 && /^\d{2}\s*\/\s*\d{2}$/.test(card.exp) && /^\d{3,4}$/.test(card.cvc);
  const buy = useMutation({
    mutationFn: (body: CheckoutIn) => apiPost<PremiumState>("/premium/checkout", body),
    onSuccess: (s) => {
      qc.setQueryData(["premium"], s);
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["sharing"] });
      toast.success("Welcome to PUA Premium 🌺");
      setCard({ name: "", number: "", exp: "", cvc: "" });
      onOpenChange(false);
    },
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
              {p.plan === "yearly" && <span className="absolute -top-2 right-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-amber-950">Save 30%</span>}
              <span className="block text-xs capitalize text-muted-foreground">{p.plan}</span>
              <span className="block font-heading text-lg font-bold">{p.label}</span>
              {plan === p.plan && <FlowerTick kind="plumeria" className="absolute bottom-2 right-2 size-5" />}
            </button>
          ))}
        </div>
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-400/10 p-2.5 text-xs" data-testid="paywall-demo-note">
          <Lock className="mt-0.5 size-3.5 shrink-0" /> Demo checkout — payments aren&apos;t connected yet, so no card is charged. Use any test details.
        </p>
        <form className="grid gap-2.5" onSubmit={(e) => {
          e.preventDefault();
          if (valid) buy.mutate({ plan, cardName: card.name.trim(), cardLast4: digits.slice(-4) });
        }}>
          <div className="grid gap-1.5">
            <Label htmlFor="pay-name">Name on card</Label>
            <Input id="pay-name" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} autoComplete="cc-name" data-testid="paywall-card-name" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pay-number">Card number</Label>
            <div className="relative">
              <CreditCard className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="pay-number" inputMode="numeric" className="pl-8 font-mono" placeholder="4242 4242 4242 4242" value={card.number} maxLength={23}
                onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, "") })} data-testid="paywall-card-number" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pay-exp">Expiry</Label>
              <Input id="pay-exp" placeholder="MM/YY" maxLength={7} value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} data-testid="paywall-card-exp" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pay-cvc">CVC</Label>
              <Input id="pay-cvc" inputMode="numeric" maxLength={4} value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "") })} data-testid="paywall-card-cvc" />
            </div>
          </div>
          <Button type="submit" size="lg" className="mt-1" disabled={!valid || buy.isPending} data-testid="paywall-subscribe">
            {buy.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Start Premium · {premium.data?.prices.find((p) => p.plan === plan)?.label ?? ""}
          </Button>
        </form>
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
