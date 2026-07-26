import { useState } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Small ⓘ next to a heading or control explaining what it shows. Tap to open on
 * touch, hover or keyboard focus on a mouse.
 *
 * Built on Popover rather than Tooltip because Radix tooltips ignore touch by
 * design, which left half the tips unreadable on a phone. Hover is added back
 * with mouse handlers, so both pointer types get the same text.
 *
 * The trigger is a <span>, not a <button>, so it can sit inside a tab trigger or
 * a clickable card without nesting a button in a button — and it swallows the
 * press so tapping the tip never activates whatever it sits inside.
 */
export function InfoTip({ text, className = "" }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label={text}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          className={`inline-flex shrink-0 align-middle text-muted-foreground/60 hover:text-primary transition-colors cursor-help ${className}`}
        >
          <Info className="h-3.5 w-3.5" />
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-auto max-w-[16rem] px-3 py-2 text-xs leading-relaxed font-normal"
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}
