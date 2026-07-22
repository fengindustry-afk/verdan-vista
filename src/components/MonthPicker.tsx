import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function label(value: string): string {
  const [y, m] = value.split("-");
  const i = Number(m) - 1;
  return MONTHS[i] ? `${MONTHS[i]} ${y}` : "Any month";
}

/**
 * Month filter in the app's own styling. The native <input type="month"> popup is
 * browser chrome — unthemeable, and jarringly different per platform — so this
 * uses the same Popover the rest of the app does.
 *
 * Value is "yyyy-mm", or "" for no filter, matching the native input it replaces.
 */
export function MonthPicker({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number(value.slice(0, 4)) || new Date().getFullYear());
  const selectedYear = value.slice(0, 4);
  const selectedMonth = value.slice(5, 7);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm transition-colors hover:bg-muted/40 ${
            value ? "text-foreground" : "text-muted-foreground"
          } ${className}`}
        >
          <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
          {value ? label(value) : "Any month"}
          {value && (
            <X
              className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Previous year"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-foreground">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Next year"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {MONTHS.map((m, i) => {
            const mm = String(i + 1).padStart(2, "0");
            const active = selectedYear === String(year) && selectedMonth === mm;
            return (
              <button
                key={m}
                onClick={() => {
                  onChange(`${year}-${mm}`);
                  setOpen(false);
                }}
                className={`rounded-md py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>

        {value && (
          <button
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="mt-3 w-full rounded-md border border-border py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Clear month
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
