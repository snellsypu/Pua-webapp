import { useEffect, useRef } from "react";
import { JungleBackdrop, VineGarland } from "@/components/Jungle";
import { PaywallProvider } from "@/components/Paywall";
import { LeiCelebration } from "@/components/LeiCelebration";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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
  Briefcase,
  CalendarHeart,
  ChevronDown,
  SunMedium,
  UtensilsCrossed,
} from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AccountButton } from "@/components/AccountButton";
import { CreateFab } from "@/components/CreateFab";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { markRead, readOnOpen } from "@/components/WakeBanner";
import { useDayPart } from "@/lib/useDayPart";
import { apiGet } from "@/lib/api";
import type { AppSettings } from "@/lib/types";
import { Flower, PuaLogo } from "@/components/Flower";

const NAV = [
  { to: "/", label: "Today", icon: SunMedium, testid: "nav-today" },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, testid: "nav-calendar" },
  { to: "/habits", label: "Habits", icon: ListChecks, testid: "nav-habits" },
  { to: "/planner", label: "Planner", icon: UtensilsCrossed, testid: "nav-planner" },
  { to: "/health", label: "Health", icon: HeartPulse, testid: "nav-health" },
  { to: "/sharing", label: "Bouquets", icon: Flower2, testid: "nav-sharing" },
  { to: "/anniversaries", label: "Anniversaries", icon: CalendarHeart, testid: "nav-anniversaries" },
  { to: "/work", label: "Work", icon: Briefcase, testid: "nav-work" },
  { to: "/stats", label: "Stats", icon: BarChart3, testid: "nav-stats" },
];

/** The orchid logo is the menu: every tab lives in this dropdown to keep the top bar clear. */
function LogoMenu({ evening }: { evening: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const items = [
    { to: "/overview", label: evening ? "Tomorrow's review" : "Today's briefing", icon: evening ? MoonStar : Sunrise, testid: "nav-overview" },
    ...NAV,
  ];
  const active = (to: string) => (to === "/" ? location.pathname === "/" : location.pathname.startsWith(to));
  const current = items.find((i) => active(i.to));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="group flex items-center gap-2 rounded-xl px-1.5 py-1 font-heading outline-none transition-[background-color] duration-150 hover:bg-emerald-500/10 focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-emerald-500/15"
        data-testid="nav-logo"
        aria-label="Open menu"
      >
        <PuaLogo />
        <span className="flex flex-col items-start leading-tight">
          <span className="text-sm font-semibold" data-testid="nav-current">{current?.label ?? "Menu"}</span>
          <span className="hidden text-[10px] font-medium text-muted-foreground sm:block">Personal Uplink Assistant</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-[popup-open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-60 border-emerald-700/20 bg-popover/95 p-1.5 backdrop-blur-md" data-testid="nav-menu">
        {items.map(({ to, label, icon: Icon, testid }) => (
          <DropdownMenuItem
            key={to}
            onClick={() => navigate(to)}
            data-testid={testid}
            className={cn("gap-3 rounded-lg px-2.5 py-2 text-sm", active(to) && "bg-emerald-500/15 font-semibold text-emerald-900 dark:text-emerald-100")}
          >
            <Icon className="size-4" /> {label}
            {active(to) && <Flower kind="hibiscus" className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
            <LogoMenu evening={evening} />
            <div className="ml-auto flex items-center gap-1">
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
