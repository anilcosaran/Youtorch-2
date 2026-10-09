export function ModelDetailSkeleton() {
  return (
    <div className="@container space-y-6" aria-busy="true" aria-label="Loading model">
      <div className="h-16 w-96 max-w-full animate-pulse rounded-[var(--radius-card)] bg-white/[0.03]" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[66px] animate-pulse rounded-[var(--radius-card)] bg-white/[0.03]" />
        ))}
      </div>
      <div className="h-12 border-b border-line" />
      <div className="grid gap-5 @4xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
        <div className="h-[480px] animate-pulse rounded-[var(--radius-card)] bg-white/[0.03]" />
        <div className="h-[480px] animate-pulse rounded-[var(--radius-card)] bg-white/[0.03]" />
      </div>
    </div>
  );
}
