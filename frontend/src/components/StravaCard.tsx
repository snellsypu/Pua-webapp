// Strava link card (Habits page): connect, pick the habit runs tick, sync, disconnect.
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, Loader2, RefreshCw, Unlink } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from "@/lib/api";
import type { HabitStats, StravaConnectOut, StravaStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const RESULT: Record<string, [boolean, string]> = {
  connected: [true, "Strava connected — your runs will tick your habit"],
  denied: [false, "Strava wasn't connected — permission was declined"],
  scope: [false, "PUA needs permission to read your activities — try again and leave it ticked"],
  error: [false, "Couldn't finish connecting to Strava — try again"],
};

export function StravaCard({ habits }: { habits: HabitStats[] }) {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const q = useQuery({ queryKey: ["strava"], queryFn: () => apiGet<StravaStatus>("/strava/status") });
  const set = (s: StravaStatus) => { qc.setQueryData(["strava"], s); qc.invalidateQueries({ queryKey: ["habits"] }); };

  useEffect(() => {
    const r = params.get("strava");
    if (!r) return;
    const [ok, msg] = RESULT[r] ?? [false, "Strava: something went wrong"];
    if (ok) toast.success(msg); else toast.error(msg);
    qc.invalidateQueries({ queryKey: ["strava"] });
    qc.invalidateQueries({ queryKey: ["habits"] });
    params.delete("strava");
    setParams(params, { replace: true });
  }, [params, setParams, qc]);

  const connect = useMutation({
    mutationFn: () => apiPost<StravaConnectOut>("/strava/connect", { origin_url: window.location.origin }),
    onSuccess: (r) => { window.location.href = r.url; },
    onError: (e) => toast.error(e instanceof ApiError && e.status === 503 ? "Strava isn't set up yet" : "Couldn't start connecting to Strava"),
  });
  const link = useMutation({
    mutationFn: (habitId: string | null) => apiPut<StravaStatus>("/strava/habit", { habitId }),
    onSuccess: (s) => { set(s); toast.success(s.habitId ? "Strava runs will tick that habit" : "Strava runs won't tick any habit"); },
    onError: () => toast.error("Couldn't change the linked habit"),
  });
  const sync = useMutation({
    mutationFn: () => apiPost<StravaStatus>("/strava/sync"),
    onSuccess: (s) => { set(s); toast.success(s.lastResult ?? "Synced"); },
    onError: () => toast.error("Couldn't sync Strava"),
  });
  const off = useMutation({
    mutationFn: () => apiDelete<StravaStatus>("/strava"),
    onSuccess: (s) => { set(s); toast.success("Strava disconnected"); },
  });

  const s = q.data;
  if (!s) return null;
  const linked = habits.find((h) => h.id === s.habitId);

  return (
    <Card data-testid="strava-card" className="border-orange-500/30">
      <CardHeader className="flex flex-row flex-wrap items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-[#fc4c02] text-white"><Activity className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <CardTitle className="font-heading">Strava</CardTitle>
          <CardDescription data-testid="strava-status">
            {!s.configured ? "Waiting for the Strava app details to be added."
              : s.connected ? `Connected${s.athleteName ? ` as ${s.athleteName}` : ""}${linked ? ` · runs tick ${linked.emoji} ${linked.name}` : " · pick a habit below"}`
              : "Connect Strava and your runs tick your running habit automatically, with the distance."}
          </CardDescription>
        </div>
        {s.configured && !s.connected && (
          <Button onClick={() => connect.mutate()} disabled={connect.isPending} className="bg-[#fc4c02] text-white hover:bg-[#e04402]" data-testid="strava-connect">
            {connect.isPending && <Loader2 className="size-4 animate-spin" />} Connect with Strava
          </Button>
        )}
      </CardHeader>
      {s.connected && (
        <CardContent className="flex flex-wrap items-center gap-2">
          <Select value={s.habitId ?? "none"} onValueChange={(v) => link.mutate(v === "none" ? null : String(v))}>
            <SelectTrigger className="w-60" data-testid="strava-habit-select" aria-label="Habit Strava runs tick">
              <SelectValue>{linked ? `${linked.emoji} ${linked.name}` : "No habit"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No habit</SelectItem>
              {habits.map((h) => <SelectItem key={h.id} value={h.id} data-testid={`strava-habit-${h.id}`}>{h.emoji} {h.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending || !s.habitId} data-testid="strava-sync">
            <RefreshCw className={sync.isPending ? "size-4 animate-spin" : "size-4"} /> Sync now
          </Button>
          <Button variant="ghost" size="sm" onClick={() => off.mutate()} disabled={off.isPending} data-testid="strava-disconnect"><Unlink className="size-4" /> Disconnect</Button>
          {s.lastResult && <p className="w-full text-xs text-muted-foreground" data-testid="strava-last-result">Last sync: {s.lastResult}</p>}
        </CardContent>
      )}
    </Card>
  );
}
