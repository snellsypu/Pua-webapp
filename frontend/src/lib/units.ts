// Distances travel as km over the API; convert only at the edges (display + input).
import type { DistanceUnit } from "@/lib/types";

const KM_PER_MI = 1.609344;

export const fromKm = (km: number, unit: DistanceUnit) => (unit === "mi" ? km / KM_PER_MI : km);
export const toKm = (value: number, unit: DistanceUnit) => (unit === "mi" ? value * KM_PER_MI : value);

export function fmtDist(km: number, unit: DistanceUnit): string {
  const v = fromKm(km, unit);
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${unit}`;
}
