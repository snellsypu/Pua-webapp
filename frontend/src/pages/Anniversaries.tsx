// Anniversaries tab: birthdays, anniversaries, your own yearly events and holiday sets,
// each with a countdown. Heads-ups (1 week / 1 day / today) also go in the morning briefing.
import { BirthdayNudgeCard } from "@/components/AnniversaryCards";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import { CalendarHeart, Gift, Pencil, Plus, Settings2, ShoppingCart, Trash2, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import type { Anniversary, AnniversaryIn, AnniversaryKind, GiftIdea, PoolGift, UpcomingEvent } from "@/lib/types";
import { fmtShort } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<AnniversaryKind, string> = { birthday: "Birthday", anniversary: "Anniversary", event: "Yearly event" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type Filter = "all" | "people" | "holiday";

export const countdown = (d: number) => (d === 0 ? "Today!" : d === 1 ? "Tomorrow" : d < 7 ? `${d} days` : d < 60 ? `${d} days` : `${Math.round(d / 30.4)} months`);

export function eventLabel(e: UpcomingEvent) {
  if (e.kind === "birthday") return `${e.title}'s birthday`;
  return e.title;
}
const subLabel = (e: UpcomingEvent) =>
  e.friend ? (e.years ? `Bouquet friend · turns ${e.years}` : "Bouquet friend") : e.kind === "birthday" && e.years ? `Turns ${e.years}` : e.kind === "anniversary" && e.years ? `${e.years} years` : e.kind === "holiday" ? "Holiday" : e.custom ? KIND_LABEL[e.custom.kind] : "";

/** gold pill for decade birthdays, 18th/21st and named anniversaries (Silver, Ruby, Golden…) */
export function MilestoneBadge({ e, className }: { e: UpcomingEvent; className?: string }) {
  if (!e.milestone) return null;
  const text = e.kind === "anniversary" && !/\d/.test(e.milestone) ? `${e.milestone} anniversary` : e.kind === "birthday" ? `Milestone · ${e.milestone}` : e.milestone;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-300 to-yellow-200 px-2 py-0.5 text-[11px] font-bold text-amber-950 shadow-sm ring-1 ring-amber-500/40 animate-in fade-in zoom-in-95", className)}
      data-testid={`anniversary-milestone-${e.id}`}>
      ✨ {text}
    </span>
  );
}

/** Your private gift list for a bouquet friend's shared birthday (saved as you go). */
function FriendGiftDialog({ e, onClose }: { e: UpcomingEvent | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [gifts, setGifts] = useState<GiftIdea[]>([]);
  const [text, setText] = useState("");
  useEffect(() => { setGifts(e?.gifts ?? []); setText(""); }, [e]);
  const save = useMutation({
    mutationFn: (g: GiftIdea[]) => apiPut<GiftIdea[]>(`/anniversaries/friends/${e!.friend}/gifts`, { gifts: g }),
    onSuccess: (g) => { setGifts(g); qc.invalidateQueries({ queryKey: ["anniversaries"] }); },
    onError: () => toast.error("Couldn't save the gift list"),
  });
  const toShopping = useMutation({
    mutationFn: (name: string) => apiPost("/shopping", { name }),
    onSuccess: (_, name) => { qc.invalidateQueries({ queryKey: ["shopping"] }); toast.success(`"${name}" added to the shopping list`); },
    onError: () => toast.error("Could not add to the shopping list"),
  });
  const change = (g: GiftIdea[]) => { setGifts(g); save.mutate(g); };
  const [pool, setPool] = useState<PoolGift[]>([]);
  const [poolText, setPoolText] = useState("");
  useEffect(() => { setPool(e?.pool ?? []); setPoolText(""); }, [e]);
  const poolBase = `/anniversaries/friends/${e?.friend}/pool`;
  const poolDone = (p: PoolGift[]) => { setPool(p); qc.invalidateQueries({ queryKey: ["anniversaries"] }); };
  const poolAdd = useMutation({
    mutationFn: (text: string) => apiPost<PoolGift[]>(poolBase, { text }),
    onSuccess: (p) => { poolDone(p); setPoolText(""); toast.success("Added to the bouquet pool 💐"); },
    onError: () => toast.error("Couldn't add to the pool"),
  });
  const poolClaim = useMutation({
    mutationFn: (id: string) => apiPost<PoolGift[]>(`${poolBase}/${id}/claim`),
    onSuccess: (p, id) => { poolDone(p); toast.success(p.find((g) => g.id === id)?.claimedByMe ? "You're buying it — everyone else can see that" : "Unclaimed"); },
    onError: (err) => toast.error(err instanceof ApiError && err.status === 409 ? "Someone else is already buying that" : "Couldn't update the gift"),
  });
  const poolDel = useMutation({
    mutationFn: (id: string) => apiDelete<PoolGift[]>(`${poolBase}/${id}`),
    onSuccess: poolDone,
    onError: () => toast.error("Couldn't remove that idea"),
  });
  const add = () => { const t = text.trim(); if (t) { change([...gifts, { id: crypto.randomUUID(), text: t, bought: false }]); setText(""); } };
  return (
    <Dialog open={!!e} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md" data-testid="friend-gift-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">🎈 {e ? eventLabel(e) : ""}</DialogTitle>
          <DialogDescription>{e ? `${fmtShort(e.next)}${e.years ? ` · turns ${e.years}` : ""}` : ""} — only you can see this gift list.</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1.5" data-testid="friend-gift-list">
          {gifts.map((g, i) => (
            <li key={g.id ?? i} className="flex items-center gap-2 text-sm" data-testid={`friend-gift-${i}`}>
              <Checkbox checked={g.bought} aria-label={`Bought ${g.text}`} data-testid={`friend-gift-bought-${i}`}
                onCheckedChange={(v) => change(gifts.map((x, j) => (j === i ? { ...x, bought: v === true } : x)))} />
              <span className={cn("flex-1", g.bought && "text-muted-foreground line-through")}>{g.text}</span>
              {!g.bought && (
                <button type="button" aria-label={`Add ${g.text} to shopping list`} onClick={() => toShopping.mutate(g.text)} disabled={toShopping.isPending}
                  className="rounded p-0.5 text-muted-foreground transition-[color,transform] duration-150 hover:text-primary active:scale-90" data-testid={`friend-gift-to-shopping-${i}`}>
                  <ShoppingCart className="size-3.5" />
                </button>
              )}
              <button type="button" aria-label="Remove" onClick={() => change(gifts.filter((_, j) => j !== i))}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground" data-testid={`friend-gift-remove-${i}`}><X className="size-3.5" /></button>
            </li>
          ))}
          {!gifts.length && <li className="text-sm text-muted-foreground">No gift ideas yet.</li>}
        </ul>
        <div className="flex gap-2">
          <Input value={text} onChange={(ev) => setText(ev.target.value)} maxLength={80} placeholder="e.g. Silk scarf" className="h-8 text-sm"
            onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); add(); } }} data-testid="friend-gift-input" />
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={add} disabled={!text.trim()} data-testid="friend-gift-add"><Plus className="size-3.5" /> Add</Button>
        </div>
        <div className="space-y-2 rounded-2xl border border-pink-400/40 bg-pink-500/5 p-3" data-testid="gift-pool">
          <div>
            <p className="text-sm font-semibold">💐 Bouquet gift pool</p>
            <p className="text-xs text-muted-foreground">Everyone in your bouquets with {e?.title} sees these — {e?.title} never does. Claim one so nobody doubles up.</p>
          </div>
          <ul className="grid gap-1.5" data-testid="gift-pool-list">
            {pool.map((g) => (
              <li key={g.id} className="flex items-center gap-2 text-sm" data-testid={`gift-pool-item-${g.id}`}>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate", g.claimedBy && !g.claimedByMe && "text-muted-foreground")}>{g.text}</span>
                  <span className="block text-[11px] text-muted-foreground">{g.mine ? "your idea" : `${g.addedBy}'s idea`}</span>
                </span>
                {g.claimedBy && !g.claimedByMe ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium" data-testid={`gift-pool-claimed-${g.id}`}>🛍️ {g.claimedBy} is buying</span>
                ) : (
                  <Button size="xs" variant={g.claimedByMe ? "secondary" : "outline"} disabled={poolClaim.isPending} onClick={() => poolClaim.mutate(g.id)} data-testid={`gift-pool-claim-${g.id}`}>
                    {g.claimedByMe ? "✓ You're buying" : "I'm buying this"}
                  </Button>
                )}
                {g.mine && (
                  <button type="button" aria-label="Remove" onClick={() => poolDel.mutate(g.id)} disabled={poolDel.isPending}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground" data-testid={`gift-pool-remove-${g.id}`}><X className="size-3.5" /></button>
                )}
              </li>
            ))}
            {!pool.length && <li className="text-xs text-muted-foreground">No shared ideas yet.</li>}
          </ul>
          <div className="flex gap-2">
            <Input value={poolText} onChange={(ev) => setPoolText(ev.target.value)} maxLength={80} placeholder="Suggest a gift for everyone…" className="h-8 text-sm"
              onKeyDown={(ev) => { if (ev.key === "Enter" && poolText.trim()) { ev.preventDefault(); poolAdd.mutate(poolText.trim()); } }} data-testid="gift-pool-input" />
            <Button type="button" size="sm" variant="outline" className="h-8" disabled={!poolText.trim() || poolAdd.isPending} onClick={() => poolAdd.mutate(poolText.trim())} data-testid="gift-pool-add">
              <Plus className="size-3.5" /> Share
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const useUpcoming = () => useQuery({ queryKey: ["anniversaries"], queryFn: () => apiGet<UpcomingEvent[]>("/anniversaries") });

function EventDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial: Anniversary | null }) {
  const qc = useQueryClient();
  const [f, setF] = useState<AnniversaryIn>(() => initial ?? { title: "", kind: "birthday", date: "01-01", year: null, emoji: "", gifts: [] });
  const [gift, setGift] = useState("");
  const [yearText, setYearText] = useState(() => (initial?.year ? String(initial.year) : ""));
  const toShopping = useMutation({
    mutationFn: (name: string) => apiPost("/shopping", { name }),
    onSuccess: (_, name) => { qc.invalidateQueries({ queryKey: ["shopping"] }); toast.success(`"${name}" added to the shopping list`); },
    onError: () => toast.error("Could not add to the shopping list"),
  });
  const addGift = () => { if (gift.trim()) { setF({ ...f, gifts: [...f.gifts, { text: gift.trim(), bought: false }] }); setGift(""); } };
  const [month, day] = f.date.split("-").map(Number);
  const save = useMutation({
    mutationFn: () => (initial ? apiPut<Anniversary>(`/anniversaries/${initial.id}`, f) : apiPost<Anniversary>("/anniversaries", f)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["anniversaries"] }); toast.success(initial ? "Updated" : "Added — you'll get a heads-up a week and a day before"); onOpenChange(false); },
    onError: () => toast.error("Couldn't save — check the date"),
  });
  const del = useMutation({
    mutationFn: () => apiDelete(`/anniversaries/${initial!.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["anniversaries"] }); toast.success("Removed"); onOpenChange(false); },
  });
  const setMD = (m: number, d: number) => setF({ ...f, date: `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  const daysIn = new Date(2024, month, 0).getDate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="anniversary-dialog">
        <DialogHeader><DialogTitle className="font-heading">{initial ? "Edit event" : "Add a birthday or event"}</DialogTitle></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (f.title.trim()) save.mutate(); }}>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Type">
            {(Object.keys(KIND_LABEL) as AnniversaryKind[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => setF({ ...f, kind: k })} data-testid={`anniversary-kind-${k}`}
                className={cn("rounded-xl border px-2 py-2 text-xs font-medium transition-[background-color,border-color] duration-150", f.kind === k ? "border-primary bg-primary/10" : "hover:bg-accent")}>
                {k === "birthday" ? "🎂" : k === "anniversary" ? "💞" : "📅"} {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ann-title">{f.kind === "birthday" ? "Whose birthday?" : "Name"}</Label>
            <Input id="ann-title" value={f.title} maxLength={80} onChange={(e) => setF({ ...f, title: e.target.value })}
              placeholder={f.kind === "birthday" ? "Mum" : f.kind === "anniversary" ? "Our wedding anniversary" : "Pay car tax"} data-testid="anniversary-title-input" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="grid gap-1.5">
              <Label>Day</Label>
              <Select value={String(day)} onValueChange={(v) => setMD(month, Number(v))}>
                <SelectTrigger data-testid="anniversary-day"><SelectValue>{day}</SelectValue></SelectTrigger>
                <SelectContent>{Array.from({ length: daysIn }, (_, i) => <SelectItem key={i} value={String(i + 1)}>{i + 1}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Month</Label>
              <Select value={String(month)} onValueChange={(v) => setMD(Number(v), Math.min(day, new Date(2024, Number(v), 0).getDate()))}>
                <SelectTrigger data-testid="anniversary-month"><SelectValue>{MONTHS[month - 1]}</SelectValue></SelectTrigger>
                <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ann-year">Year <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="ann-year" inputMode="numeric" maxLength={4} value={yearText} placeholder="1990"
                onChange={(e) => { const y = e.target.value.replace(/\D/g, "").slice(0, 4); setYearText(y); setF({ ...f, year: y.length === 4 ? Number(y) : null }); }} data-testid="anniversary-year-input" />
            </div>
          </div>
          {f.kind === "birthday" && (
            <div className="grid gap-2 rounded-xl border border-dashed p-3" data-testid="anniversary-gifts">
              <Label className="flex items-center gap-1.5"><Gift className="size-4 text-pink-500" /> Gift ideas</Label>
              {f.gifts.length > 0 && (
                <ul className="space-y-1">
                  {f.gifts.map((g, i) => (
                    <li key={g.id ?? i} className="flex items-center gap-2 text-sm" data-testid={`anniversary-gift-${i}`}>
                      <Checkbox checked={g.bought} aria-label={`Bought ${g.text}`} data-testid={`anniversary-gift-bought-${i}`}
                        onCheckedChange={(v) => setF({ ...f, gifts: f.gifts.map((x, j) => (j === i ? { ...x, bought: v === true } : x)) })} />
                      <span className={cn("flex-1", g.bought && "text-muted-foreground line-through")}>{g.text}</span>
                      {!g.bought && (
                        <button type="button" aria-label={`Add ${g.text} to shopping list`} title="Add to shopping list" onClick={() => toShopping.mutate(g.text)}
                          disabled={toShopping.isPending}
                          className="rounded p-0.5 text-muted-foreground transition-[color,transform] duration-150 hover:text-primary active:scale-90" data-testid={`anniversary-gift-to-shopping-${i}`}>
                          <ShoppingCart className="size-3.5" />
                        </button>
                      )}
                      <button type="button" aria-label="Remove" onClick={() => setF({ ...f, gifts: f.gifts.filter((_, j) => j !== i) })}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground" data-testid={`anniversary-gift-remove-${i}`}><X className="size-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-1.5">
                <Input value={gift} onChange={(e) => setGift(e.target.value)} maxLength={80} placeholder="e.g. Silk scarf" className="h-8 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGift(); } }} data-testid="anniversary-gift-input" />
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={addGift} disabled={!gift.trim()} data-testid="anniversary-gift-add"><Plus className="size-3.5" /> Add</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Ideas you haven&apos;t ticked as bought are in your 1-week and 1-day reminders.</p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {initial ? <Button type="button" variant="ghost" className="text-destructive" onClick={() => del.mutate()} data-testid="anniversary-delete"><Trash2 className="size-4" /> Delete</Button> : <span />}
            <Button type="submit" disabled={!f.title.trim() || save.isPending} data-testid="anniversary-save">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Anniversaries() {
  const q = useUpcoming();
  const [filter, setFilter] = useState<Filter>("all");
  const [friendGift, setFriendGift] = useState<UpcomingEvent | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; initial: Anniversary | null; key: number }>({ open: false, initial: null, key: 0 });
  const events = useMemo(() => (q.data ?? []).filter((e) => filter === "all" || (filter === "holiday" ? e.kind === "holiday" : e.kind !== "holiday")), [q.data, filter]);
  const [hero, ...rest] = events;
  const open = (initial: Anniversary | null) => setDialog((d) => ({ open: true, initial, key: d.key + 1 }));

  return (
    <div className="space-y-6" data-testid="anniversaries-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Anniversaries</h1>
          <p className="text-muted-foreground">Birthdays, anniversaries and holidays — with a heads-up in your morning briefing a week and a day before.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/settings#holidays" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors duration-150 hover:bg-accent" data-testid="anniversaries-holiday-settings">
            <Settings2 className="size-4" /> Holidays
          </Link>
          <Button onClick={() => open(null)} data-testid="anniversary-add"><Plus className="size-4" /> Add</Button>
        </div>
      </header>
      <BirthdayNudgeCard />
      <div className="flex gap-1.5" role="tablist">
        {(["all", "people", "holiday"] as Filter[]).map((k) => (
          <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} data-testid={`anniversaries-filter-${k}`}
            className={cn("rounded-full px-3 py-1 text-sm transition-colors duration-150", filter === k ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent")}>
            {k === "all" ? "All" : k === "people" ? "Birthdays & mine" : "Holidays"}
          </button>
        ))}
      </div>

      {hero && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="overflow-hidden bg-gradient-to-br from-pink-100/80 via-card to-emerald-100/60 dark:from-pink-500/10 dark:to-emerald-500/10" data-testid="anniversary-next">
            <CardContent className="flex flex-wrap items-center gap-5 p-6">
              <span className="text-6xl">{hero.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Next up · {fmtShort(hero.next)}</p>
                <p className="font-heading text-2xl font-bold">{eventLabel(hero)}</p>
                <p className="text-sm text-muted-foreground">{subLabel(hero)}</p>
                <MilestoneBadge e={hero} className="mt-1.5" />
              </div>
              <div className="text-right">
                <p className="font-heading text-5xl font-extrabold tabular-nums text-primary" data-testid="anniversary-next-countdown">{hero.daysUntil === 0 ? "🎉" : hero.daysUntil}</p>
                <p className="text-sm text-muted-foreground">{hero.daysUntil === 0 ? "It's today!" : hero.daysUntil === 1 ? "day to go" : "days to go"}</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {q.data && !events.length && (
        <div className="flex items-center gap-4 rounded-3xl border border-dashed p-6" data-testid="anniversaries-empty">
          <CalendarHeart className="size-8 text-pink-500" />
          <p className="text-sm text-muted-foreground">Nothing here yet — add a birthday, or switch on holiday sets in Settings.</p>
        </div>
      )}

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="anniversaries-list">
        {rest.map((e) => (
          <li key={e.id} className="group flex items-center gap-3 rounded-2xl border bg-card/80 p-3 backdrop-blur transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-md" data-testid={`anniversary-${e.id}`}>
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-2xl">{e.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{eventLabel(e)}</span>
              <span className="block text-xs text-muted-foreground">{fmtShort(e.next)}{subLabel(e) ? ` · ${subLabel(e)}` : ""}</span>
              <MilestoneBadge e={e} className="mt-1" />
              {!!(e.custom?.gifts ?? e.gifts).filter((g) => !g.bought).length && (
                <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-pink-700 dark:text-pink-300" data-testid={`anniversary-gifts-${e.id}`}>
                  <Gift className="size-3" /> {(e.custom?.gifts ?? e.gifts).filter((g) => !g.bought).map((g) => g.text).join(", ")}
                </span>
              )}
            </span>
            <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums",
              e.daysUntil <= 1 ? "bg-pink-500 text-white" : e.daysUntil <= 7 ? "bg-amber-400/30 text-amber-900 dark:text-amber-200" : "bg-muted text-muted-foreground")}
              data-testid={`anniversary-countdown-${e.id}`}>{countdown(e.daysUntil)}</span>
            {e.custom && (
              <button type="button" aria-label="Edit" onClick={() => open(e.custom)} data-testid={`anniversary-edit-${e.id}`}
                className="rounded p-1 text-muted-foreground opacity-60 transition-opacity duration-150 hover:opacity-100"><Pencil className="size-3.5" /></button>
            )}
            {e.friend && (
              <button type="button" aria-label="Gift ideas" title="Gift ideas" onClick={() => setFriendGift(e)} data-testid={`anniversary-friend-gifts-${e.id}`}
                className="rounded p-1 text-pink-600 opacity-80 transition-[opacity,transform] duration-150 hover:opacity-100 active:scale-90"><Gift className="size-4" /></button>
            )}
          </li>
        ))}
      </ul>
      {hero?.custom && (
        <Button variant="ghost" size="sm" onClick={() => open(hero.custom)} data-testid="anniversary-next-edit"><Pencil className="size-3.5" /> Edit {hero.title}</Button>
      )}
      {hero?.friend && (
        <Button variant="ghost" size="sm" onClick={() => setFriendGift(hero)} data-testid="anniversary-next-gifts"><Gift className="size-3.5" /> Gift ideas for {hero.title}</Button>
      )}
      <FriendGiftDialog e={friendGift} onClose={() => setFriendGift(null)} />
      <EventDialog key={dialog.key} open={dialog.open} initial={dialog.initial} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} />
    </div>
  );
}
