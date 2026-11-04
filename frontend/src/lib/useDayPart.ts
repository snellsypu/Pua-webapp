// Which overview fits right now — decided by the server (settings.timezone + reviewTime).
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { DayPart } from "@/lib/types";

export function useDayPart() {
  return useQuery({
    queryKey: ["daypart"],
    queryFn: () => apiGet<DayPart>("/daypart"),
    refetchInterval: 60_000, // flips on its own at the review time
    staleTime: 30_000,
  });
}
