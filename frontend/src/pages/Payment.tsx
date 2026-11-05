// Stripe return pages: /payment/success polls the session until it's paid; /payment/cancel.
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { PaymentStatus } from "@/lib/types";
import { Flower } from "@/components/Flower";

export function PaymentSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id") ?? "";
  const qc = useQueryClient();
  const [state, setState] = useState<"checking" | "paid" | "failed" | "timeout">("checking");
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !sessionId) return;
    started.current = true;
    let tries = 0;
    const poll = async () => {
      tries += 1;
      try {
        const s = await apiGet<PaymentStatus>(`/premium/status/${sessionId}`);
        if (s.payment_status === "paid") {
          setState("paid");
          ["premium", "settings", "sharing"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
          return;
        }
        if (s.status === "expired" || s.payment_status === "failed") return setState("failed");
      } catch { /* keep polling */ }
      if (tries >= 10) return setState("timeout");
      window.setTimeout(poll, 2000);
    };
    void poll();
  }, [sessionId, qc]);

  return (
    <div className="mx-auto grid max-w-md place-items-center gap-3 py-16 text-center" data-testid="payment-success-page">
      <Flower kind="hibiscus" className={state === "paid" ? "pua-bloom size-16" : "size-14 opacity-70"} />
      {state === "checking" && <p className="flex items-center gap-2 font-heading text-xl font-bold" data-testid="payment-checking"><Loader2 className="size-5 animate-spin" /> Confirming your payment…</p>}
      {state === "paid" && <>
        <p className="font-heading text-2xl font-bold" data-testid="payment-paid">Welcome to PUA Premium 🌺</p>
        <p className="text-sm text-muted-foreground">AI voice, more bouquets and bigger groups are unlocked.</p>
        <Link to="/sharing" className="text-sm text-primary underline" data-testid="payment-go-bouquets">Go to Bouquets</Link>
      </>}
      {state === "failed" && <p className="font-heading text-xl font-bold" data-testid="payment-failed">The payment didn&apos;t go through — nothing was charged.</p>}
      {state === "timeout" && <p className="text-sm text-muted-foreground" data-testid="payment-timeout">Still confirming with Stripe — check Settings in a minute.</p>}
      {state !== "paid" && <Link to="/settings?tab=premium" className="text-sm text-primary underline">Back to Settings</Link>}
    </div>
  );
}

export function PaymentCancel() {
  return (
    <div className="mx-auto grid max-w-md place-items-center gap-3 py-16 text-center" data-testid="payment-cancel-page">
      <Flower kind="plumeria" className="size-14 opacity-70" />
      <p className="font-heading text-xl font-bold">Checkout cancelled</p>
      <p className="text-sm text-muted-foreground">Nothing was charged. You can go Premium any time from Settings.</p>
      <Link to="/settings?tab=premium" className="text-sm text-primary underline" data-testid="payment-cancel-back">Back to Settings</Link>
    </div>
  );
}
