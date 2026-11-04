// Settings: when the overview flips to tomorrow, plus the two wake-up triggers —
// a link for the phone's alarm routine and an optional wake-up notification.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlarmClock, Copy } from "lucide-react";
import { apiGet, apiPut } from "@/lib/api";
import type { AppSettings, SettingsUpdate } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WAKE_FIRST_OPEN_KEY } from "@/components/WakeBanner";

export function OverviewWakeCard() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const [review, setReview] = useState("18:00");
  const [wakeTime, setWakeTime] = useState("07:00");
  useEffect(() => {
    if (settings.data) {
      setReview(settings.data.reviewTime);
      setWakeTime(settings.data.wakeTime);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (u: SettingsUpdate) => apiPut<AppSettings>("/settings", u),
    onSuccess: (s, u) => {
      qc.setQueryData(["settings"], s);
      qc.invalidateQueries({ queryKey: ["daypart"] });
      toast.success(
        u.reviewTime ? `Overview switches at ${s.reviewTime}` : u.wakeNotify !== undefined
          ? s.wakeNotify ? `Wake-up notification at ${s.wakeTime}` : "Wake-up notification off"
          : `Wake-up time ${s.wakeTime}`,
      );
    },
    onError: () => toast.error("Could not save"),
  });

  const [firstOpen, setFirstOpen] = useState(() => localStorage.getItem(WAKE_FIRST_OPEN_KEY) === "1");
  const toggleFirstOpen = (on: boolean) => {
    localStorage.setItem(WAKE_FIRST_OPEN_KEY, on ? "1" : "0");
    setFirstOpen(on);
    toast.success(on ? "PUA will read your morning the first time you open it after wake-up" : "Read on first open off");
  };
  const link = `${window.location.origin}/overview?wake=1`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Wake-up link copied");
    } catch {
      toast.error("Couldn't copy — press and hold the link to copy it");
    }
  };

  return (
    <Card data-testid="overview-wake-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading">
          <AlarmClock className="size-4" /> Overview &amp; wake-up
        </CardTitle>
        <CardDescription>
          The overview shows today&apos;s briefing, then switches to tomorrow&apos;s review in the evening.
          After your alarm, PUA reads the morning weather and the first step of your morning routine.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="review-time">Switch to tomorrow&apos;s review at</Label>
            <Input id="review-time" type="time" className="w-32" value={review}
              onChange={(e) => setReview(e.target.value)} data-testid="settings-review-time" />
          </div>
          <Button size="sm" variant="outline" data-testid="settings-review-time-save"
            disabled={!review || review === settings.data?.reviewTime || save.isPending}
            onClick={() => save.mutate({ reviewTime: review })}>
            Save
          </Button>
        </div>

        <div className="space-y-2 rounded-xl border p-3">
          <p className="text-sm font-medium">1 · Phone alarm routine (reads it when you dismiss the alarm)</p>
          <p className="text-xs text-muted-foreground">
            First add PUA to your home screen (browser menu → <i>Add to home screen</i>) and tick the box below.{" "}
            <b>Samsung:</b> Settings → Modes and Routines → Routines → + → If: <i>Selected alarm dismissed</i> →
            Then: <i>Open an app</i> → PUA. <b>Other phones / automation apps</b> that can open a link can use
            the link below instead. Some phones need one tap on the page before PUA can speak.
          </p>
          <label htmlFor="wake-first-open" className="flex items-start gap-2.5">
            <Checkbox id="wake-first-open" checked={firstOpen} onCheckedChange={(c) => toggleFirstOpen(c === true)}
              data-testid="settings-wake-first-open" />
            <span className="text-sm">
              Read my morning the first time I open PUA after my wake-up time
              <span className="block text-xs text-muted-foreground">Once a day, up to 3 hours after it · this device only</span>
            </span>
          </label>
          <div className="flex gap-2">
            <Input readOnly value={link} className="font-mono text-xs" data-testid="settings-wake-link"
              onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" variant="outline" onClick={() => void copy()} data-testid="settings-wake-link-copy">
              <Copy className="size-4" /> Copy
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border p-3">
          <label htmlFor="wake-notify" className="flex items-start gap-2.5">
            <Checkbox id="wake-notify" checked={settings.data?.wakeNotify ?? false}
              disabled={save.isPending || settings.isLoading}
              onCheckedChange={(c) => save.mutate({ wakeNotify: c === true })} data-testid="settings-wake-notify" />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">2 · Wake-up notification</span>
              <span className="text-xs text-muted-foreground">
                A notification at your wake-up time (within 5 minutes) — tap it and PUA reads your morning.
                Needs notifications turned on for this device below. The wake-up time also starts the
                &ldquo;first open&rdquo; window above.
              </span>
            </span>
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="wake-time">Wake-up time</Label>
              <Input id="wake-time" type="time" className="w-32" value={wakeTime}
                onChange={(e) => setWakeTime(e.target.value)} data-testid="settings-wake-time" />
            </div>
            <Button size="sm" variant="outline" data-testid="settings-wake-time-save"
              disabled={!wakeTime || wakeTime === settings.data?.wakeTime || save.isPending}
              onClick={() => save.mutate({ wakeTime })}>
              Save
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
