// One overview that follows the clock: today's briefing until the review time
// (Settings, default 18:00), then tomorrow's review. ?view=today|tomorrow pins
// a view; ?wake=1 (wake-up link / notification) reads the morning out and
// ?bedtime=1 (bedtime routine notification / first open) reads tomorrow out.
import { useSearchParams } from "react-router-dom";
import { AnniversaryHeadsUp } from "@/components/AnniversaryCards";
import { MoonStar, Sunrise } from "lucide-react";
import { useDayPart } from "@/lib/useDayPart";
import Morning from "@/pages/Morning";
import Evening from "@/pages/Evening";
import { WakeBanner } from "@/components/WakeBanner";
import { cn } from "@/lib/utils";

export default function Overview() {
  const [params, setParams] = useSearchParams();
  const daypart = useDayPart();
  const wake = params.get("wake") === "1";
  const bedtime = params.get("bedtime") === "1";
  const pinned = params.get("view") ?? (bedtime ? "tomorrow" : null);
  const view: "today" | "tomorrow" =
    wake || pinned === "today"
      ? "today"
      : pinned === "tomorrow"
        ? "tomorrow"
        : daypart.data?.part === "evening"
          ? "tomorrow"
          : "today";

  const pick = (v: "today" | "tomorrow") => {
    const auto = (daypart.data?.part === "evening" ? "tomorrow" : "today") === v;
    setParams(auto ? {} : { view: v }, { replace: true });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Overview"
          className="inline-flex rounded-full border bg-card p-1 shadow-sm"
          data-testid="overview-switch"
        >
          {(
            [
              ["today", "Today's briefing", Sunrise],
              ["tomorrow", "Tomorrow's review", MoonStar],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={view === v}
              data-testid={`overview-tab-${v}`}
              onClick={() => pick(v)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-[background-color,color] duration-200",
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
        {daypart.data && (
          <p className="text-xs text-muted-foreground" data-testid="overview-auto-note">
            {pinned
              ? "Pinned — tap the other tab to return to auto"
              : `Switches to tomorrow's review at ${daypart.data.reviewTime} · change it in Settings`}
          </p>
        )}
      </div>

      {wake && <WakeBanner kind="wake" onDismiss={() => setParams({}, { replace: true })} />}
      {bedtime && !wake && <WakeBanner kind="bedtime" onDismiss={() => setParams({ view: "tomorrow" }, { replace: true })} />}

      {view === "today" && <AnniversaryHeadsUp className="mb-6" />}
      {view === "today" ? <Morning /> : <Evening />}
    </div>
  );
}
