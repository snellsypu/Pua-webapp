// A lei that gains one flower for each day in a routine's completion streak.
// Strung in rounds of 7 (a week); after 4 full rounds it stays a full lei with a count.
import { Flower, type FlowerKind } from "@/components/Flower";
import { cn } from "@/lib/utils";

const MAX = 28;

export function Lei({ streak, kinds, id, className }: { streak: number; kinds: FlowerKind[]; id: string; className?: string }) {
  const flowers = Math.min(streak, MAX);
  const slots = Math.min(MAX, Math.max(7, Math.ceil(Math.max(streak, 1) / 7) * 7));
  const left = slots - flowers;
  const caption = streak === 0
    ? "Finish today's routine to string your first flower"
    : streak >= MAX
      ? `Full lei! ${streak} days in a row`
      : left === 0
        ? `${flowers} flowers — this round of your lei is complete`
        : `${flowers} flower${flowers === 1 ? "" : "s"} · ${left} more to finish this round`;

  return (
    <div className={cn("space-y-1", className)} data-testid={`lei-${id}`}>
      <div className="relative h-16 w-full" aria-label={`Lei with ${flowers} flowers`} role="img">
        {/* the string */}
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden="true">
          <path d="M5 4 Q50 66 95 4" fill="none" stroke="currentColor" strokeWidth=".5" className="text-emerald-700/30" vectorEffect="non-scaling-stroke" />
        </svg>
        {Array.from({ length: slots }, (_, i) => {
          const t = slots === 1 ? 0.5 : i / (slots - 1);
          // quadratic curve matching the string: P0(5,4) P1(50,66) P2(95,4) in a 100×40 box
          const x = (1 - t) ** 2 * 5 + 2 * (1 - t) * t * 50 + t ** 2 * 95;
          const y = ((1 - t) ** 2 * 4 + 2 * (1 - t) * t * 66 + t ** 2 * 4) / 40 * 100;
          const filled = i < flowers;
          const newest = filled && i === flowers - 1;
          return (
            <span key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}
              data-testid={filled ? `lei-${id}-flower-${i}` : undefined}>
              {filled ? (
                <Flower kind={kinds[i % kinds.length]} className={cn(slots > 14 ? "size-4" : "size-5", newest && "pua-bloom")} />
              ) : (
                <span className="block size-1.5 rounded-full bg-emerald-700/25" />
              )}
            </span>
          );
        })}
      </div>
      <p className="text-center text-[11px] text-muted-foreground" data-testid={`lei-${id}-caption`}>{caption}</p>
    </div>
  );
}
