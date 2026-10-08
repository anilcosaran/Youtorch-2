export const chartAccent = "var(--color-iris-400)";

export interface ChartSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface BarDatum {
  label: string;
  tooltip?: string;
  segments: ChartSegment[];
}
