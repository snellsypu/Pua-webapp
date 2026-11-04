import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Dumbbell, FileArchive, Moon, Trash2, Upload, Utensils } from "lucide-react";
import { apiDelete, apiGet, apiUpload, ApiError } from "@/lib/api";
import type { DayContext, HealthEvent, HealthImportResult, HealthType } from "@/lib/types";
import { addDaysIso, fmtShort } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const META: Record<HealthType, { label: string; icon: typeof Moon; tint: string }> = {
  sleep: { label: "Sleep", icon: Moon, tint: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300" },
  exercise: { label: "Exercise", icon: Dumbbell, tint: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  nutrition: { label: "Food", icon: Utensils, tint: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
};

const fmtMins = (m: number | null) => {
  if (m == null) return null;
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return h ? `${h}h ${mm}m` : `${mm}m`;
};

export default function Health() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [lastResult, setLastResult] = useState<HealthImportResult | null>(null);
  const todayQ = useQuery({
    queryKey: ["overview", 0],
    queryFn: () => apiGet<DayContext>("/overview?offset=0"),
  });
  const today = todayQ.data?.date;
  const from = today ? addDaysIso(today, -13) : undefined;

  const events = useQuery({
    queryKey: ["health", from, today],
    queryFn: () => apiGet<HealthEvent[]>(`/health/events?from=${from}&to=${today}`),
    enabled: !!from && !!today,
  });

  const upload = useMutation({
    mutationFn: (file: File) => apiUpload<HealthImportResult>("/health/import", file),
    onSuccess: (r) => {
      setLastResult(r);
      qc.invalidateQueries({ queryKey: ["health"] });
      toast.success(`Imported ${r.imported} Samsung Health records`);
    },
    onError: (e) => {
      const detail =
        e instanceof ApiError && e.body && typeof e.body === "object" && "detail" in e.body
          ? String((e.body as { detail: unknown }).detail)
          : "Import failed";
      toast.error(detail);
    },
  });

  const clear = useMutation({
    mutationFn: () => apiDelete<{ deleted: number }>("/health/events"),
    onSuccess: (r) => {
      setLastResult(null);
      qc.invalidateQueries({ queryKey: ["health"] });
      toast.success(`Removed ${r.deleted} imported records`);
    },
    onError: () => toast.error("Could not clear health data"),
  });

  const byDate = useMemo(() => {
    const map = new Map<string, HealthEvent[]>();
    for (const e of events.data ?? []) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [events.data]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="space-y-6"
    >
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Health</h1>
        <p className="text-sm text-muted-foreground">
          Food, sleep and exercise from Samsung Health, alongside your days.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading">Import from Samsung Health</CardTitle>
          <CardDescription>
            Samsung Health doesn&apos;t offer a live web connection, so this works by import: on your
            phone open <b>Samsung Health → ☰ Settings → Download personal data</b>, then upload the
            ZIP here. Re-importing a newer export updates without duplicates.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            data-testid="health-file-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = "";
            }}
          />
          <Button
            data-testid="health-upload-button"
            disabled={upload.isPending}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" /> {upload.isPending ? "Importing…" : "Upload export ZIP"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-testid="health-clear-button"
            disabled={clear.isPending || !events.data?.length}
            onClick={() => clear.mutate()}
          >
            <Trash2 className="size-4" /> Remove imported data
          </Button>
          {lastResult && (
            <div className="flex w-full flex-wrap items-center gap-2 pt-2 text-sm" data-testid="health-import-result">
              <FileArchive className="size-4 text-muted-foreground" />
              {lastResult.imported} records:
              {Object.entries(lastResult.byType).map(([t, n]) => (
                <Badge key={t} variant="secondary">
                  {META[t as HealthType]?.label ?? t} {n}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 font-heading text-lg font-semibold">Last 14 days</h2>
        {events.isLoading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        ) : !byDate.length ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground" data-testid="health-empty">
              No health data for the last two weeks yet — upload your Samsung Health export above.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4" data-testid="health-days">
            {byDate.map(([date, list]) => {
              const kcalIn = list
                .filter((e) => e.type === "nutrition")
                .reduce((s, e) => s + (e.calories ?? 0), 0);
              return (
                <Card key={date} data-testid={`health-day-${date}`}>
                  <CardHeader className="flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base">{fmtShort(date)}</CardTitle>
                    {kcalIn > 0 && (
                      <span className="font-mono text-xs text-muted-foreground">{Math.round(kcalIn)} kcal eaten</span>
                    )}
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {list.map((e) => {
                        const m = META[e.type];
                        const Icon = m.icon;
                        const bits = [
                          fmtMins(e.durationMin),
                          e.calories != null ? `${Math.round(e.calories)} kcal` : null,
                          e.proteinG != null ? `P ${Math.round(e.proteinG)}g` : null,
                          e.score != null ? `score ${Math.round(e.score)}` : null,
                        ].filter(Boolean);
                        return (
                          <li key={e.eventId} className="flex items-center gap-3" data-testid={`health-event-${e.eventId}`}>
                            <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${m.tint}`}>
                              <Icon className="size-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{e.title ?? m.label}</div>
                              <div className="font-mono text-xs text-muted-foreground">{bits.join(" · ")}</div>
                            </div>
                            <span className="font-mono text-xs text-muted-foreground">{e.start.slice(11, 16)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
