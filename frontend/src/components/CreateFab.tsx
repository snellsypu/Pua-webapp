// Floating "create" button, bottom-right on every page. Opens a small menu for
// a new appointment, habit or reminder; each opens its existing dialog.
// Sits above the sonner toaster's spot (bottom-right) and clear of the
// preview's bug button (bottom-left).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Bell, CalendarPlus, ListChecks, Plus } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { DayContext } from "@/lib/types";
import { AppointmentDialog } from "@/components/AppointmentDialog";
import { HabitDialog } from "@/components/HabitDialog";
import { ReminderDialog } from "@/components/ReminderDialog";
import { cn } from "@/lib/utils";

type Kind = "appointment" | "habit" | "reminder";

const ITEMS: { kind: Kind; label: string; icon: typeof Plus }[] = [
  { kind: "reminder", label: "Reminder", icon: Bell },
  { kind: "habit", label: "Habit", icon: ListChecks },
  { kind: "appointment", label: "Appointment", icon: CalendarPlus },
];

export function CreateFab() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<Kind | null>(null);
  // Server-anchored "today" pre-fills the date fields.
  const todayQ = useQuery({
    queryKey: ["overview", 0],
    queryFn: () => apiGet<DayContext>("/overview?offset=0"),
  });
  const today = todayQ.data?.date;

  const pick = (kind: Kind) => {
    setMenuOpen(false);
    setDialog(kind);
  };

  return (
    <>
      {menuOpen && (
        <button
          aria-label="Close create menu"
          data-testid="fab-backdrop"
          className="fixed inset-0 z-40 cursor-default bg-background/40 backdrop-blur-[2px]"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        <AnimatePresence>
          {menuOpen &&
            ITEMS.map(({ kind, label, icon: Icon }, i) => (
              <motion.button
                key={kind}
                initial={{ opacity: 0, y: 12, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.9 }}
                transition={{ duration: 0.16, delay: (ITEMS.length - 1 - i) * 0.04 }}
                onClick={() => pick(kind)}
                data-testid={`fab-new-${kind}`}
                className="flex items-center gap-2.5 rounded-full border bg-card py-2 pl-4 pr-2 text-sm font-medium shadow-md transition-colors hover:bg-accent"
              >
                {label}
                <span className="grid size-8 place-items-center rounded-full bg-secondary">
                  <Icon className="size-4" />
                </span>
              </motion.button>
            ))}
        </AnimatePresence>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? "Close create menu" : "Create new"}
          aria-expanded={menuOpen}
          data-testid="fab-create-button"
          className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-shadow hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Plus className={cn("size-6 transition-transform duration-200", menuOpen && "rotate-45")} />
        </motion.button>
      </div>

      <AppointmentDialog
        open={dialog === "appointment"}
        onOpenChange={(o) => !o && setDialog(null)}
        initial={{ date: today }}
      />
      <HabitDialog open={dialog === "habit"} onOpenChange={(o) => !o && setDialog(null)} initial={null} />
      <ReminderDialog
        open={dialog === "reminder"}
        onOpenChange={(o) => !o && setDialog(null)}
        defaultDate={today}
      />
    </>
  );
}
