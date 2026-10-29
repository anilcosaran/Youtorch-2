import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export { DECIMAL_COMMA_MESSAGE, dollarsError, parseDollars } from "./money";

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
