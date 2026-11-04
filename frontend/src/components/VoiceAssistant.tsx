// PUA voice assistant: mic button (left of the + button) and "hey PUA" wake word.
// Flow: listen → understand (free phrases, or Premium AI) → editable preview →
// say "yes" to save or "go back" to try again (buttons do the same).
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { CalendarPlus, Bell, ListChecks, Loader2, Mic, MicOff, RotateCcw, Sparkles } from "lucide-react";
import { apiGet, apiPost, apiUpload, ApiError } from "@/lib/api";
import type { AppSettings, VoiceDraft, VoiceParseIn, VoiceParseOut, VoiceTranscript } from "@/lib/types";
import {
  browserSpeechSupported,
  listenOnce,
  matchConfirm,
  recordClip,
  recorderSupported,
  startWakeListener,
} from "@/lib/speech";
import { fmtShort } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Phase = "idle" | "listening" | "thinking" | "preview" | "saving";
export const WAKE_KEY = "pua:wake";
export const WAKE_EVENT = "pua:wake-changed";

const KIND_META = {
  appointment: { label: "Appointment", icon: CalendarPlus },
  reminder: { label: "Reminder", icon: Bell },
  habit: { label: "Habit", icon: ListChecks },
} as const;

const errText = (e: unknown) =>
  e instanceof ApiError && e.body && typeof e.body === "object" && "detail" in e.body
    ? String((e.body as { detail: unknown }).detail)
    : e instanceof Error
      ? e.message
      : "Something went wrong";

export function VoiceAssistant() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const premium = settings.data?.premiumVoice ?? false;

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const [usedAi, setUsedAi] = useState(false);
  const [wake, setWake] = useState(() => localStorage.getItem(WAKE_KEY) === "1");

  const abortRef = useRef<AbortController | null>(null);
  const draftRef = useRef<VoiceDraft | null>(null);
  const phaseRef = useRef<Phase>("idle");
  draftRef.current = draft;
  phaseRef.current = phase;

  useEffect(() => {
    const sync = () => setWake(localStorage.getItem(WAKE_KEY) === "1");
    window.addEventListener(WAKE_EVENT, sync);
    return () => window.removeEventListener(WAKE_EVENT, sync);
  }, []);

  const freshSignal = () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    return abortRef.current.signal;
  };

  const save = useMutation({
    mutationFn: async (d: VoiceDraft) => {
      if (d.kind === "appointment")
        return apiPost("/appointments", {
          title: d.title, date: d.date, startTime: d.startTime ?? "09:00",
          endTime: d.endTime || null, location: d.location, notes: "",
        });
      if (d.kind === "reminder")
        return apiPost("/reminders", { title: d.title, date: d.date, time: d.time ?? "09:00" });
      return apiPost("/habits", {
        name: d.title, emoji: d.emoji, mode: d.habitMode,
        monthlyTarget: d.monthlyTarget, tracksDistance: d.tracksDistance,
      });
    },
    onSuccess: (_r, d) => {
      for (const k of ["overview", "range", "habits"]) qc.invalidateQueries({ queryKey: [k] });
      toast.success(`${KIND_META[d.kind].label} added — ${d.title}`);
      close();
    },
    onError: (e) => {
      setPhase("preview");
      toast.error(errText(e));
    },
  });

  const confirmLoop = useCallback(async () => {
    if (!browserSpeechSupported()) return; // buttons only
    for (let attempt = 0; attempt < 4 && phaseRef.current === "preview"; attempt++) {
      let heard = "";
      try {
        heard = await listenOnce({ signal: freshSignal() });
      } catch {
        return;
      }
      if (phaseRef.current !== "preview") return;
      const verdict = matchConfirm(heard);
      if (verdict === "yes" && draftRef.current) {
        setPhase("saving");
        save.mutate(draftRef.current);
        return;
      }
      if (verdict === "back") {
        void startRef.current();
        return;
      }
    }
  }, [save]); // eslint-disable-line react-hooks/exhaustive-deps

  const understand = useCallback(
    async (text: string) => {
      setTranscript(text);
      setPhase("thinking");
      try {
        const body: VoiceParseIn = { text, mode: premium ? "ai" : "simple" };
        const out = await apiPost<VoiceParseOut>("/voice/parse", body);
        if (out.draft) {
          setDraft(out.draft);
          setUsedAi(out.mode === "ai");
          setPhase("preview");
          setTimeout(() => void confirmLoop(), 50);
        } else {
          setMessage(out.message ?? "I couldn't understand that.");
          setPhase("idle");
        }
      } catch (e) {
        setMessage(errText(e));
        setPhase("idle");
      }
    },
    [premium, confirmLoop],
  );

  const start = useCallback(
    async (prefill?: string) => {
      setOpen(true);
      setMessage(null);
      setDraft(null);
      setInterim("");
      setTranscript("");
      if (prefill) return understand(prefill);
      setPhase("listening");
      try {
        let text = "";
        if (premium && recorderSupported()) {
          const blob = await recordClip({ signal: freshSignal(), onLevel: setLevel });
          if (phaseRef.current !== "listening") return;
          setPhase("thinking");
          const ext = blob.type.includes("mp4") ? "mp4" : "webm";
          const file = new File([blob], `command.${ext}`, { type: blob.type.split(";")[0] || "audio/webm" });
          text = (await apiUpload<VoiceTranscript>("/voice/transcribe", file)).text;
        } else if (browserSpeechSupported()) {
          text = await listenOnce({ onInterim: setInterim, signal: freshSignal() });
        } else {
          throw new Error(
            "Voice needs Chrome, Edge, Safari or Samsung Internet — or turn on Premium voice in Settings.",
          );
        }
        if (!text) {
          setMessage("I didn't catch anything — tap Try again and speak after the chime.");
          setPhase("idle");
          return;
        }
        await understand(text);
      } catch (e) {
        setMessage(errText(e));
        setPhase("idle");
      }
    },
    [premium, understand],
  );
  const startRef = useRef(start);
  startRef.current = start;

  function close() {
    abortRef.current?.abort();
    setOpen(false);
    setPhase("idle");
    setDraft(null);
  }

  // "hey PUA" — background listening only while the dialog is closed.
  useEffect(() => {
    if (!wake || open || !browserSpeechSupported()) return;
    return startWakeListener((rest) => {
      void startRef.current(rest.split(/\s+/).length >= 2 ? rest : undefined);
    });
  }, [wake, open]);

  const set = (patch: Partial<VoiceDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const Meta = draft ? KIND_META[draft.kind] : null;

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => void start()}
        aria-label="Add by voice"
        title={wake ? 'Add by voice — or say "Hey PUA"' : "Add by voice"}
        data-testid="voice-button"
        className="fixed bottom-7 right-[5.5rem] z-50 grid size-12 place-items-center rounded-full border bg-card text-foreground shadow-md transition-[box-shadow,background-color] duration-200 hover:bg-accent hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Mic className="size-5" />
        {wake && (
          <span className="absolute right-1 top-1 size-2.5 rounded-full bg-emerald-500 ring-2 ring-card" data-testid="voice-wake-indicator" />
        )}
      </motion.button>

      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent data-testid="voice-dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              PUA voice
              {premium && (
                <Badge variant="secondary" className="gap-1" data-testid="voice-premium-badge">
                  <Sparkles className="size-3" /> Premium
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {phase === "preview"
                ? 'Say "yes" to save or "go back" to try again.'
                : premium
                  ? 'Just say it naturally — e.g. "lunch with Priya next Thursday at half twelve".'
                  : 'Say e.g. "appointment dentist tomorrow at 3pm", "remind me to call mum Friday at 6pm" or "habit read 20 pages".'}
            </DialogDescription>
          </DialogHeader>

          <AnimatePresence mode="wait">
            {(phase === "listening" || phase === "thinking") && (
              <motion.div
                key="busy"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 py-6"
              >
                <div className="relative grid size-24 place-items-center">
                  {phase === "listening" && (
                    <motion.span
                      className="absolute inset-0 rounded-full bg-primary/20"
                      animate={{ scale: premium ? 1 + level * 0.6 : [1, 1.25, 1] }}
                      transition={premium ? { duration: 0.1 } : { duration: 1.4, repeat: Infinity }}
                    />
                  )}
                  <span className="relative grid size-16 place-items-center rounded-full bg-primary text-primary-foreground">
                    {phase === "thinking" ? <Loader2 className="size-6 animate-spin" /> : <Mic className="size-6" />}
                  </span>
                </div>
                <p className="min-h-5 text-center text-sm text-muted-foreground" data-testid="voice-status">
                  {phase === "thinking"
                    ? transcript
                      ? `“${transcript}” — understanding…`
                      : "Transcribing…"
                    : interim
                      ? `“${interim}”`
                      : "Listening…"}
                </p>
                {phase === "listening" && (
                  <Button variant="ghost" size="sm" data-testid="voice-stop-button" onClick={() => abortRef.current?.abort()}>
                    <MicOff className="size-4" /> Done talking
                  </Button>
                )}
              </motion.div>
            )}

            {phase === "idle" && message && (
              <motion.div key="msg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 py-2">
                {transcript && (
                  <p className="text-sm">
                    Heard: <span className="italic" data-testid="voice-heard">“{transcript}”</span>
                  </p>
                )}
                <p className="text-sm text-muted-foreground" data-testid="voice-message">
                  {message}
                </p>
                <Button size="sm" data-testid="voice-retry-button" onClick={() => void start()}>
                  <RotateCcw className="size-4" /> Try again
                </Button>
              </motion.div>
            )}

            {(phase === "preview" || phase === "saving") && draft && Meta && (
              <motion.div key="preview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3" data-testid="voice-preview">
                <p className="text-xs text-muted-foreground">
                  Heard: <span className="italic" data-testid="voice-heard">“{transcript}”</span>
                  {usedAi ? " · understood by AI" : ""}
                </p>
                <div className="flex items-center gap-2">
                  <Badge className="gap-1" data-testid="voice-kind-badge">
                    <Meta.icon className="size-3" /> {Meta.label}
                  </Badge>
                  {draft.date && draft.kind !== "habit" && (
                    <span className="text-xs text-muted-foreground" data-testid="voice-preview-date">
                      {fmtShort(draft.date)}
                    </span>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="voice-title">{draft.kind === "habit" ? "Habit" : "Title"}</Label>
                  <Input id="voice-title" value={draft.title} onChange={(e) => set({ title: e.target.value })} data-testid="voice-title-input" />
                </div>
                {draft.kind !== "habit" && (
                  <div className={cn("grid gap-2", draft.kind === "appointment" ? "grid-cols-3" : "grid-cols-2")}>
                    <div className="grid gap-1.5">
                      <Label htmlFor="voice-date">Date</Label>
                      <Input id="voice-date" type="date" value={draft.date ?? ""} onChange={(e) => set({ date: e.target.value })} data-testid="voice-date-input" />
                    </div>
                    {draft.kind === "appointment" ? (
                      <>
                        <div className="grid gap-1.5">
                          <Label htmlFor="voice-start">Start</Label>
                          <Input id="voice-start" type="time" value={draft.startTime ?? ""} onChange={(e) => set({ startTime: e.target.value })} data-testid="voice-start-input" />
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor="voice-end">End</Label>
                          <Input id="voice-end" type="time" value={draft.endTime ?? ""} onChange={(e) => set({ endTime: e.target.value })} data-testid="voice-end-input" />
                        </div>
                      </>
                    ) : (
                      <div className="grid gap-1.5">
                        <Label htmlFor="voice-time">Time</Label>
                        <Input id="voice-time" type="time" value={draft.time ?? ""} onChange={(e) => set({ time: e.target.value })} data-testid="voice-time-input" />
                      </div>
                    )}
                  </div>
                )}
                {draft.kind === "appointment" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="voice-location">Location</Label>
                    <Input id="voice-location" value={draft.location} onChange={(e) => set({ location: e.target.value })} placeholder="optional" data-testid="voice-location-input" />
                  </div>
                )}
                {draft.kind === "habit" && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      {(["streak", "monthly"] as const).map((m) => (
                        <Button key={m} size="sm" variant={draft.habitMode === m ? "default" : "outline"} data-testid={`voice-habit-mode-${m}`} onClick={() => set({ habitMode: m })}>
                          {m === "streak" ? "🔥 Streak" : "📅 Monthly"}
                        </Button>
                      ))}
                      <span className="ml-auto text-2xl" data-testid="voice-habit-emoji">{draft.emoji}</span>
                    </div>
                    {draft.habitMode === "monthly" && (
                      <div className="grid gap-1.5">
                        <Label htmlFor="voice-target">Times per month</Label>
                        <Input id="voice-target" type="number" min={1} max={99} className="w-24" value={draft.monthlyTarget}
                          onChange={(e) => set({ monthlyTarget: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })} data-testid="voice-target-input" />
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-sm" htmlFor="voice-distance">
                      <Checkbox id="voice-distance" checked={draft.tracksDistance} onCheckedChange={(c) => set({ tracksDistance: c === true })} data-testid="voice-distance-checkbox" />
                      Track running distance
                    </label>
                  </div>
                )}
                <div className="flex justify-between gap-2 pt-1">
                  <Button variant="outline" size="sm" data-testid="voice-back-button" disabled={phase === "saving"} onClick={() => void start()}>
                    <RotateCcw className="size-4" /> Go back
                  </Button>
                  <Button size="sm" data-testid="voice-save-button"
                    disabled={phase === "saving" || !draft.title.trim() || (draft.kind !== "habit" && !draft.date)}
                    onClick={() => { abortRef.current?.abort(); setPhase("saving"); save.mutate(draft); }}>
                    {phase === "saving" ? <Loader2 className="size-4 animate-spin" /> : null} Yes, save
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </>
  );
}
