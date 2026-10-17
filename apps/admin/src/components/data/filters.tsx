"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** One row of filters above a list. */
export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

/**
 * A search box that reports its text after a short pause. It follows `value`
 * when that changes from outside, e.g. when the filters are cleared.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  suggestions,
  className,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  /** Values offered while typing. */
  suggestions?: string[];
  className?: string;
}) {
  const listId = useId();
  const current = value ?? "";
  const [text, setText] = useState(current);
  const [synced, setSynced] = useState(current);
  if (current !== synced) {
    setSynced(current);
    if (current !== text.trim()) setText(current);
  }

  useEffect(() => {
    if (text.trim() === current) return;
    const timer = setTimeout(() => onChange(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text, current, onChange]);

  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onChange(text.trim());
        }}
        placeholder={placeholder}
        aria-label={label}
        list={suggestions?.length ? listId : undefined}
        className="pl-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {suggestions && suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
      {text && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setText("");
            onChange("");
          }}
          className="absolute top-1/2 right-1.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

const ALL = "__all";

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

/** A labelled select whose first option clears the filter. */
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  allLabel = "All",
  className,
}: {
  label: string;
  value: T | undefined;
  options: FilterOption<T>[];
  onChange: (value: T | undefined) => void;
  allLabel?: string;
  className?: string;
}) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL ? undefined : (next as T))}
    >
      <SelectTrigger aria-label={label} className={cn("min-w-32", className)}>
        <span className="text-muted-foreground">{label}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Resets every filter of a list; hidden while none is set. */
export function ClearFilters({ active, onClear }: { active: boolean; onClear: () => void }) {
  if (!active) return null;
  return (
    <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground">
      <X /> Clear filters
    </Button>
  );
}
