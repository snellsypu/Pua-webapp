"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { cn } from "@/lib/utils"
import { Flower, flowerFor, type FlowerKind } from "@/components/Flower"

// Ticks bloom into a Hawaiian flower (plumeria, hibiscus, ʻilima, lehua) instead of a ✓.
function Checkbox({ className, flower, ...props }: CheckboxPrimitive.Root.Props & { flower?: FlowerKind }) {
  const kind = flower ?? flowerFor(props.id ?? ((props as Record<string, unknown>)["data-testid"] as string | undefined))
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-full border border-input transition-[border-color,background-color,box-shadow] duration-150 outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 hover:border-primary/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-transparent data-checked:bg-transparent dark:data-checked:bg-transparent",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="pointer-events-none absolute inset-0 grid place-content-center"
      >
        <Flower kind={kind} className="pua-bloom size-5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
