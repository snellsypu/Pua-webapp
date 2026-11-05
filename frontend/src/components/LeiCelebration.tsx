// Lei milestones: when a routine's streak reaches a multiple of 7, flowers rain down
// and PUA says "Your lei is complete!". Fire with celebrateIfLeiComplete(prev, next).
import { useEffect, useState } from "react";
import { playBirdsong } from "@/lib/birdsong";
import { AnimatePresence, motion } from "motion/react";
import type { RoutineState } from "@/lib/types";
import { speak, speakEnabled } from "@/lib/speech";
import { Flower, FLOWER_KINDS } from "@/components/Flower";

const EVENT = "pua:lei-complete";

export function celebrateIfLeiComplete(prev: RoutineState | undefined, next: RoutineState) {
  const lei = next.complete && next.streak > 0 && next.streak % 7 === 0 && (prev?.streak ?? 0) < next.streak;
  if (next.complete && !prev?.complete && !lei) playBirdsong(); // routine finished
  if (next.complete && next.streak > 0 && next.streak % 7 === 0 && (prev?.streak ?? 0) < next.streak) {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { title: next.title, streak: next.streak } }));
  }
}

const PETALS = Array.from({ length: 22 }, (_, i) => ({
  kind: FLOWER_KINDS[i % FLOWER_KINDS.length],
  left: (i * 37) % 100,
  delay: (i % 7) * 0.12,
  size: 18 + ((i * 13) % 18),
  spin: i % 2 ? 220 : -220,
}));

export function LeiCelebration() {
  const [show, setShow] = useState<{ title: string; streak: number } | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ title: string; streak: number }>).detail;
      setShow(d);
      playBirdsong();
      if (speakEnabled()) window.setTimeout(() => void speak("Your lei is complete!"), 900);
      window.setTimeout(() => setShow(null), 4200);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          data-testid="lei-celebration">
          {PETALS.map((p, i) => (
            <motion.span key={i} className="absolute top-0" style={{ left: `${p.left}%` }}
              initial={{ y: -60, rotate: 0, opacity: 0 }} animate={{ y: "105vh", rotate: p.spin, opacity: [0, 1, 1, 0.8] }}
              transition={{ duration: 3.2, delay: p.delay, ease: "easeIn" }}>
              <Flower kind={p.kind} className="drop-shadow" />
            </motion.span>
          ))}
          <motion.div initial={{ scale: 0.6, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="pointer-events-auto absolute left-1/2 top-1/3 w-[min(22rem,90vw)] -translate-x-1/2 rounded-3xl border bg-card/90 p-6 text-center shadow-2xl backdrop-blur"
            onClick={() => setShow(null)}>
            <div className="mx-auto flex w-fit -space-x-2">
              {FLOWER_KINDS.map((k) => <Flower key={k} kind={k} className="pua-bloom size-9" />)}
            </div>
            <p className="mt-3 font-heading text-2xl font-bold" data-testid="lei-celebration-title">Your lei is complete!</p>
            <p className="mt-1 text-sm text-muted-foreground">{show.title} · {show.streak} days in a row 🌺</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
