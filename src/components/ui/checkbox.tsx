import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "#/lib/utils"

/**
 * Base UI Checkbox, styled to the warm-orange prototype system. Renders
 * `role="checkbox"` on the root -- `table.tsx` already anticipates that
 * (`[&:has([role=checkbox])]:pr-0`) for use as a selection control in table
 * headers/cells.
 */
function Checkbox({
  className,
  ...props
}: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // Border/fill deliberately higher-contrast than the app's usual
        // #F0E1D5-on-#FFFDF9 control styling: a checkbox has no label text
        // to fall back on, so it must read as a control by shape alone even
        // against the near-identical cream table-row background.
        "peer inline-flex size-[18px] shrink-0 items-center justify-center rounded-md border-2 border-zinc-400 bg-white shadow-sm outline-none transition",
        "hover:border-orange-400",
        "focus-visible:ring-4 focus-visible:ring-orange-100/70 focus-visible:border-orange-400",
        "data-[checked]:border-brand-text data-[checked]:bg-brand-text",
        "data-[indeterminate]:border-brand-text data-[indeterminate]:bg-brand-text",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-white data-[unchecked]:hidden"
      >
        <CheckIcon className="size-3.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
