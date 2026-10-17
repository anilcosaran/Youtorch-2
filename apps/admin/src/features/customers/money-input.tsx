import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DOLLARS = /^\d+(\.\d{0,2})?$/;

/**
 * A typed dollar amount: null when the box is empty, NaN when it isn't an
 * amount with at most two decimals. A leading "$" and thousands commas are fine.
 */
export function parseDollars(text: string): number | null {
  const clean = text.trim().replace(/^\$/, "").replace(/,/g, "");
  if (clean === "") return null;
  return DOLLARS.test(clean) ? Number(clean) : Number.NaN;
}

/** A text box for US dollars, with the sign in front. */
export function MoneyInput({
  id,
  value,
  onChange,
  placeholder,
  invalid = false,
  autoFocus = false,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground"
      >
        $
      </span>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid}
        className="pl-6 tabular"
      />
    </div>
  );
}
