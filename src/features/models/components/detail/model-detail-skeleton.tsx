export function ModelDetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading model">
      <div className="h-16 w-96 max-w-full animate-pulse rounded-[var(--radius-card)] bg-white/[0.03]" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[74px] animate-pulse rounded-[var(--radius-card)] bg-white/[0.03]" />
        ))}
      </div>
      <div className="h-[420px] animate-pulse rounded-[var(--radius-card)] bg-white/[0.03]" />
    </div>
  );
}
