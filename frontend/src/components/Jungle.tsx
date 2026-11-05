// Jungle decor: the pink orchid (logo), tropical leaves and trailing vines.
// Pure decoration — every piece is aria-hidden and pointer-events-none.
import { useId } from "react";
import { cn } from "@/lib/utils";

/** Pink moth orchid (Phalaenopsis) — the PUA logo flower. */
export function Orchid({ className, title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  const label = title ? { role: "img" as const, "aria-label": title } : { "aria-hidden": true as const };
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} {...label} data-flower="orchid">
      <defs>
        <radialGradient id={`op-${id}`} cx="12" cy="11.5" r="11" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fdf2f8" />
          <stop offset="45%" stopColor="#f9a8d4" />
          <stop offset="100%" stopColor="#db2777" />
        </radialGradient>
        <linearGradient id={`ol-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#be185d" />
          <stop offset="100%" stopColor="#831843" />
        </linearGradient>
      </defs>
      <g fill={`url(#op-${id})`} stroke="#be185d" strokeWidth=".35">
        {/* dorsal sepal + two lower sepals */}
        <ellipse cx="12" cy="5.6" rx="2.7" ry="4.1" />
        <ellipse cx="8.4" cy="17" rx="2.3" ry="3.9" transform="rotate(32 8.4 17)" />
        <ellipse cx="15.6" cy="17" rx="2.3" ry="3.9" transform="rotate(-32 15.6 17)" />
        {/* two broad side petals */}
        <ellipse cx="6.6" cy="10.8" rx="4.7" ry="4" transform="rotate(-14 6.6 10.8)" />
        <ellipse cx="17.4" cy="10.8" rx="4.7" ry="4" transform="rotate(14 17.4 10.8)" />
      </g>
      {/* petal veins */}
      <g stroke="#db2777" strokeWidth=".25" fill="none" opacity=".55">
        <path d="M10.6 11 4 9.6M10.6 11.6 3.6 12M13.4 11 20 9.6M13.4 11.6 20.4 12" />
      </g>
      {/* lip */}
      <path d="M12 11.4c1.7 0 2.9 1.1 2.7 2.7-.2 1.5-1.4 2.8-2.7 3.5-1.3-.7-2.5-2-2.7-3.5-.2-1.6 1-2.7 2.7-2.7Z" fill={`url(#ol-${id})`} />
      <path d="M10.4 12.6c-.9-.3-1.5-.9-1.6-1.6M13.6 12.6c.9-.3 1.5-.9 1.6-1.6" stroke="#831843" strokeWidth=".5" strokeLinecap="round" fill="none" />
      {/* column */}
      <ellipse cx="12" cy="11.2" rx="1" ry="1.2" fill="#fef3c7" stroke="#f59e0b" strokeWidth=".3" />
      <circle cx="12" cy="13.6" r=".55" fill="#fde047" />
    </svg>
  );
}

/** A tropical leaf (pointed, with a midrib and veins). */
export function Leaf({ className, tone = "mid", style }: { className?: string; tone?: "light" | "mid" | "deep"; style?: React.CSSProperties }) {
  const fill = { light: "#6ee7b7", mid: "#10b981", deep: "#047857" }[tone];
  return (
    <svg viewBox="0 0 40 40" className={className} style={style} aria-hidden="true">
      <path d="M4 36C4 18 16 5 36 4c-1 20-14 32-32 32Z" fill={fill} />
      <path d="M4 36 33 7" stroke="#064e3b" strokeOpacity=".35" strokeWidth="1.1" fill="none" />
      <path d="M11 29l-1-8M16 24l-1-9M21 19l0-8M11 29l8 1M16 24l9 1M21 19l9 0" stroke="#064e3b" strokeOpacity=".22" strokeWidth=".8" fill="none" />
    </svg>
  );
}

/** Monstera leaf with its split edges and holes. */
export function Monstera({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 120 120" className={className} style={style} aria-hidden="true">
      <path fill="#059669" d="M60 112C28 110 8 86 8 58 8 30 30 8 60 8s52 22 52 50c0 28-20 52-52 54Z" />
      {/* splits */}
      <g fill="var(--background)">
        <path d="M8 50 40 56 8 62Z" /><path d="M12 30 44 46 16 40Z" /><path d="M14 80 42 68 22 90Z" />
        <path d="M112 50 80 56 112 62Z" /><path d="M108 30 76 46 104 40Z" /><path d="M106 80 78 68 98 90Z" />
        <ellipse cx="44" cy="74" rx="4" ry="6" /><ellipse cx="76" cy="74" rx="4" ry="6" />
        <ellipse cx="46" cy="34" rx="3.5" ry="5" /><ellipse cx="74" cy="34" rx="3.5" ry="5" />
      </g>
      <path d="M60 112V14" stroke="#065f46" strokeWidth="2.4" fill="none" />
    </svg>
  );
}

/** A trailing vine with leaves, drawn top → bottom. */
function Vine({ className, flip, length = 640, seed = 0 }: { className?: string; flip?: boolean; length?: number; seed?: number }) {
  const n = Math.floor(length / 56);
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const y = (i / n) * length;
    const x = 26 + Math.sin(i * 0.9 + seed) * 14;
    return { x, y };
  });
  const d = pts.map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `S${(p.x + pts[i - 1].x) / 2 + (i % 2 ? 10 : -10)} ${p.y - 28} ${p.x} ${p.y}`)).join(" ");
  return (
    <svg viewBox={`0 0 60 ${length}`} className={cn(className, flip && "-scale-x-100")} style={{ height: length }} aria-hidden="true" preserveAspectRatio="xMidYMin meet">
      <path d={d} stroke="#047857" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {pts.slice(1).map((p, i) => {
        const left = (i + seed) % 2 === 0;
        const s = 0.55 + ((i * 7 + seed) % 5) * 0.09;
        return (
          <g key={i} transform={`translate(${p.x} ${p.y - 16}) rotate(${left ? -120 : 30}) scale(${s})`}>
            <path d="M0 0C0-14 10-24 26-25c-1 15-11 25-26 25Z" fill={i % 3 === 0 ? "#34d399" : i % 3 === 1 ? "#10b981" : "#059669"} />
            <path d="M0 0 22-21" stroke="#064e3b" strokeOpacity=".3" strokeWidth=".9" fill="none" />
          </g>
        );
      })}
      {/* curly tendrils */}
      {pts.filter((_, i) => i % 3 === 1).map((p, i) => (
        <path key={`t${i}`} d={`M${p.x} ${p.y}c6 2 9 8 5 11-3 2-6-1-4-3`} stroke="#059669" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      ))}
    </svg>
  );
}

/** Fixed jungle frame behind the app: vines down both edges, leaves in the bottom corners. */
export function JungleBackdrop() {
  return (
    <>
    {/* painted Hawaiian rainforest (day / night), washed out in the middle so cards stay readable */}
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true" data-testid="jungle-scene">
      <div className="absolute inset-0 bg-[url('/jungle-day.webp')] bg-cover bg-center opacity-70 dark:hidden" />
      <div className="absolute inset-0 hidden bg-[url('/jungle-night.webp')] bg-cover bg-center opacity-80 dark:block" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_55%_at_50%_40%,color-mix(in_oklab,var(--background)_80%,transparent)_25%,color-mix(in_oklab,var(--background)_40%,transparent)_70%,transparent_100%)]" />
      <div className="pua-sunbeam absolute -top-1/4 left-1/4 h-[150%] w-40 rotate-[18deg] bg-gradient-to-b from-amber-100/40 via-amber-50/10 to-transparent blur-2xl dark:from-sky-200/10" />
      {PETALS.map((p, i) => (
        <span key={i} className="pua-petal absolute top-[-6%] block" style={{ left: p.left, animationDelay: p.delay, animationDuration: p.dur, ["--sway" as string]: p.sway }}>
          {p.kind === "orchid" ? <Orchid className="size-4 opacity-80" /> : <span className="block size-2.5 rounded-full bg-pink-300/80 shadow-[0_0_8px_rgb(244_114_182/0.6)] dark:bg-amber-200/80 dark:shadow-[0_0_10px_rgb(253_230_138/0.8)]" />}
        </span>
      ))}
    </div>
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-50 dark:opacity-30" aria-hidden="true" data-testid="jungle-backdrop">
      <Vine className="absolute -left-2 top-12 w-12 sm:w-16" length={720} seed={0} />
      <Vine className="absolute -left-1 top-0 hidden w-10 opacity-70 lg:block" length={380} seed={2} />
      <Vine className="absolute -right-2 top-12 w-12 sm:w-16" flip length={620} seed={1.5} />
      <Vine className="absolute -right-1 top-0 hidden w-10 opacity-70 lg:block" flip length={460} seed={3} />
      <Monstera className="absolute -bottom-14 -right-12 size-56 rotate-[-28deg] opacity-80 sm:size-72" />
      <Leaf className="absolute -bottom-6 -left-6 size-40 rotate-[10deg] opacity-80" tone="mid" />
      <Leaf className="absolute bottom-10 -left-10 size-32 rotate-[-30deg] opacity-70" tone="deep" />
      <Leaf className="absolute -bottom-8 right-40 hidden size-28 rotate-[70deg] opacity-60 md:block" tone="light" />
    </div>
    </>
  );
}

// drifting petals by day / fireflies by night
const PETALS = [
  { left: "8%", delay: "0s", dur: "19s", sway: "40px", kind: "orchid" },
  { left: "22%", delay: "6s", dur: "24s", sway: "-30px", kind: "dot" },
  { left: "41%", delay: "11s", dur: "21s", sway: "50px", kind: "dot" },
  { left: "63%", delay: "3s", dur: "26s", sway: "-45px", kind: "orchid" },
  { left: "79%", delay: "9s", dur: "22s", sway: "35px", kind: "dot" },
  { left: "92%", delay: "15s", dur: "25s", sway: "-25px", kind: "dot" },
];

/** A leafy garland strip for under the header. */
export function VineGarland({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none h-3 w-full bg-[url('/vine-garland.svg')] bg-[length:160px_12px] bg-repeat-x opacity-80", className)} aria-hidden="true" />
  );
}
