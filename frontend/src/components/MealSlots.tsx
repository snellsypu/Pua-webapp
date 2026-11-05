import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ShoppingCart, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type { AppSettings, Meal, MealSlot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SLOTS: { slot: MealSlot; label: string; emoji: string }[] = [
  { slot: "breakfast", label: "Breakfast", emoji: "🍳" },
  { slot: "lunch", label: "Lunch", emoji: "🥪" },
  { slot: "dinner", label: "Dinner", emoji: "🍲" },
  { slot: "snack", label: "Snack", emoji: "🍎" },
];

/** Today / overview / calendar show the plan chosen in Settings, so edits go to that plan too. */
function useMealBase() {
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const src = settings.data?.mealPlanSource;
  return src ? `/sharing/planner/${src}/meals` : "/meals";
}

function SlotRow({
  date,
  slot,
  label,
  emoji,
  meal,
}: {
  date: string;
  slot: MealSlot;
  label: string;
  emoji: string;
  meal?: Meal;
}) {
  const qc = useQueryClient();
  const base = useMealBase();
  const [value, setValue] = useState(meal?.title ?? "");
  useEffect(() => setValue(meal?.title ?? ""), [meal?.title]);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["overview"] });
    qc.invalidateQueries({ queryKey: ["range"] });
    qc.invalidateQueries({ queryKey: ["meals-week"] });
    qc.invalidateQueries({ queryKey: ["meal-suggestions"] });
  };
  const upsert = useMutation({
    mutationFn: () =>
      apiPost<Meal>(base, { date, slot, title: value.trim(), notes: meal?.notes ?? "" }),
    onSuccess: () => {
      invalidate();
      toast.success(`${label} planned`);
    },
    onError: () => toast.error("Could not save the meal"),
  });
  const remove = useMutation({
    mutationFn: () => apiDelete(`${base}/${meal!.id}`),
    onSuccess: () => {
      invalidate();
      setValue("");
      toast.success(`${label} cleared`);
    },
    onError: () => toast.error("Could not clear the meal"),
  });
  const toShopping = useMutation({
    mutationFn: () => apiPost("/shopping", { name: meal!.title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shopping"] });
      toast.success(`"${meal!.title}" added to the shopping list`);
    },
    onError: () => toast.error("Could not add to the shopping list"),
  });

  return (
    <div className="rounded-xl border p-3" data-testid={`meal-slot-${slot}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {emoji} {label}
        </span>
        {meal && (
          <div className="flex gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Add ${meal.title} to shopping list`}
              data-testid={`meal-to-shopping-${slot}`}
              title="Add to shopping list"
              onClick={() => toShopping.mutate()}
            >
              <ShoppingCart className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Clear ${label}`}
              data-testid={`meal-delete-${slot}`}
              onClick={() => remove.mutate()}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
      {meal && (
        <div className="mt-1 text-sm font-medium" data-testid={`meal-title-${slot}`}>
          {meal.title}
          {!!meal.cooks.length && (
            <span className="ml-2 text-xs font-normal text-orange-700 dark:text-orange-300" data-testid={`meal-cooks-${slot}`}>
              👩‍🍳 {meal.cooks.map((c) => c.name.split(" ")[0]).join(", ")}
            </span>
          )}
        </div>
      )}
      <div className="mt-2 flex gap-1.5">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && upsert.mutate()}
          placeholder={`Plan ${label.toLowerCase()}…`}
          className="h-8 text-sm"
          data-testid={`meal-input-${slot}`}
        />
        <Button
          size="icon"
          variant="outline"
          className="size-8"
          aria-label={`Save ${label}`}
          data-testid={`meal-save-${slot}`}
          disabled={!value.trim() || upsert.isPending}
          onClick={() => upsert.mutate()}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function MealSlots({ date, meals }: { date: string; meals: Meal[] }) {
  return (
    <div className="space-y-2" data-testid="meal-slots">
      {SLOTS.map((s) => (
        <SlotRow
          key={s.slot}
          date={date}
          slot={s.slot}
          label={s.label}
          emoji={s.emoji}
          meal={meals.find((m) => m.slot === s.slot)}
        />
      ))}
    </div>
  );
}
