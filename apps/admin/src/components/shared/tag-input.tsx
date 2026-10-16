"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A list of short values typed one at a time. Enter (or a comma, unless values
 * may contain commas) adds the text, Backspace on an empty box removes the
 * last value; pasted lists are split.
 */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  normalize = (text) => text.trim(),
  disabled = false,
  invalid = false,
  commas = true,
}: {
  id: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  /** Cleans one value before it is added; an empty result is dropped. */
  normalize?: (text: string) => string;
  disabled?: boolean;
  invalid?: boolean;
  /** Commas separate values; off for values that contain them, such as data URLs. */
  commas?: boolean;
}) {
  const [text, setText] = useState("");
  const separator = commas ? /[\n,]/ : /\n/;

  const add = (raw: string) => {
    const next = raw
      .split(separator)
      .map(normalize)
      .filter((item) => item && !value.includes(item));
    if (next.length > 0) onChange([...value, ...new Set(next)]);
    setText("");
  };

  return (
    <div
      className={cn(
        "flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        invalid && "border-destructive ring-3 ring-destructive/20",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {value.map((item) => (
        <span
          key={item}
          className="inline-flex h-6 max-w-full items-center gap-1 rounded-md bg-muted px-2 font-mono text-xs"
        >
          <span className="truncate">{item}</span>
          <button
            type="button"
            aria-label={`Remove ${item}`}
            disabled={disabled}
            onClick={() => onChange(value.filter((v) => v !== item))}
            className="inline-flex size-4 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        disabled={disabled}
        aria-invalid={invalid}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || (commas && e.key === ",")) {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && text === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          if (separator.test(pasted)) {
            e.preventDefault();
            add(pasted);
          }
        }}
        onBlur={() => text.trim() && add(text)}
        placeholder={value.length === 0 ? placeholder : undefined}
        className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
