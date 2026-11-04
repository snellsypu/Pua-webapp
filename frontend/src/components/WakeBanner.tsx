// Read-out banners on the overview:
//  - wake (/overview?wake=1): morning weather, first open routine step, commute to the
//    first appointment (Premium + live location: from where the phone is).
//  - bedtime (/overview?bedtime=1): tomorrow's weather, first appointment + commute, meals.
// Browsers may block speech until the first tap, so the text is always shown with a play button.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { AlarmClockOff, Loader2, MoonStar, Volume2, X } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { AppSettings, VoiceTranscript } from "@/lib/types";
import { speak, speechOutputSupported, stopSpeaking } from "@/lib/speech";
import { Button } from "@/components/ui/button";
import { HandsFreeRoutine } from "@/components/HandsFreeRoutine";
import { cn } from "@/lib/utils";

function livePosition(): Promise<{ lat: number; lon: number } | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 120_000 },
    ),
  );
}

export function WakeBanner({ kind = "wake", onDismiss }: { kind?: "wake" | "bedtime"; onDismiss: () => void }) {
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const live = !!settings.data?.premiumVoice && !!settings.data?.liveLocation;
  const text = useQuery({
    queryKey: ["readout", kind, live],
    enabled: settings.isSuccess,
    staleTime: 0,
    queryFn: async () => {
      if (kind === "bedtime") return apiGet<VoiceTranscript>("/voice/bedtime");
      const pos = live ? await livePosition() : null;
      return apiGet<VoiceTranscript>(pos ? `/voice/wake?lat=${pos.lat}&lon=${pos.lon}` : "/voice/wake");
    },
  });
  const [state, setState] = useState<"idle" | "speaking" | "blocked" | "done">("idle");
  const tried = useRef(false);

  const play = async (t: string) => {
    setState("speaking");
    const ok = await speak(t);
    setState(ok ? "done" : "blocked");
  };

  useEffect(() => {
    if (text.data && !tried.current && speechOutputSupported()) {
      tried.current = true;
      void play(text.data.text);
    }
  }, [text.data]);

  useEffect(() => () => stopSpeaking(), []);

  const wake = kind === "wake";
  const Icon = wake ? AlarmClockOff : MoonStar;

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative rounded-3xl border p-5",
        wake ? "border-amber-500/30 bg-amber-400/10" : "border-violet-500/30 bg-violet-400/10",
      )}
      data-testid={wake ? "wake-banner" : "bedtime-banner"}
    >
      <button
        type="button"
        aria-label="Dismiss"
        data-testid={wake ? "wake-dismiss-button" : "bedtime-dismiss-button"}
        onClick={() => {
          stopSpeaking();
          onDismiss();
        }}
        className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <p className={cn("flex items-center gap-2 text-sm font-medium", wake ? "text-amber-700 dark:text-amber-300" : "text-violet-700 dark:text-violet-300")}>
        <Icon className="size-4" /> {wake ? "Wake-up" : "Bedtime"}
      </p>
      <p className="mt-2 max-w-2xl pr-6 text-base leading-relaxed" data-testid={wake ? "wake-text" : "bedtime-text"}>
        {text.isLoading || settings.isLoading ? "…" : (text.data?.text ?? "Couldn't load this — try again in a moment.")}
      </p>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        {text.data && speechOutputSupported() && (
          <Button
            size={state === "blocked" ? "default" : "sm"}
            variant={state === "blocked" ? "default" : "outline"}
            data-testid={wake ? "wake-play-button" : "bedtime-play-button"}
            disabled={state === "speaking"}
            onClick={() => void play(text.data.text)}
          >
            {state === "speaking" ? <Loader2 className="size-4 animate-spin" /> : <Volume2 className="size-4" />}
            {state === "blocked" ? `Tap to hear your ${wake ? "morning" : "tomorrow"}` : state === "speaking" ? "Reading…" : "Read again"}
          </Button>
        )}
        {(state === "done" || state === "blocked") && (
          <HandsFreeRoutine kind={wake ? "morning" : "bedtime"} size="sm" />
        )}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Travel times: © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors ·{" "}
        <a className="underline" href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">fix the map</a>
      </p>
    </motion.section>
  );
}

export const WAKE_FIRST_OPEN_KEY = "pua:wake-first-open";
export const BEDTIME_FIRST_OPEN_KEY = "pua:bedtime-first-open";
const LAST_KEY = { wake: "pua:last-wake", bedtime: "pua:last-bedtime" } as const;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** The day's read-out happened (link, notification or first open) — don't repeat it. */
export const markRead = (kind: "wake" | "bedtime", date: string) => localStorage.setItem(LAST_KEY[kind], date);
export const markWoken = (date: string) => markRead("wake", date);

/**
 * "Read on first open" (device-local): the first app open in the 3 hours after the
 * wake-up / bedtime-routine time jumps to the read-out — works with phone routines
 * that can only open an app (Samsung: alarm dismissed → open PUA).
 */
export function readOnOpen(dp: { date: string; localTime: string; wakeTime: string; bedtimeTime: string }): "wake" | "bedtime" | null {
  const within = (t: string) => {
    const since = toMin(dp.localTime) - toMin(t);
    return since >= 0 && since < 180;
  };
  if (localStorage.getItem(WAKE_FIRST_OPEN_KEY) === "1" && localStorage.getItem(LAST_KEY.wake) !== dp.date && within(dp.wakeTime))
    return "wake";
  if (localStorage.getItem(BEDTIME_FIRST_OPEN_KEY) === "1" && localStorage.getItem(LAST_KEY.bedtime) !== dp.date && within(dp.bedtimeTime))
    return "bedtime";
  return null;
}
