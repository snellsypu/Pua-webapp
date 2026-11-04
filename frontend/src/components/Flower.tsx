// Hawaiian-flower check marks + the PUA plumeria logo.
// Every "done" tick in the app blooms into one of these instead of a ✓.
import { useId } from "react";
import { cn } from "@/lib/utils";

export type FlowerKind = "plumeria" | "pink-plumeria" | "hibiscus" | "ilima" | "lehua";
export const FLOWER_KINDS: FlowerKind[] = ["plumeria", "hibiscus", "pink-plumeria", "ilima", "lehua"];

/** Same key → same flower, so a habit or step always blooms the same way. */
export function flowerFor(key: string | undefined | null): FlowerKind {
  if (!key) return "plumeria";
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return FLOWER_KINDS[h % FLOWER_KINDS.length];
}

const ROT = [0, 72, 144, 216, 288];
// A plumeria petal: a pinwheel teardrop pointing up, leaning right so the five overlap.
const PLUMERIA_PETAL = "M12 12C9.2 9.6 8.6 4.1 11.4 2.1c1.2-.8 3.6-.5 4.4 1.2 1.2 2.6-.6 6.2-3.8 8.7Z";

export function Flower({ kind = "plumeria", className, title }: { kind?: FlowerKind; className?: string; title?: string }) {
  const uid = useId().replace(/:/g, "");
  const g = `pua-${kind}-${uid}`;
  const label = title ? { role: "img" as const, "aria-label": title } : { "aria-hidden": true as const };

  if (kind === "hibiscus") {
    return (
      <svg viewBox="0 0 24 24" className={cn("size-5", className)} {...label} data-flower={kind}>
        <defs>
          <radialGradient id={g} cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#881337" />
            <stop offset="35%" stopColor="#e11d48" />
            <stop offset="100%" stopColor="#fb7185" />
          </radialGradient>
        </defs>
        {ROT.map((r) => (
          <path key={r} transform={`rotate(${r} 12 12)`} fill={`url(#${g})`} stroke="#be123c" strokeWidth=".4"
            d="M12 12c-3.6-1.4-5.6-4.6-4.4-7.6C8.5 2.2 10.6 1.4 12 2.6c1.4-1.2 3.5-.4 4.4 1.8 1.2 3-.8 6.2-4.4 7.6Z" />
        ))}
        <path d="M12 12 17.6 6.4" stroke="#fde047" strokeWidth="1" strokeLinecap="round" />
        <circle cx="17.9" cy="6.1" r="1.1" fill="#facc15" />
        <circle cx="16.3" cy="7" r=".6" fill="#facc15" />
        <circle cx="12" cy="12" r="1.3" fill="#4c0519" />
      </svg>
    );
  }

  if (kind === "lehua") {
    // ʻŌhiʻa lehua: a pompom of red stamens with golden tips.
    const spikes = Array.from({ length: 16 }, (_, i) => i * 22.5);
    return (
      <svg viewBox="0 0 24 24" className={cn("size-5", className)} {...label} data-flower={kind}>
        {spikes.map((r, i) => (
          <g key={r} transform={`rotate(${r} 12 12)`}>
            <line x1="12" y1="12" x2="12" y2={i % 2 ? 3.6 : 2.4} stroke="#dc2626" strokeWidth="1.1" strokeLinecap="round" />
            <circle cx="12" cy={i % 2 ? 3.4 : 2.2} r=".85" fill="#fbbf24" />
          </g>
        ))}
        <circle cx="12" cy="12" r="3" fill="#b91c1c" />
      </svg>
    );
  }

  if (kind === "ilima") {
    // ʻIlima: small round golden-orange petals.
    return (
      <svg viewBox="0 0 24 24" className={cn("size-5", className)} {...label} data-flower={kind}>
        <defs>
          <radialGradient id={g} cx="50%" cy="80%" r="80%">
            <stop offset="0%" stopColor="#c2410c" />
            <stop offset="45%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#fed7aa" />
          </radialGradient>
        </defs>
        {ROT.map((r) => (
          <circle key={r} transform={`rotate(${r} 12 12)`} cx="12" cy="6.4" r="4.6" fill={`url(#${g})`} stroke="#ea580c" strokeWidth=".4" />
        ))}
        <circle cx="12" cy="12" r="2.2" fill="#9a3412" />
        <circle cx="12" cy="12" r="1" fill="#fde047" />
      </svg>
    );
  }

  const pink = kind === "pink-plumeria";
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5", className)} {...label} data-flower={kind}>
      <defs>
        <radialGradient id={g} cx="50%" cy="50%" r="55%" gradientUnits="userSpaceOnUse" fx="12" fy="12">
          <stop offset="0%" stopColor="#facc15" />
          <stop offset="30%" stopColor={pink ? "#f9a8d4" : "#fde68a"} />
          <stop offset="100%" stopColor={pink ? "#ec4899" : "#fffbeb"} />
        </radialGradient>
      </defs>
      {ROT.map((r) => (
        <path key={r} transform={`rotate(${r} 12 12)`} d={PLUMERIA_PETAL} fill={`url(#${g})`}
          stroke={pink ? "#db2777" : "#d97706"} strokeWidth=".45" strokeLinejoin="round" />
      ))}
      <circle cx="12" cy="12" r="1.4" fill="#eab308" />
    </svg>
  );
}

/** A blooming tick: the flower pops open when it first appears. */
export function FlowerTick({ kind, className }: { kind?: FlowerKind; className?: string }) {
  return <Flower kind={kind} className={cn("pua-bloom", className)} />;
}

/** App logo: a luau plumeria resting above the word PUA. */
export function PuaLogo({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span className={cn("inline-flex flex-col items-center leading-none", className)} data-testid="pua-logo">
      <Flower kind="plumeria" className={cn("drop-shadow-sm", size === "lg" ? "size-12" : "size-6")} title="Plumeria" />
      <span className={cn("font-heading font-extrabold tracking-[0.18em] text-primary", size === "lg" ? "mt-1 text-2xl" : "-mt-0.5 text-[11px]")}>
        PUA
      </span>
    </span>
  );
}
