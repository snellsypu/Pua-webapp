// Pick the calendar colour (a Hawaiian flower) for one friend's appointments.
// Default = the flower of the first of their bouquets you joined.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPut } from "@/lib/api";
import type { FlowerKind, SharingState } from "@/lib/types";
import { Flower, FLOWER_KINDS, FLOWER_TONES, flowerFor } from "@/components/Flower";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const friendFlower = (color: FlowerKind | null, bouquetId: string | null | undefined): FlowerKind =>
  color ?? flowerFor(bouquetId);

export function FriendColorPicker({ ownerId, name, color, bouquetId, bouquetName }: {
  ownerId: string; name: string; color: FlowerKind | null; bouquetId: string | null | undefined; bouquetName?: string;
}) {
  const qc = useQueryClient();
  const kind = friendFlower(color, bouquetId);
  const tone = FLOWER_TONES[kind];
  const set = useMutation({
    mutationFn: (c: FlowerKind | null) => apiPut<SharingState>(`/sharing/friends/${ownerId}/color`, { color: c }),
    onSuccess: (s, c) => {
      qc.setQueryData(["sharing"], s);
      qc.invalidateQueries({ queryKey: ["friends-calendar"] });
      toast.success(`${name}'s appointments now show in ${FLOWER_TONES[c ?? flowerFor(bouquetId)].label}`);
    },
    onError: () => toast.error("Couldn't change the colour"),
  });
  return (
    <Popover>
      <PopoverTrigger
        className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-[box-shadow,transform] duration-150 hover:ring-2 hover:ring-foreground/10 active:scale-95", tone.chip)}
        data-testid={`friend-color-${ownerId}`} aria-label={`Calendar colour for ${name}`}>
        <Flower kind={kind} className="size-4" /> {name}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60" data-testid={`friend-color-menu-${ownerId}`}>
        <p className="text-xs font-medium text-muted-foreground">{name}&apos;s calendar colour</p>
        <div className="grid grid-cols-5 gap-1.5">
          {FLOWER_KINDS.map((k) => (
            <button key={k} type="button" title={FLOWER_TONES[k].label} aria-label={FLOWER_TONES[k].label} aria-pressed={kind === k}
              onClick={() => set.mutate(k)} disabled={set.isPending} data-testid={`friend-color-${ownerId}-${k}`}
              className={cn("grid aspect-square place-items-center rounded-xl border transition-[transform,border-color,background-color] duration-150 hover:scale-105",
                kind === k ? "border-foreground/40 bg-accent" : "border-transparent")}>
              <Flower kind={k} className="size-6" />
            </button>
          ))}
        </div>
        {color && (
          <button type="button" onClick={() => set.mutate(null)} disabled={set.isPending} data-testid={`friend-color-${ownerId}-reset`}
            className="rounded-lg px-2 py-1 text-left text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground">
            Use the {bouquetName ? `${bouquetName} ` : ""}bouquet colour ({FLOWER_TONES[flowerFor(bouquetId)].label})
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
