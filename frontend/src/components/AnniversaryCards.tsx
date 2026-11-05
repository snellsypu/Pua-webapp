// Anniversary heads-ups (today / tomorrow / in a week) for Today + the morning briefing,
// and the Settings checklist of holiday sets grouped by religion.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarHeart } from "lucide-react";
import { apiGet, apiPut } from "@/lib/api";
import type { HolidaySetState, MyBirthday, SharingState, UpcomingEvent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const EMPTY_BDAY: MyBirthday = { date: null, year: null, share: false, declined: false };

function useMyBirthday() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-birthday"], queryFn: () => apiGet<MyBirthday>("/anniversaries/my-birthday") });
  const save = useMutation({
    mutationFn: (patch: Partial<MyBirthday>) => {
      const latest = qc.getQueryData<MyBirthday>(["my-birthday"]) ?? EMPTY_BDAY;
      const next = { ...latest, ...patch, ...(patch.share ? { declined: false } : {}) };
      qc.setQueryData(["my-birthday"], next); // optimistic, so the next edit builds on this one
      return apiPut<MyBirthday>("/anniversaries/my-birthday", next);
    },
    onSuccess: (b, patch) => {
      qc.setQueryData(["my-birthday"], b);
      toast.success(patch.declined ? "Okay — we won't ask again. You can share any time in Settings" : b.share && b.date ? "Birthday saved — your bouquets will see it" : "Birthday saved");
    },
    onError: () => toast.error("Couldn't save your birthday"),
  });
  return { q, b: q.data ?? EMPTY_BDAY, save };
}

/** Nudge for bouquet members who haven't shared their birthday (until they share or say no). */
export function BirthdayNudgeCard() {
  const { q, b, save } = useMyBirthday();
  const sharing = useQuery({ queryKey: ["sharing"], queryFn: () => apiGet<SharingState>("/sharing") });
  const [m, setM] = useState(0);
  const [d, setD] = useState(0);
  if (!q.data || !sharing.data?.joined.length || (b.date && b.share) || b.declined) return null;
  const pickedDate = b.date ?? (m && d ? `${String(m).padStart(2, "0")}-${String(Math.min(d, new Date(2024, m, 0).getDate())).padStart(2, "0")}` : null);
  return (
    <Card className="border-pink-400/50 bg-gradient-to-br from-pink-500/10 to-amber-400/10" data-testid="birthday-nudge-card">
      <CardHeader>
        <CardTitle className="font-heading">Share your birthday with your bouquets? 🎈</CardTitle>
        <CardDescription>Your friends can only remember it if they can see it — it shows in their Anniversaries with a heads-up a week before.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {!b.date && (
          <>
            <Select value={d ? String(d) : ""} onValueChange={(v) => setD(Number(v))}>
              <SelectTrigger className="w-20" data-testid="birthday-nudge-day" aria-label="Day"><SelectValue placeholder="Day">{d || "Day"}</SelectValue></SelectTrigger>
              <SelectContent>{Array.from({ length: 31 }, (_, i) => <SelectItem key={i} value={String(i + 1)}>{i + 1}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={m ? String(m) : ""} onValueChange={(v) => setM(Number(v))}>
              <SelectTrigger className="w-24" data-testid="birthday-nudge-month" aria-label="Month"><SelectValue placeholder="Month">{m ? MONTHS[m - 1] : "Month"}</SelectValue></SelectTrigger>
              <SelectContent>{MONTHS.map((x, i) => <SelectItem key={x} value={String(i + 1)}>{x}</SelectItem>)}</SelectContent>
            </Select>
          </>
        )}
        <Button size="sm" disabled={!pickedDate || save.isPending} onClick={() => save.mutate({ date: pickedDate, share: true })} data-testid="birthday-nudge-share">
          🎂 {b.date ? "Share my birthday" : "Share it"}
        </Button>
        <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => save.mutate({ declined: true })} data-testid="birthday-nudge-decline">
          Don&apos;t want to share
        </Button>
      </CardContent>
    </Card>
  );
}

/** Settings: your own birthday, optionally shared with everyone in your bouquets. */
export function MyBirthdayCard() {
  const { b, save } = useMyBirthday();
  const [yearText, setYearText] = useState<string | null>(null);
  const shownYear = yearText ?? (b.year ? String(b.year) : "");
  const [m, d] = b.date ? b.date.split("-").map(Number) : [0, 0];
  const setMD = (mm: number, dd: number) => save.mutate({ date: `${String(mm).padStart(2, "0")}-${String(Math.min(dd, new Date(2024, mm, 0).getDate())).padStart(2, "0")}` });
  return (
    <Card data-testid="my-birthday-card">
      <CardHeader>
        <CardTitle className="font-heading">Your birthday 🎈</CardTitle>
        <CardDescription>Choose whether people in your bouquets see it in their Anniversaries. Add your birth year and they&apos;ll see your age too.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Select value={d ? String(d) : ""} onValueChange={(v) => setMD(m || 1, Number(v))}>
          <SelectTrigger className="w-20" data-testid="my-birthday-day" aria-label="Day"><SelectValue placeholder="Day">{d || "Day"}</SelectValue></SelectTrigger>
          <SelectContent>{Array.from({ length: 31 }, (_, i) => <SelectItem key={i} value={String(i + 1)}>{i + 1}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={m ? String(m) : ""} onValueChange={(v) => setMD(Number(v), d || 1)}>
          <SelectTrigger className="w-24" data-testid="my-birthday-month" aria-label="Month"><SelectValue placeholder="Month">{m ? MONTHS[m - 1] : "Month"}</SelectValue></SelectTrigger>
          <SelectContent>{MONTHS.map((x, i) => <SelectItem key={x} value={String(i + 1)}>{x}</SelectItem>)}</SelectContent>
        </Select>
        <Input inputMode="numeric" maxLength={4} placeholder="Year" aria-label="Birth year (optional)" className="w-24"
          value={shownYear} disabled={!b.date}
          onChange={(e) => {
            const y = e.target.value.replace(/\D/g, "").slice(0, 4);
            setYearText(y);
            if (y.length === 4 && Number(y) >= 1900 && Number(y) !== b.year) save.mutate({ year: Number(y) });
            if (!y && b.year) save.mutate({ year: null });
          }}
          data-testid="my-birthday-year" />
        <label htmlFor="my-birthday-share" className="flex items-center gap-2.5 text-sm">
          <Checkbox id="my-birthday-share" checked={b.share} disabled={!b.date} onCheckedChange={(v) => save.mutate({ share: v === true })} data-testid="my-birthday-share" />
          Share with my bouquets
        </label>
        {b.date && !b.share && (
          <p className="w-full text-xs text-amber-700 dark:text-amber-300" data-testid="my-birthday-not-shared">Not shared yet — tick the box so your bouquets see it in their Anniversaries.</p>
        )}
      </CardContent>
    </Card>
  );
}

const when = (d: number) => (d === 0 ? "Today" : d === 1 ? "Tomorrow" : d === 7 ? "In 1 week" : "In a month — time to plan");

export function AnniversaryHeadsUp({ className }: { className?: string }) {
  const q = useQuery({ queryKey: ["anniversaries", "heads-up"], queryFn: () => apiGet<UpcomingEvent[]>("/anniversaries/heads-up") });
  if (!q.data?.length) return null;
  return (
    <Card size="sm" className={className} data-testid="anniversary-heads-up">
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 font-heading text-base"><CalendarHeart className="size-4 text-pink-500" /> Coming up</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-wrap gap-2">
          {q.data.map((e) => (
            <li key={e.id} className="flex items-center gap-2 rounded-full bg-pink-500/10 px-3 py-1 text-sm" data-testid={`heads-up-${e.id}`}>
              <span>{e.emoji}</span>
              <span className="font-medium">{e.kind === "birthday" ? (e.years ? `${e.title} turns ${e.years}` : `${e.title}'s birthday`) : e.kind === "anniversary" && e.years ? `${e.title} · ${e.years} years` : e.title}</span>
              {e.milestone && <span className="rounded-full bg-amber-300 px-1.5 text-[10px] font-bold text-amber-950" data-testid={`heads-up-milestone-${e.id}`}>✨ {e.milestone}</span>}
              <span className="text-xs text-muted-foreground">{when(e.daysUntil)}</span>
              {e.daysUntil > 0 && !!(e.custom?.gifts ?? e.gifts).filter((g) => !g.bought).length && (
                <span className="text-xs text-pink-700 dark:text-pink-300" data-testid={`heads-up-gifts-${e.id}`}>
                  🎁 {(e.custom?.gifts ?? e.gifts).filter((g) => !g.bought).map((g) => g.text).join(", ")}
                </span>
              )}
            </li>
          ))}
          <li><Link to="/anniversaries" className="text-xs text-primary underline" data-testid="heads-up-all">All anniversaries</Link></li>
        </ul>
      </CardContent>
    </Card>
  );
}

export function HolidaySetsCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["holiday-sets"], queryFn: () => apiGet<HolidaySetState[]>("/anniversaries/holiday-sets") });
  const save = useMutation({
    mutationFn: (sets: string[]) => apiPut<HolidaySetState[]>("/anniversaries/holiday-sets", { sets }),
    onSuccess: (s) => { qc.setQueryData(["holiday-sets"], s); qc.invalidateQueries({ queryKey: ["anniversaries"] }); toast.success("Holidays updated"); },
    onError: () => toast.error("Couldn't update holidays"),
  });
  const sets = q.data ?? [];
  const groups = [...new Set(sets.map((s) => s.group))];
  const toggle = (id: string, on: boolean) => save.mutate(sets.filter((s) => (s.id === id ? on : s.enabled)).map((s) => s.id));
  return (
    <Card id="holidays" data-testid="holiday-sets-card">
      <CardHeader>
        <CardTitle className="font-heading">Holidays in Anniversaries</CardTitle>
        <CardDescription>Pick which holidays get countdowns and a heads-up in your morning briefing. Lunar dates can differ by a day locally.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        {groups.map((g) => (
          <div key={g} className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g === "Religious" ? "By religion" : g}</p>
            {sets.filter((s) => s.group === g).map((s) => (
              <label key={s.id} htmlFor={`holiday-set-${s.id}`} className="flex items-center gap-2.5 text-sm">
                <Checkbox id={`holiday-set-${s.id}`} checked={s.enabled} disabled={save.isPending} onCheckedChange={(v) => toggle(s.id, v === true)} data-testid={`holiday-set-${s.id}`} />
                {s.label}
              </label>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
