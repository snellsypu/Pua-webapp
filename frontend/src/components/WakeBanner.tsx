// Shown when PUA is opened by the wake-up link/notification (/overview?wake=1):
// reads the morning weather + first open morning-routine step aloud. Browsers may
// block speech until the first tap, so the text is always shown with a play button.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { AlarmClockOff, Loader2, Volume2, X } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { VoiceTranscript } from "@/lib/types";
import { speak, speechOutputSupported, stopSpeaking } from "@/lib/speech";
import { Button } from "@/components/ui/button";

export function WakeBanner({ onDismiss }: { onDismiss: () => void }) {
  const wake = useQuery({
    queryKey: ["wake-text"],
    queryFn: () => apiGet<VoiceTranscript>("/voice/wake"),
    staleTime: 0,
  });
  const [state, setState] = useState<"idle" | "speaking" | "blocked" | "done">("idle");
  const tried = useRef(false);

  const play = async (text: string) => {
    setState("speaking");
    const ok = await speak(text);
    setState(ok ? "done" : "blocked");
  };

  useEffect(() => {
    if (wake.data && !tried.current && speechOutputSupported()) {
      tried.current = true;
      void play(wake.data.text);
    }
  }, [wake.data]);

  useEffect(() => () => stopSpeaking(), []);

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-3xl border border-amber-500/30 bg-amber-400/10 p-5"
      data-testid="wake-banner"
    >
      <button
        type="button"
        aria-label="Dismiss"
        data-testid="wake-dismiss-button"
        onClick={() => {
          stopSpeaking();
          onDismiss();
        }}
        className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
        <AlarmClockOff className="size-4" /> Wake-up
      </p>
      <p className="mt-2 max-w-2xl pr-6 text-base leading-relaxed" data-testid="wake-text">
        {wake.isLoading ? "…" : (wake.data?.text ?? "Couldn't load your morning — pull to refresh.")}
      </p>
      {wake.data && speechOutputSupported() && (
        <Button
          size={state === "blocked" ? "default" : "sm"}
          variant={state === "blocked" ? "default" : "outline"}
          className="mt-3"
          data-testid="wake-play-button"
          disabled={state === "speaking"}
          onClick={() => void play(wake.data.text)}
        >
          {state === "speaking" ? <Loader2 className="size-4 animate-spin" /> : <Volume2 className="size-4" />}
          {state === "blocked" ? "Tap to hear your morning" : state === "speaking" ? "Reading…" : "Read again"}
        </Button>
      )}
    </motion.section>
  );
}

export const WAKE_FIRST_OPEN_KEY = "pua:wake-first-open";
const LAST_WAKE_KEY = "pua:last-wake";
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** The day's wake-up read happened (link, notification or first open) — don't repeat it. */
export const markWoken = (date: string) => localStorage.setItem(LAST_WAKE_KEY, date);

/**
 * "Read my morning the first time I open PUA" (device-local): the first app open in
 * the 3 hours after the wake-up time jumps to /overview?wake=1 — works with phone
 * routines that can only open an app (Samsung: alarm dismissed → open PUA).
 */
export function shouldWakeOnOpen(dp: { date: string; localTime: string }, wakeTime: string): boolean {
  if (localStorage.getItem(WAKE_FIRST_OPEN_KEY) !== "1") return false;
  if (localStorage.getItem(LAST_WAKE_KEY) === dp.date) return false;
  const since = toMin(dp.localTime) - toMin(wakeTime);
  return since >= 0 && since < 180;
}
