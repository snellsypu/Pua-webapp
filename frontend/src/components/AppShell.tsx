import { useEffect, useRef } from "react";
import { JungleBackdrop, VineGarland } from "@/components/Jungle";
import { PaywallProvider } from "@/components/Paywall";
import { LeiCelebration } from "@/components/LeiCelebration";
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
  Flower2,
  BarChart3,
  CalendarHeart,
  SunMedium,
  UtensilsCrossed,
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AccountButton } from "@/components/AccountButton";
import { CreateFab } from "@/components/CreateFab";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { markRead, readOnOpen } from "@/components/WakeBanner";
import { useDayPart } from "@/lib/useDayPart";
import { apiGet } from "@/lib/api";
import type { AppSettings } from "@/lib/types";
import { PuaLogo } from "@/components/Flower";

const NAV = [
  { to: "/", label: "Today", icon: SunMedium, testid: "nav-today" },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, testid: "nav-calendar" },
  { to: "/habits", label: "Habits", icon: ListChecks, testid: "nav-habits" },
  { to: "/planner", label: "Planner", icon: UtensilsCrossed, testid: "nav-planner" },
  { to: "/health", label: "Health", icon: HeartPulse, testid: "nav-health" },
  { to: "/sharing", label: "Bouquets", icon: Flower2, testid: "nav-sharing" },
  { to: "/anniversaries", label: "Anniversaries", icon: CalendarHeart, testid: "nav-anniversaries" },
  { to: "/stats", label: "Stats", icon: BarChart3, testid: "nav-stats" },
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
    <PaywallProvider>
    <MotionConfig reducedMotion="user">
      <JungleBackdrop />
      <div className="relative z-10 min-h-svh">
        <header className="sticky top-0 z-40 border-b border-emerald-700/20 bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-1 px-4">
            <Link
              to="/"
              className="mr-3 flex items-center gap-2 font-heading text-base font-bold tracking-tight"
              data-testid="nav-logo"
            >
              <PuaLogo />
              <span className="hidden max-w-20 text-[10px] font-medium leading-tight tracking-normal text-muted-foreground lg:inline">
                Personal Uplink Assistant
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
              <AccountButton />
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
          <VineGarland className="absolute inset-x-0 -bottom-[7px]" />
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6">
          <Outlet />
        </main>
      </div>
      <CreateFab />
      <VoiceAssistant />
      {/* Lifted above the FAB so toasts never cover the create button */}
      <Toaster richColors offset={{ bottom: 96, right: 24 }} mobileOffset={{ bottom: 92 }} />
      <LeiCelebration />
    </MotionConfig>
    </PaywallProvider>
  );
}
