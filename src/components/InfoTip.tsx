import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Small ⓘ next to a heading or control explaining what it shows. Opens on hover
 * and on keyboard focus.
 *
 * The trigger is a <span>, not a <button>, so it can sit inside a tab trigger or
 * a clickable card without nesting a button in a button — and it swallows the
 * press so tapping the tip never activates whatever it sits inside.
 */
export function InfoTip({ text, className = "" }: { text: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label={text}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
          className={`inline-flex shrink-0 align-middle text-muted-foreground/60 hover:text-primary transition-colors cursor-help ${className}`}
        >
          <Info className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[16rem] text-xs leading-relaxed font-normal">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
