// Weekly meal plan (Mon–Sun × 4 slots) with a per-meal dialog for ingredients — remembered per
// meal name on every tier, AI-guessed on Premium — and shopping suggestions from the week's meals.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Lock, Plus, ShoppingCart, Sparkles, Trash2, X } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import type { AppSettings, Cook, FavouriteMeal, Person, Meal, MealSlot, MealUpsert, Recipe, ShoppingSuggestion } from "@/lib/types";
import { addDaysIso, fmtShort } from "@/lib/dates";
import { usePaywall, usePremium } from "@/components/Paywall";
import { useMe } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const SLOTS: { slot: MealSlot; label: string; emoji: string }[] = [
  { slot: "breakfast", label: "Breakfast", emoji: "🍳" },
  { slot: "lunch", label: "Lunch", emoji: "🥪" },
  { slot: "dinner", label: "Dinner", emoji: "🍲" },
  { slot: "snack", label: "Snack", emoji: "🍎" },
];

export function useInvalidateMeals() {
  const qc = useQueryClient();
  return () => {
    for (const k of ["meals-week", "meal-suggestions", "meal-favourites", "overview", "range"]) qc.invalidateQueries({ queryKey: [k] });
  };
}

type Target = { date: string; slot: MealSlot; meal?: Meal };

function MealDialog({ base, target, onClose }: { base: string; target: Target | null; onClose: () => void }) {
  const invalidate = useInvalidateMeals();
  const premium = usePremium();
  const openPaywall = usePaywall();
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [remembered, setRemembered] = useState(false);
  const [cooks, setCooks] = useState<Cook[]>([]);
  const me = useMe();
  const cooking = cooks.some((c) => c.user_id === me.data?.user_id);
  const toggleCook = useMutation({
    mutationFn: () => apiPost<Meal>(`${base}/${target!.meal!.id}/cook`),
    onSuccess: (m) => {
      setCooks(m.cooks);
      invalidate();
      toast.success(m.cooks.some((c) => c.user_id === me.data?.user_id) ? "You're cooking 👩‍🍳 — everyone can see" : "You've stepped back from cooking");
    },
    onError: () => toast.error("Couldn't update who's cooking"),
  });

  useEffect(() => {
    setTitle(target?.meal?.title ?? "");
    setItems(target?.meal?.ingredients ?? []);
    setDraft("");
    setRemembered(false);
    setCooks(target?.meal?.cooks ?? []);
  }, [target]);

  const slotInfo = SLOTS.find((s) => s.slot === target?.slot);
  const favs = useQuery({
    queryKey: ["meal-favourites", base, target?.slot],
    queryFn: () => apiGet<FavouriteMeal[]>(`${base}/favourites?slot=${target!.slot}`),
    enabled: !!target,
  });
  const pickFavourite = (f: FavouriteMeal) => { setTitle(f.title); setItems(f.ingredients); setRemembered(f.ingredients.length > 0); };
  const addItem = (t: string) => {
    const v = t.trim();
    if (v && !items.some((i) => i.toLowerCase() === v.toLowerCase())) setItems((xs) => [...xs, v]);
  };
  const recall = async () => {
    const t = title.trim();
    if (!t || items.length || t === target?.meal?.title) return;
    const r = await apiGet<Recipe>(`${base}/recipe?title=${encodeURIComponent(t)}`).catch(() => null);
    if (r?.ingredients.length) { setItems(r.ingredients); setRemembered(true); }
  };
  const guess = useMutation({
    mutationFn: () => apiPost<Recipe>("/meals/recipe/guess", { title: title.trim() }),
    onSuccess: (r) => {
      setItems((xs) => [...xs, ...r.ingredients.filter((i) => !xs.some((x) => x.toLowerCase() === i.toLowerCase()))]);
      toast.success(`Added ${r.ingredients.length} ingredient ideas`);
    },
    onError: () => toast.error("Couldn't think of ingredients right now — try again"),
  });
  const save = useMutation({
    mutationFn: () => {
      const body: MealUpsert = { date: target!.date, slot: target!.slot, title: title.trim(), notes: target!.meal?.notes ?? "", ingredients: items };
      return apiPost<Meal>(base, body);
    },
    onSuccess: () => { invalidate(); toast.success(`${slotInfo?.label} planned`); onClose(); },
    onError: () => toast.error("Could not save the meal"),
  });
  const remove = useMutation({
    mutationFn: () => apiDelete(`${base}/${target!.meal!.id}`),
    onSuccess: () => { invalidate(); toast.success(`${slotInfo?.label} cleared`); onClose(); },
    onError: () => toast.error("Could not clear the meal"),
  });

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="meal-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">{slotInfo?.emoji} {slotInfo?.label} · {target ? fmtShort(target.date) : ""}</DialogTitle>
          <DialogDescription>Ingredients are remembered for this meal, so next time they fill in by themselves.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="meal-title">Meal</Label>
            <Input id="meal-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={recall}
              placeholder="e.g. Spaghetti bolognese" autoFocus data-testid="meal-dialog-title-input" />
          </div>
          {!!favs.data?.length && (
            <div className="space-y-1.5" data-testid="meal-dialog-favourites">
              <p className="text-xs font-medium text-muted-foreground">Favourites</p>
              <ul className="flex flex-wrap gap-1.5">
                {favs.data.map((f) => (
                  <li key={f.title}>
                    <button type="button" onClick={() => pickFavourite(f)}
                      className={cn("rounded-full px-2.5 py-1 text-xs ring-1 ring-border transition-[background-color,transform] duration-150 hover:bg-accent active:scale-95",
                        title.trim().toLowerCase() === f.title.toLowerCase() && "bg-primary text-primary-foreground ring-primary")}
                      data-testid={`meal-favourite-${f.title}`}>
                      ⭐ {f.title} <span className="opacity-60">×{f.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="meal-ingredient">Ingredients</Label>
              <Button type="button" size="xs" variant="outline" disabled={!title.trim() || guess.isPending}
                onClick={() => (premium.data?.active ? guess.mutate() : openPaywall("AI ingredient ideas"))}
                data-testid="meal-dialog-ai-guess-button">
                {guess.isPending ? <Loader2 className="size-3 animate-spin" /> : premium.data?.active ? <Sparkles className="size-3" /> : <Lock className="size-3" />}
                Suggest ingredients
              </Button>
            </div>
            {remembered && <p className="text-xs text-emerald-700 dark:text-emerald-300" data-testid="meal-dialog-remembered">Filled in from last time ✓</p>}
            <div className="flex gap-1.5">
              <Input id="meal-ingredient" value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { e.preventDefault(); addItem(draft); setDraft(""); } }}
                placeholder="Add an ingredient…" className="h-8 text-sm" data-testid="meal-dialog-ingredient-input" />
              <Button type="button" size="icon" variant="outline" className="size-8" aria-label="Add ingredient" disabled={!draft.trim()}
                onClick={() => { addItem(draft); setDraft(""); }} data-testid="meal-dialog-ingredient-add">
                <Plus className="size-4" />
              </Button>
            </div>
            <ul className="flex flex-wrap gap-1.5" data-testid="meal-dialog-ingredients">
              {items.map((i) => (
                <li key={i} className="flex items-center gap-1 rounded-full bg-emerald-500/10 py-0.5 pl-2.5 pr-1 text-xs" data-testid={`meal-dialog-ingredient-${i}`}>
                  {i}
                  <button type="button" aria-label={`Remove ${i}`} className="rounded-full p-0.5 transition-colors hover:bg-foreground/10"
                    onClick={() => setItems((xs) => xs.filter((x) => x !== i))} data-testid={`meal-dialog-ingredient-remove-${i}`}>
                    <X className="size-3" />
                  </button>
                </li>
              ))}
              {!items.length && <li className="text-xs text-muted-foreground">No ingredients yet.</li>}
            </ul>
          </div>
          {target?.meal && (
            <div className="flex items-center gap-2 rounded-xl bg-orange-500/10 px-3 py-2" data-testid="meal-dialog-cooks">
              <span className="min-w-0 flex-1 text-sm" data-testid="meal-dialog-cooks-names">
                👩‍🍳 {cooks.length ? `Cooking: ${cooks.map((c) => c.name.split(" ")[0]).join(", ")}` : "Nobody's cooking yet"}
              </span>
              <Button size="xs" variant={cooking ? "outline" : "default"} disabled={toggleCook.isPending} onClick={() => toggleCook.mutate()} data-testid="meal-dialog-cook-toggle">
                {cooking ? "Step back" : cooks.length ? "I'll help" : "I'll cook"}
              </Button>
            </div>
          )}
          <div className="flex justify-between gap-2">
            {target?.meal ? (
              <Button variant="ghost" onClick={() => remove.mutate()} disabled={remove.isPending} data-testid="meal-dialog-delete">
                <Trash2 className="size-4" /> Clear
              </Button>
            ) : <span />}
            <Button onClick={() => save.mutate()} disabled={!title.trim() || save.isPending} data-testid="meal-dialog-save">Save meal</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** base = "/meals" (my plan) or "/sharing/planner/<ownerId>/meals" (a bouquet's shared plan) */
export function MealWeek({ base, weekStart, today }: { base: string; weekStart: string; today: string }) {
  const weekEnd = addDaysIso(weekStart, 6);
  const q = useQuery({
    queryKey: ["meals-week", base, weekStart],
    queryFn: () => apiGet<Meal[]>(`${base}?from=${weekStart}&to=${weekEnd}`),
  });
  const [target, setTarget] = useState<Target | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));

  if (q.isLoading) return <div className="h-96 animate-pulse rounded-xl bg-muted" />;
  return (
    <>
      <ol className="space-y-2.5" data-testid="meal-week">
        {days.map((d) => {
          const meals = (q.data ?? []).filter((m) => m.date === d);
          return (
            <li key={d} className={cn("rounded-2xl border p-2.5 transition-shadow duration-150", d === today && "border-primary/60 bg-primary/5 shadow-sm")} data-testid={`meal-day-${d}`}>
              <div className="mb-1.5 flex items-center gap-2 px-1 text-sm font-semibold">
                {fmtShort(d)}
                {d === today && <span className="rounded-full bg-primary px-2 text-[10px] font-bold uppercase text-primary-foreground">Today</span>}
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {SLOTS.map((s) => {
                  const meal = meals.find((m) => m.slot === s.slot);
                  return (
                    <button key={s.slot} type="button" onClick={() => setTarget({ date: d, slot: s.slot, meal })}
                      className={cn("min-h-14 rounded-xl px-2.5 py-1.5 text-left transition-[background-color,transform] duration-150 active:scale-[0.97]",
                        meal ? "bg-card ring-1 ring-border hover:bg-accent" : "border border-dashed text-muted-foreground hover:bg-accent/60")}
                      data-testid={`meal-cell-${d}-${s.slot}`}>
                      <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{s.emoji} {s.label}</span>
                      <span className="block truncate text-sm font-medium" data-testid={`meal-cell-title-${d}-${s.slot}`}>{meal?.title ?? "+ Plan"}</span>
                      {!!meal?.ingredients.length && <span className="block text-[10px] text-muted-foreground">{meal.ingredients.length} ingredients</span>}
                      {!!meal?.cooks.length && (
                        <span className="block truncate text-[10px] font-medium text-orange-700 dark:text-orange-300" data-testid={`meal-cell-cooks-${d}-${s.slot}`}>
                          👩‍🍳 {meal.cooks.map((c) => c.name.split(" ")[0]).join(", ")}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
      <MealDialog base={base} target={target} onClose={() => setTarget(null)} />
    </>
  );
}

export function ShoppingSuggestions({ base, weekStart }: { base: string; weekStart: string }) {
  const qc = useQueryClient();
  const weekEnd = addDaysIso(weekStart, 6);
  const q = useQuery({
    queryKey: ["meal-suggestions", base, weekStart],
    queryFn: () => apiGet<ShoppingSuggestion[]>(`${base}/suggestions?from=${weekStart}&to=${weekEnd}`),
  });
  const add = useMutation({
    mutationFn: async (names: string[]) => { for (const name of names) await apiPost("/shopping", { name }); return names.length; },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["shopping"] });
      qc.invalidateQueries({ queryKey: ["meal-suggestions"] });
      toast.success(n === 1 ? "Added to the shopping list" : `Added ${n} items to the shopping list`);
    },
    onError: () => toast.error("Could not add to the shopping list"),
  });
  const list = q.data ?? [];
  if (!list.length) return null;
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3" data-testid="shopping-suggestions">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Needed for this week&apos;s meals</p>
        <Button size="xs" variant="outline" disabled={add.isPending} onClick={() => add.mutate(list.map((s) => s.name))} data-testid="shopping-suggestions-add-all">
          <ShoppingCart className="size-3" /> Add all
        </Button>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {list.map((s) => (
          <li key={s.name}>
            <button type="button" title={`For ${s.meals.join(", ")}`} disabled={add.isPending} onClick={() => add.mutate([s.name])}
              className="flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-xs ring-1 ring-border transition-[background-color,transform] duration-150 hover:bg-accent active:scale-95"
              data-testid={`shopping-suggestion-${s.name}`}>
              <Plus className="size-3" /> {s.name}
              {s.meals.length > 1 && <span className="text-muted-foreground">×{s.meals.length}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Settings: which meal plan Today, the overview and the bedtime read-out use. */
export function MealPlanSourceCard() {
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ["meal-plans"], queryFn: () => apiGet<Person[]>("/sharing/meal-plans") });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const save = useMutation({
    mutationFn: (src: string | null) => apiPut<AppSettings>("/settings", { mealPlanSource: src }),
    onSuccess: (s) => {
      qc.setQueryData(["settings"], s);
      for (const k of ["overview", "range"]) qc.invalidateQueries({ queryKey: [k] });
      toast.success("Your briefing will use that meal plan");
    },
    onError: () => toast.error("Couldn't change the meal plan"),
  });
  if (!plans.data?.length) return null;
  const current = settings.data?.mealPlanSource ?? "mine";
  return (
    <Card data-testid="meal-plan-source-card">
      <CardHeader>
        <CardTitle className="font-heading">Meals in your briefing 🍽️</CardTitle>
        <CardDescription>Pick the plan that Today, the morning overview and the bedtime read-out show.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {[{ id: "mine", label: "My own plan" }, ...plans.data.map((p) => ({ id: p.user_id, label: `${p.name.split(" ")[0]}'s bouquet plan` }))].map((o) => (
          <button key={o.id} type="button" onClick={() => save.mutate(o.id === "mine" ? null : o.id)} disabled={save.isPending}
            className={cn("rounded-full px-3 py-1.5 text-sm ring-1 ring-border transition-[background-color,color] duration-150",
              current === o.id ? "bg-primary text-primary-foreground ring-primary" : "hover:bg-accent")}
            aria-pressed={current === o.id} data-testid={`meal-plan-source-${o.id}`}>
            {o.label}
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
