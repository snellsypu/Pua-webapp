// Hands-free routine: PUA reads each open step, listens for "done" (ticks it),
// "skip", "repeat" or "stop", and moves on until the routine is finished.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Headphones, Square } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { RoutineState } from "@/lib/types";
import { browserSpeechSupported, listenOnce, speak, stopSpeaking } from "@/lib/speech";
import { Button } from "@/components/ui/button";

type Verdict = "done" | "skip" | "repeat" | "stop";

export function matchStep(text: string): Verdict | null {
  const t = text.toLowerCase();
  if (/\b(stop|cancel|quit|exit|pause|that's all|enough)\b/.test(t)) return "stop";
  if (/\b(skip|later|next one|not now|pass)\b/.test(t)) return "skip";
  if (/\b(repeat|again|what was it|say that|pardon|sorry)\b/.test(t)) return "repeat";
  if (/\b(done|did it|finished|complete|completed|ticked|tick|check|next|yes|yep|yeah|ok|okay|got it)\b/.test(t)) return "done";
  return null;
}

const MAX_LISTENS = 40; // ~5 minutes of silence per step before pausing

export function HandsFreeRoutine({ kind, autoStart = false, size = "xs" }: {
  kind: "morning" | "bedtime";
  autoStart?: boolean;
  size?: "xs" | "sm";
}) {
  const qc = useQueryClient();
  const [active, setActive] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [heard, setHeard] = useState("");
  const [listening, setListening] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const supported = browserSpeechSupported();

  const stop = () => {
    ctrl.current?.abort();
    stopSpeaking();
  };
  useEffect(() => stop, []);

  const run = async () => {
    if (!supported) return;
    const c = new AbortController();
    ctrl.current = c;
    setActive(true);
    const skipped = new Set<string>();
    try {
      while (!c.signal.aborted) {
        const all = await qc.fetchQuery({ queryKey: ["routines"], queryFn: () => apiGet<RoutineState[]>("/routines"), staleTime: 0 });
        const r = all.find((x) => x.kind === kind);
        if (!r) break;
        const step = r.steps.find((s) => !r.doneStepIds.includes(s.id) && !skipped.has(s.id));
        if (!step) {
          setCurrent(null);
          await speak(
            r.complete
              ? `${r.title} complete. That's a ${r.streak} day streak!`
              : "That's every step for now — the skipped ones are still on your list.",
            c.signal,
          );
          break;
        }
        setCurrent(step.text);
        setHeard("");
        await speak(`${step.text}. Say done when you've finished, or skip.`, c.signal);
        let verdict: Verdict | null = null;
        for (let i = 0; i < MAX_LISTENS && !verdict && !c.signal.aborted; i++) {
          setListening(true);
          const t = await listenOnce({ signal: c.signal, onInterim: setHeard });
          setListening(false);
          if (t) setHeard(t);
          verdict = matchStep(t);
        }
        if (c.signal.aborted) break;
        if (!verdict) {
          await speak("I'll pause here. Tap hands-free to carry on.", c.signal);
          break;
        }
        if (verdict === "stop") {
          await speak("Okay, stopping.", c.signal);
          break;
        }
        if (verdict === "skip") skipped.add(step.id);
        if (verdict === "done") {
          const next = await apiPost<RoutineState>(`/routines/${kind}/steps/${step.id}/toggle`);
          qc.setQueryData<RoutineState[]>(["routines"], (old) => old?.map((x) => (x.kind === next.kind ? next : x)));
          if (next.complete) toast.success(`${next.title} complete 🎉`);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hands-free stopped");
    } finally {
      setListening(false);
      setActive(false);
      setCurrent(null);
    }
  };

  const started = useRef(false);
  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void run();
    }
  }, [autoStart]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!supported) return null;

  return (
    <div className="space-y-2">
      {active ? (
        <Button variant="outline" size={size} onClick={stop} data-testid={`handsfree-stop-${kind}`}>
          <Square className="size-3" /> Stop hands-free
        </Button>
      ) : (
        <Button variant="outline" size={size} onClick={() => void run()} data-testid={`handsfree-start-${kind}`}
          title='PUA reads each step and ticks it when you say "done"'>
          <Headphones className="size-3.5" /> Hands-free
        </Button>
      )}
      <AnimatePresence>
        {active && current && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-xl border border-primary/30 bg-primary/5 px-3 py-2"
            data-testid={`handsfree-panel-${kind}`}
          >
            <p className="text-sm font-medium" data-testid={`handsfree-current-${kind}`}>{current}</p>
            <p className="text-xs text-muted-foreground" data-testid={`handsfree-status-${kind}`}>
              {listening ? (heard ? `“${heard}”` : 'Listening — say "done", "skip", "repeat" or "stop"') : "Speaking…"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
