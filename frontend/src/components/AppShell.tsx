import { useEffect, useRef } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import {
  CalendarDays,
  HeartPulse,
  ListChecks,
  MoonStar,
  Settings as SettingsIcon,
  Sunrise,
  SunMedium,
  UtensilsCrossed,
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CreateFab } from "@/components/CreateFab";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { markRead, readOnOpen } from "@/components/WakeBanner";
import { useDayPart } from "@/lib/useDayPart";
import { apiGet } from "@/lib/api";
import type { AppSettings } from "@/lib/types";

const NAV = [
  { to: "/", label: "Today", icon: SunMedium, testid: "nav-today" },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, testid: "nav-calendar" },
  { to: "/habits", label: "Habits", icon: ListChecks, testid: "nav-habits" },
  { to: "/planner", label: "Planner", icon: UtensilsCrossed, testid: "nav-planner" },
  { to: "/health", label: "Health", icon: HeartPulse, testid: "nav-health" },
];

export default function AppShell() {
  const daypart = useDayPart();
  const evening = daypart.data?.part === "evening";
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const navigate = useNavigate();
  const location = useLocation();
  const checked = useRef(false);

  // Wake-up / bedtime read-outs: once per day each, via link/notification, or the first
  // open after the wake-up / bedtime-routine time when "read on first open" is on.
  useEffect(() => {
    const dp = daypart.data;
    if (!dp || !settings.data || checked.current) return;
    checked.current = true;
    const q = new URLSearchParams(location.search);
    if (q.get("wake") === "1") markRead("wake", dp.date);
    else if (q.get("bedtime") === "1") markRead("bedtime", dp.date);
    else {
      const due = readOnOpen(dp);
      if (due) {
        markRead(due, dp.date);
        navigate(`/overview?${due}=1`, { replace: true });
      }
    }
  }, [daypart.data, settings.data, location.search, navigate]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-svh">
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-1 px-4">
            <Link
              to="/"
              className="mr-3 flex items-center gap-2 font-heading text-base font-bold tracking-tight"
              data-testid="nav-logo"
            >
              <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">
                <Sunrise className="size-4" />
              </span>
              <span className="hidden leading-tight sm:inline">
                PUA
                <span className="block text-[10px] font-medium tracking-normal text-muted-foreground">
                  Personal Uplink Assistant
                </span>
              </span>
            </Link>
            <nav className="flex items-center gap-1">
              {NAV.map(({ to, label, icon: Icon, testid }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  data-testid={testid}
                  className={({ isActive }) =>
                    cn(
                      buttonVariants({ variant: isActive ? "secondary" : "ghost", size: "sm" }),
                      "px-2 sm:px-3",
                    )
                  }
                >
                  <Icon className="size-4" />
                  <span className="hidden md:inline">{label}</span>
                </NavLink>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-1">
              <NavLink
                to="/overview"
                data-testid="nav-overview"
                title={evening ? "Tomorrow's review" : "Today's briefing"}
                aria-label={evening ? "Tomorrow's review" : "Today's briefing"}
                className={({ isActive }) =>
                  cn(buttonVariants({ variant: isActive ? "secondary" : "ghost", size: "icon-sm" }))
                }
              >
                {evening ? <MoonStar className="size-4" /> : <Sunrise className="size-4" />}
              </NavLink>
              <ThemeToggle />
              <NavLink
                to="/settings"
                data-testid="nav-settings"
                title="Settings"
                aria-label="Settings"
                className={({ isActive }) =>
                  cn(buttonVariants({ variant: isActive ? "secondary" : "ghost", size: "icon-sm" }))
                }
              >
                <SettingsIcon className="size-4" />
              </NavLink>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6">
          <Outlet />
        </main>
      </div>
      <CreateFab />
      <VoiceAssistant />
      {/* Lifted above the FAB so toasts never cover the create button */}
      <Toaster richColors offset={{ bottom: 96, right: 24 }} mobileOffset={{ bottom: 92 }} />
    </MotionConfig>
  );
}
