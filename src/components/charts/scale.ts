/** Round axis ticks from zero that cover `max`, e.g. 34.4 → [0, 10, 20, 30, 40]. */
export function niceTicks(max: number, count = 4) {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
  const steps = Math.ceil(max / step - 1e-9);
  return Array.from({ length: steps + 1 }, (_, i) => +(i * step).toPrecision(12));
}

/** Axis labels drop trailing zero decimals: "$40.00" → "$40", "12.0s" → "12s". */
export function axisLabel(format: (value: number) => string) {
  return (value: number) => format(value).replace(/\.0+(?=\D*$)/, "");
}

/** Indices to label on an x axis, counted back from the newest so it is always labelled. */
export function labelIndices(count: number, slot: number, minGap = 64) {
  const step = Math.max(1, Math.ceil(minGap / Math.max(slot, 1)));
  const indices: number[] = [];
  for (let i = count - 1; i >= 0; i -= step) indices.unshift(i);
  return indices;
}

/** Approximate rendered width of an 11px tabular label. */
export function labelWidth(labels: string[]) {
  return Math.max(0, ...labels.map((l) => l.length)) * 6.6;
}
