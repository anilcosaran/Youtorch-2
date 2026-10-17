"use client";

import { RANGES, type Range } from "@/lib/api/client";
import { pick, useUrlState } from "@/lib/use-url-state";
import { Segmented } from "./segmented";

const LABELS: Record<Range, string> = { "7d": "7 days", "30d": "30 days", "90d": "90 days" };

/** The `range` query parameter; 30 days unless the URL says otherwise. */
export function useRange(): [Range, (range: Range) => void] {
  const { get, set } = useUrlState();
  const range = pick(get("range"), RANGES) ?? "30d";
  return [range, (next) => set({ range: next === "30d" ? null : next })];
}

export function RangeSwitch({ value, onChange }: { value: Range; onChange: (range: Range) => void }) {
  return (
    <Segmented
      label="Time range"
      value={value}
      onChange={onChange}
      options={RANGES.map((range) => ({ value: range, label: LABELS[range] }))}
    />
  );
}
