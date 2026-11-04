import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, BellOff, BellRing, Smartphone } from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import type { PushSendResult, RoutineState } from "@/lib/types";
import { currentSubscription, disablePush, enablePush, pushSupport } from "@/lib/push";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

export function NotificationsCard() {
  const qc = useQueryClient();
  const support = pushSupport();
  const sub = useQuery({
    queryKey: ["push-subscription"],
    queryFn: async () => !!(await currentSubscription()),
    enabled: support === "supported",
  });
  const routines = useQuery({
    queryKey: ["routines"],
    queryFn: () => apiGet<RoutineState[]>("/routines"),
  });
  const subscribed = sub.data === true;
  const permission = support === "supported" ? Notification.permission : "default";

  const setNotify = useMutation({
    mutationFn: (v: { kind: string; notify: boolean }) =>
      apiPut<RoutineState>(`/routines/${v.kind}`, { notify: v.notify }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["routines"] }),
    onError: () => toast.error("Could not update the routine"),
  });

  const enable = useMutation({
    mutationFn: async () => {
      await enablePush();
      // Turning notifications on means both routine reminders, unless already set.
      for (const r of routines.data ?? []) {
        if (!r.notify) await apiPut(`/routines/${r.kind}`, { notify: true });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["push-subscription"] });
      qc.invalidateQueries({ queryKey: ["routines"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Notifications on for this device");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not turn on notifications"),
  });

  const disable = useMutation({
    mutationFn: disablePush,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["push-subscription"] });
      toast.success("Notifications off for this device");
    },
    onError: () => toast.error("Could not turn off notifications"),
  });

  const test = useMutation({
    mutationFn: () => apiPost<PushSendResult>("/push/test"),
    onSuccess: (r) =>
      r.sent
        ? toast.success(`Test sent to ${r.sent} device${r.sent === 1 ? "" : "s"}`)
        : toast.error("No device received it — try turning notifications off and on"),
    onError: () => toast.error("Could not send the test"),
  });

  return (
    <Card data-testid="notifications-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading">
          <BellRing className="size-4" /> Routine notifications
        </CardTitle>
        <CardDescription>
          Get a push notification at your morning and bedtime routine times, even when PUA
          is closed. They can arrive up to 15 minutes after the set time, and are skipped if the
          routine is already done.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {support === "unsupported" && (
          <p className="text-sm text-muted-foreground" data-testid="push-unsupported">
            This browser can&apos;t receive push notifications. Try Chrome or Samsung Internet.
          </p>
        )}
        {support === "needs-install" && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="push-needs-install">
            <Smartphone className="mt-0.5 size-4 shrink-0" /> On iPhone/iPad, first add PUA
            to your Home Screen (Share → Add to Home Screen), open it from there, then turn
            notifications on.
          </p>
        )}
        {support === "supported" && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={subscribed ? "default" : "secondary"}
              data-testid="push-status-badge"
            >
              {subscribed ? "On for this device" : permission === "denied" ? "Blocked in browser" : "Off"}
            </Badge>
            {subscribed ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="push-test-button"
                  disabled={test.isPending}
                  onClick={() => test.mutate()}
                >
                  <Bell className="size-4" /> Send test
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="push-disable-button"
                  disabled={disable.isPending}
                  onClick={() => disable.mutate()}
                >
                  <BellOff className="size-4" /> Turn off
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                data-testid="push-enable-button"
                disabled={enable.isPending || permission === "denied"}
                onClick={() => enable.mutate()}
              >
                <Bell className="size-4" /> Turn on notifications
              </Button>
            )}
          </div>
        )}
        {permission === "denied" && (
          <p className="text-xs text-destructive">
            Notifications are blocked for this site — allow them in your browser&apos;s site settings.
          </p>
        )}
        <div className="grid gap-2">
          {(routines.data ?? []).map((r) => (
            <label
              key={r.kind}
              htmlFor={`notify-${r.kind}`}
              className="flex items-center gap-2.5 rounded-xl border p-3"
            >
              <Checkbox
                id={`notify-${r.kind}`}
                checked={r.notify}
                onCheckedChange={(c) => setNotify.mutate({ kind: r.kind, notify: c === true })}
                data-testid={`routine-notify-${r.kind}`}
              />
              <span className="text-sm">
                {r.title} at <span className="font-mono">{r.time}</span>
              </span>
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
