// Work rota: jobs with a 1–4 week repeating pattern of shifts. They show on the calendar as
// "Working" blocks (not appointments) — bouquet friends who see your appointments see them too.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Briefcase, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import type { Job, JobIn, Shift, WorkBlock, WorkHours } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePaywall, usePremium } from "@/components/Paywall";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { addDaysIso, fmtShort } from "@/lib/dates";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FREE_JOBS = 1;
const JOB_KEYS = ["jobs", "range", "overview", "friends-calendar", "work-blocks", "work-hours"];

export function WorkBlockRow({ b, who }: { b: WorkBlock; who?: string }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-dashed border-sky-500/50 bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(14_165_233/0.08)_6px_12px)] px-3 py-2"
      data-testid={`work-block-${b.jobId}-${b.date}`}>
      <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{b.startTime}–{b.endTime}{b.overnight ? " ⁺¹" : ""}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate text-sm font-medium text-sky-800 dark:text-sky-200">
          <Briefcase className="size-3.5 shrink-0" /> Working · {b.name}
        </span>
        {who && <span className="block text-xs text-muted-foreground">{who}</span>}
      </span>
    </li>
  );
}

export function WorkBlockList({ blocks, who }: { blocks: WorkBlock[]; who?: string }) {
  if (!blocks.length) return null;
  return <ul className="mb-2 space-y-1.5" data-testid="work-blocks">{blocks.map((b) => <WorkBlockRow key={`${b.jobId}-${b.date}`} b={b} who={who} />)}</ul>;
}

function JobEditor({ job, today, onDone }: { job: Job | null; today: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [weeks, setWeeks] = useState(1);
  const [startDate, setStartDate] = useState(today);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [rate, setRate] = useState("");
  const [tab, setTab] = useState(1);
  useEffect(() => {
    setName(job?.name ?? "");
    setWeeks(job?.rotaWeeks ?? 1);
    setStartDate(job?.startDate ?? today);
    setShifts(job?.shifts ?? []);
    setRate(job?.hourlyRate != null ? String(job.hourlyRate) : "");
    setTab(1);
  }, [job, today]);
  const get = (w: number, d: number) => shifts.find((s) => s.week === w && s.weekday === d);
  const set = (w: number, d: number, patch: Partial<Shift> | null) =>
    setShifts((xs) => {
      const rest = xs.filter((s) => !(s.week === w && s.weekday === d));
      if (patch === null) return rest;
      const cur = xs.find((s) => s.week === w && s.weekday === d) ?? { week: w, weekday: d, start: "09:00", end: "17:00" };
      return [...rest, { ...cur, ...patch }];
    });
  const copyWeek1 = () => setShifts((xs) => [...xs.filter((s) => s.week !== tab), ...xs.filter((s) => s.week === 1).map((s) => ({ ...s, week: tab }))]);
  const save = useMutation({
    mutationFn: () => {
      const body: JobIn = { name: name.trim(), rotaWeeks: weeks, startDate, shifts: shifts.filter((s) => s.week <= weeks), hourlyRate: rate.trim() ? Number(rate) : null };
      return job ? apiPut<Job>(`/jobs/${job.id}`, body) : apiPost<Job>("/jobs", body);
    },
    onSuccess: () => {
      for (const k of JOB_KEYS) qc.invalidateQueries({ queryKey: [k] });
      toast.success(job ? "Rota updated" : "Job added — your shifts are on the calendar");
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError && e.status === 402 ? "Premium lets you add more jobs" : "Couldn't save the job"),
  });
  const weekShifts = shifts.filter((s) => s.week <= weeks).length;
  return (
    <div className="min-w-0 space-y-4" data-testid="job-editor">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="job-name">Job</Label>
          <Input id="job-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Café" data-testid="job-name-input" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="job-start">Week 1 starts</Label>
          <Input id="job-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="job-start-input" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="job-rate">Hourly pay (optional)</Label>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground">£</span>
          <Input id="job-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, "").slice(0, 7))}
            placeholder="12.21" className="w-28" data-testid="job-rate-input" />
          <span className="text-sm text-muted-foreground">per hour — used for estimated earnings</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Rota repeats every</Label>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" data-testid="job-rota-weeks">
          {[1, 2, 3, 4].map((w) => (
            <button key={w} type="button" role="radio" aria-checked={weeks === w} onClick={() => { setWeeks(w); if (tab > w) setTab(1); }}
              className={cn("rounded-full px-3 py-1 text-sm ring-1 ring-border transition-[background-color,color] duration-150", weeks === w ? "bg-primary text-primary-foreground ring-primary" : "hover:bg-accent")}
              data-testid={`job-rota-weeks-${w}`}>
              {w} week{w > 1 ? "s" : ""}
            </button>
          ))}
        </div>
      </div>
      {weeks > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="tablist">
          {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => (
            <button key={w} type="button" role="tab" aria-selected={tab === w} onClick={() => setTab(w)}
              className={cn("rounded-lg px-2.5 py-1 text-xs font-medium transition-colors duration-150", tab === w ? "bg-sky-600 text-white" : "bg-muted hover:bg-accent")}
              data-testid={`job-week-tab-${w}`}>
              Week {w}
            </button>
          ))}
          {tab > 1 && <Button type="button" size="xs" variant="ghost" onClick={copyWeek1} data-testid="job-copy-week1">Copy week 1</Button>}
        </div>
      )}
      <ul className="grid gap-1.5" data-testid={`job-week-${tab}`}>
        {DAYS.map((d, i) => {
          const sh = get(tab, i);
          return (
            <li key={d} className={cn("flex items-center gap-2 rounded-xl border px-2.5 py-1.5 transition-colors duration-150", sh && "border-sky-500/50 bg-sky-500/5")}>
              <label htmlFor={`job-day-${tab}-${i}`} className="flex w-14 shrink-0 items-center gap-2 text-sm font-medium">
                <Checkbox id={`job-day-${tab}-${i}`} checked={!!sh} onCheckedChange={(v) => set(tab, i, v === true ? {} : null)} data-testid={`job-day-${tab}-${i}`} />
                {d}
              </label>
              {sh ? (
                <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1">
                  <Input type="time" value={sh.start} onChange={(e) => e.target.value && set(tab, i, { start: e.target.value })} className="h-8 w-full min-w-0 px-1.5 text-xs" aria-label={`${d} start`} data-testid={`job-start-${tab}-${i}`} />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input type="time" value={sh.end} onChange={(e) => e.target.value && set(tab, i, { end: e.target.value })} className="h-8 w-full min-w-0 px-1.5 text-xs" aria-label={`${d} end`} data-testid={`job-end-${tab}-${i}`} />
                </span>
              ) : <span className="text-xs text-muted-foreground">Off</span>}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">An end time earlier than the start means the shift finishes the next morning.</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone} data-testid="job-cancel">Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={!name.trim() || !weekShifts || save.isPending} data-testid="job-save">Save job</Button>
      </div>
    </div>
  );
}

/** Jobs list + editor (used on the Work page and in the calendar's dialog). */
export function WorkRotaManager({ today }: { today: string }) {
  const qc = useQueryClient();
  const premium = usePremium();
  const openPaywall = usePaywall();
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => apiGet<Job[]>("/jobs") });
  const [editing, setEditing] = useState<Job | "new" | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/jobs/${id}`),
    onSuccess: () => { for (const k of JOB_KEYS) qc.invalidateQueries({ queryKey: [k] }); toast.success("Job removed"); },
    onError: () => toast.error("Couldn't remove the job"),
  });
  const list = jobs.data ?? [];
  const locked = !premium.data?.active && list.length >= FREE_JOBS;
  if (editing) return <JobEditor job={editing === "new" ? null : editing} today={today} onDone={() => setEditing(null)} />;
  return (
    <div className="space-y-3">
      <ul className="grid gap-2" data-testid="jobs-list">
        {list.map((j) => (
          <li key={j.id} className="flex items-center gap-3 rounded-xl border bg-card/70 px-3 py-2.5" data-testid={`job-${j.id}`}>
            <span className="grid size-9 place-items-center rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-300"><Briefcase className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{j.name}</span>
              <span className="block text-xs text-muted-foreground">
                {j.shifts.length} shift{j.shifts.length === 1 ? "" : "s"} · {j.rotaWeeks}-week rota{j.hourlyRate != null ? ` · £${j.hourlyRate}/h` : ""}
              </span>
            </span>
            <Button size="icon-sm" variant="ghost" aria-label={`Edit ${j.name}`} onClick={() => setEditing(j)} data-testid={`job-edit-${j.id}`}><Pencil className="size-4" /></Button>
            <Button size="icon-sm" variant="ghost" aria-label={`Delete ${j.name}`} onClick={() => del.mutate(j.id)} disabled={del.isPending} data-testid={`job-delete-${j.id}`}><Trash2 className="size-4" /></Button>
          </li>
        ))}
        {!list.length && !jobs.isLoading && <li className="text-sm text-muted-foreground">No jobs yet — add one and set its rota.</li>}
      </ul>
      <Button variant={locked ? "outline" : "default"} onClick={() => (locked ? openPaywall("More than one job") : setEditing("new"))} data-testid="job-add-button">
        {locked ? <Lock className="size-4" /> : <Plus className="size-4" />} {locked ? "Add another job (Premium)" : "Add a job"}
      </Button>
    </div>
  );
}

export function WorkRotaDialog({ open, onOpenChange, today }: { open: boolean; onOpenChange: (o: boolean) => void; today: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-x-hidden overflow-y-auto sm:max-w-lg" data-testid="work-rota-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading"><Briefcase className="size-5" /> Work rota</DialogTitle>
          <DialogDescription>Your shifts show on the calendar as &ldquo;Working&rdquo; — they aren&apos;t appointments. Bouquets that see your appointments see them too.</DialogDescription>
        </DialogHeader>
        {open && <WorkRotaManager today={today} />}
      </DialogContent>
    </Dialog>
  );
}

const hrs = (h: number) => (Number.isInteger(h) ? `${h}` : h.toFixed(1));
const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Hours (and estimated pay, when a job has a rate) this week and this month. */
export function WorkHoursCard() {
  const q = useQuery({ queryKey: ["work-hours"], queryFn: () => apiGet<WorkHours>("/stats/work") });
  const w = q.data;
  if (!w?.jobs.length) return null;
  const month = format(parseISO(`${w.month}-01T12:00:00`), "MMMM");
  const totalW = w.jobs.reduce((n, j) => n + j.weekHours, 0);
  const totalM = w.jobs.reduce((n, j) => n + j.monthHours, 0);
  return (
    <Card data-testid="stats-work-hours-card">
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 font-heading"><Briefcase className="size-4 text-sky-600" /> Hours &amp; earnings</CardTitle>
        <p className="text-xs text-muted-foreground">This week ({fmtShort(w.weekStart)} – {fmtShort(w.weekEnd)}) and all of {month}, from your rota. Pay is an estimate before tax.</p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {w.jobs.map((j) => (
            <li key={j.jobId} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-2.5" data-testid={`stats-work-${j.jobId}`}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{j.name}</span>
                <span className="block text-[11px] text-muted-foreground">{j.hourlyRate != null ? `£${j.hourlyRate}/hour` : "Add a rate to see pay"}</span>
              </span>
              <span className="text-right">
                <span className="block font-heading text-xl font-bold" data-testid={`stats-work-week-${j.jobId}`}>{hrs(j.weekHours)}h</span>
                {j.weekPay != null && <span className="block text-sm font-semibold text-emerald-700 dark:text-emerald-300" data-testid={`stats-work-week-pay-${j.jobId}`}>{gbp(j.weekPay)}</span>}
                <span className="block text-[11px] text-muted-foreground">this week · {j.weekShifts} shift{j.weekShifts === 1 ? "" : "s"}</span>
              </span>
              <span className="text-right">
                <span className="block font-heading text-xl font-bold" data-testid={`stats-work-month-${j.jobId}`}>{hrs(j.monthHours)}h</span>
                {j.monthPay != null && <span className="block text-sm font-semibold text-emerald-700 dark:text-emerald-300" data-testid={`stats-work-month-pay-${j.jobId}`}>{gbp(j.monthPay)}</span>}
                <span className="block text-[11px] text-muted-foreground">{month} · {j.monthShifts} shift{j.monthShifts === 1 ? "" : "s"}</span>
              </span>
            </li>
          ))}
          {w.jobs.length > 1 && (
            <li className="grid grid-cols-[1fr_auto_auto] gap-4 pt-2.5 text-sm font-semibold" data-testid="stats-work-total">
              <span>All jobs</span>
              <span className="text-right">{hrs(totalW)}h{w.weekPay != null && <span className="block text-emerald-700 dark:text-emerald-300">{gbp(w.weekPay)}</span>}</span>
              <span className="text-right">{hrs(totalM)}h{w.monthPay != null && <span className="block text-emerald-700 dark:text-emerald-300">{gbp(w.monthPay)}</span>}</span>
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Shifts that overlap an appointment on `date` (incl. last night's overnight shift running into it). */
export function useShiftClash(date: string, start: string, end: string | null | undefined) {
  const prev = date ? addDaysIso(date, -1) : "";
  const q = useQuery({
    queryKey: ["work-blocks", date],
    queryFn: () => apiGet<WorkBlock[]>(`/jobs/blocks?from=${prev}&to=${date}`),
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date) && !!start,
    staleTime: 60_000,
  });
  if (!q.data || !start) return [];
  const a0 = mins(start);
  const a1 = end && mins(end) > a0 ? mins(end) : a0 + 60; // no end → assume an hour
  return q.data.filter((b) => {
    const s = mins(b.startTime);
    const e = mins(b.endTime) + (b.overnight ? 1440 : 0);
    const [b0, b1] = b.date === date ? [s, e] : b.overnight ? [s - 1440, e - 1440] : [0, 0];
    return b0 < a1 && a0 < b1;
  });
}

export function ShiftClashNote({ date, start, end }: { date: string; start: string; end?: string | null }) {
  const clashes = useShiftClash(date, start, end);
  if (!clashes.length) return null;
  return (
    <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-900 animate-in fade-in slide-in-from-top-1 dark:text-amber-200" data-testid="appointment-shift-clash">
      <Briefcase className="mt-0.5 size-3.5 shrink-0" />
      <span>Heads up — this overlaps your {clashes.map((b) => `${b.name} shift (${b.startTime}–${b.endTime})`).join(" and ")}. You can still save it.</span>
    </p>
  );
}
