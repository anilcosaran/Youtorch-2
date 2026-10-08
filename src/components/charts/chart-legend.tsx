export function ChartLegend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-2 text-[13px] text-muted">
          <span className="size-2.5 rounded-[2px]" style={{ background: item.color }} />
          {item.value && <span className="text-fg tabular">{item.value}</span>}
          {item.label}
        </span>
      ))}
    </div>
  );
}
