import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import { format, parseISO, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, ShoppingCart, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { DayContext, ShoppingItem } from "@/lib/types";
import { addDaysIso } from "@/lib/dates";
import { MealWeek, ShoppingSuggestions } from "@/components/MealWeek";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export default function Planner() {
  const todayQ = useQuery({
    queryKey: ["overview", 0],
    queryFn: () => apiGet<DayContext>("/overview?offset=0"),
  });
  const today = todayQ.data?.date ?? null;
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [pickerMonth, setPickerMonth] = useState<Date>(new Date());
  const monday = (iso: string) => format(startOfWeek(parseISO(`${iso}T12:00:00`), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const week = weekStart ?? (today ? monday(today) : null);

  const shopping = useQuery({
    queryKey: ["shopping"],
    queryFn: () => apiGet<ShoppingItem[]>("/shopping"),
  });
  const qc = useQueryClient();
  const [itemName, setItemName] = useState("");

  const updateItem = useMutation({
    mutationFn: (v: { id: string; name?: string; checked?: boolean }) =>
      apiPatch<ShoppingItem>(`/shopping/${v.id}`, { name: v.name, checked: v.checked }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shopping"] }); qc.invalidateQueries({ queryKey: ["meal-suggestions"] }); },
    onError: () => toast.error("Could not update the shopping list"),
  });
  const addItem = useMutation({
    mutationFn: () => apiPost<ShoppingItem>("/shopping", { name: itemName.trim() }),
    onSuccess: () => {
      setItemName("");
      qc.invalidateQueries({ queryKey: ["shopping"] });
      qc.invalidateQueries({ queryKey: ["meal-suggestions"] });
    },
    onError: () => toast.error("Could not add the item"),
  });
  const deleteItem = useMutation({
    mutationFn: (id: string) => apiDelete(`/shopping/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shopping"] }); qc.invalidateQueries({ queryKey: ["meal-suggestions"] }); },
    onError: () => toast.error("Could not remove the item"),
  });
  const clearChecked = useMutation({
    mutationFn: () => apiPost<{ deleted: number }>("/shopping/clear-checked"),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["shopping"] });
      qc.invalidateQueries({ queryKey: ["meal-suggestions"] });
      toast.success(`Cleared ${r.deleted} bought item${r.deleted === 1 ? "" : "s"}`);
    },
    onError: () => toast.error("Could not clear the list"),
  });

  const items = shopping.data ?? [];
  const anyChecked = items.some((i) => i.checked);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="space-y-6"
    >
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Meal planner</h1>
        <p className="text-sm text-muted-foreground">
          Plan the whole week, and the shopping list suggests what those meals need.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader className="flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="font-heading" data-testid="planner-week-label">
                {week ? `${format(parseISO(`${week}T12:00:00`), "MMM d")} – ${format(parseISO(`${addDaysIso(week, 6)}T12:00:00`), "MMM d")}` : "…"}
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="icon-sm" data-testid="planner-prev-week" aria-label="Previous week"
                  disabled={!week} onClick={() => week && setWeekStart(addDaysIso(week, -7))}>
                  <ChevronLeft className="size-4" />
                </Button>
                {today && week !== monday(today) && (
                  <Button variant="outline" size="sm" data-testid="planner-this-week" onClick={() => setWeekStart(null)}>This week</Button>
                )}
                <Popover>
                  <PopoverTrigger
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent"
                    data-testid="planner-date-picker"
                  >
                    <CalendarDays className="size-4" /> Pick
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-auto p-2">
                    <Calendar
                      mode="single"
                      weekStartsOn={1}
                      month={pickerMonth}
                      onMonthChange={setPickerMonth}
                      selected={week ? parseISO(`${week}T12:00:00`) : undefined}
                      onSelect={(d) => {
                        if (d) setWeekStart(monday(format(d, "yyyy-MM-dd")));
                      }}
                    />
                  </PopoverContent>
                </Popover>
                <Button variant="outline" size="icon-sm" data-testid="planner-next-week" aria-label="Next week"
                  disabled={!week} onClick={() => week && setWeekStart(addDaysIso(week, 7))}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
            <CardDescription>Tap any slot to plan it and list its ingredients — they&apos;re remembered for next time.</CardDescription>
          </CardHeader>
          <CardContent>
            {week && today ? <MealWeek weekStart={week} today={today} /> : <div className="h-64 animate-pulse rounded-xl bg-muted" />}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="font-heading">Shopping list</CardTitle>
              <CardDescription data-testid="shopping-count">
                {items.filter((i) => !i.checked).length} to buy
              </CardDescription>
            </div>
            {anyChecked && (
              <Button
                variant="outline"
                size="sm"
                data-testid="shopping-clear-button"
                onClick={() => clearChecked.mutate()}
                disabled={clearChecked.isPending}
              >
                <Trash2 className="size-4" /> Clear bought
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {week && <ShoppingSuggestions weekStart={week} />}
            <div className="flex gap-2">
              <Input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && itemName.trim() && addItem.mutate()}
                placeholder="Add an item…"
                data-testid="shopping-input"
              />
              <Button
                size="icon"
                aria-label="Add item"
                data-testid="shopping-add-button"
                disabled={!itemName.trim() || addItem.isPending}
                onClick={() => addItem.mutate()}
              >
                <ShoppingCart className="size-4" />
              </Button>
            </div>
            {shopping.isLoading ? (
              <div className="h-32 animate-pulse rounded-xl bg-muted" />
            ) : !items.length ? (
              <p className="text-sm text-muted-foreground" data-testid="shopping-empty">
                Empty — add what you need, or send a meal over.
              </p>
            ) : (
              <ul className="space-y-1">
                {items.map((i) => (
                  <li
                    key={i.id}
                    className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent/60"
                    data-testid={`shopping-row-${i.id}`}
                  >
                    <Checkbox
                      checked={i.checked}
                      onCheckedChange={(c) => updateItem.mutate({ id: i.id, checked: c === true })}
                      aria-label={`Mark ${i.name} as ${i.checked ? "to buy" : "bought"}`}
                      data-testid={`shopping-item-check-${i.id}`}
                    />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm transition-all",
                        i.checked && "text-muted-foreground line-through opacity-50",
                      )}
                      data-testid={`shopping-item-name-${i.id}`}
                    >
                      {i.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${i.name}`}
                      data-testid={`shopping-item-delete-${i.id}`}
                      onClick={() => deleteItem.mutate(i.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
