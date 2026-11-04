// Signed-out screen — Google sign-in via Emergent-managed auth.
import { useState } from "react";
import { motion } from "motion/react";
import { AlertCircle, ListChecks, Mic, Sunrise } from "lucide-react";
import { AUTH_ERROR_KEY, signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function SignIn() {
  const [error] = useState(() => sessionStorage.getItem(AUTH_ERROR_KEY));
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-10">
      <div className="pointer-events-none absolute -left-32 -top-32 size-[28rem] rounded-full bg-amber-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 size-[26rem] rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <motion.main
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md rounded-3xl border bg-card/80 p-8 shadow-xl backdrop-blur"
        data-testid="signin-page"
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Sunrise className="size-6" />
        </span>
        <h1 className="mt-5 font-heading text-3xl font-bold tracking-tight" data-testid="signin-title">PUA</h1>
        <p className="text-sm text-muted-foreground">Personal Uplink Assistant</p>
        <p className="mt-5 text-base leading-relaxed">
          Your day in one place — appointments, habits, routines, weather and travel times, by tap or by voice.
        </p>
        <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2"><Sunrise className="size-4 text-amber-600" /> Morning briefings &amp; tomorrow reviews</li>
          <li className="flex items-center gap-2"><ListChecks className="size-4 text-primary" /> Habits, streaks &amp; routines</li>
          <li className="flex items-center gap-2"><Mic className="size-4 text-primary" /> &ldquo;Hey PUA&rdquo; voice control</li>
        </ul>

        {error && (
          <p className="mt-5 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300" data-testid="signin-error">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        )}

        <Button size="lg" className="mt-6 w-full gap-2.5 bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 transition-[box-shadow,transform] duration-150 hover:bg-zinc-50 hover:shadow-md active:scale-[0.99] dark:ring-zinc-700"
          onClick={signIn} data-testid="signin-google-button">
          <GoogleMark /> Continue with Google
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Your own private planner · you stay signed in until you sign out.
        </p>
      </motion.main>
    </div>
  );
}
