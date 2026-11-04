import { Link, NavLink, Outlet } from "react-router-dom";
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

const NAV = [
  { to: "/", label: "Today", icon: SunMedium, testid: "nav-today" },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, testid: "nav-calendar" },
  { to: "/habits", label: "Habits", icon: ListChecks, testid: "nav-habits" },
  { to: "/planner", label: "Planner", icon: UtensilsCrossed, testid: "nav-planner" },
  { to: "/health", label: "Health", icon: HeartPulse, testid: "nav-health" },
];

export default function AppShell() {
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
              <span className="hidden sm:inline">Daily Loop</span>
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
                to="/morning"
                data-testid="nav-morning"
                title="Morning briefing"
                aria-label="Morning briefing"
                className={({ isActive }) =>
                  cn(buttonVariants({ variant: isActive ? "secondary" : "ghost", size: "icon-sm" }))
                }
              >
                <Sunrise className="size-4" />
              </NavLink>
              <NavLink
                to="/evening"
                data-testid="nav-evening"
                title="Evening review"
                aria-label="Evening review"
                className={({ isActive }) =>
                  cn(buttonVariants({ variant: isActive ? "secondary" : "ghost", size: "icon-sm" }))
                }
              >
                <MoonStar className="size-4" />
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
      {/* Lifted above the FAB so toasts never cover the create button */}
      <Toaster richColors offset={{ bottom: 96, right: 24 }} mobileOffset={{ bottom: 92 }} />
    </MotionConfig>
  );
}
