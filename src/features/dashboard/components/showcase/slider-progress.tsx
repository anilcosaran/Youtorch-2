/** One track per slide; the active track sweeps for `duration` and then calls `onComplete`. */
export function SliderProgress({
  labels,
  index,
  duration,
  onSelect,
  onComplete,
}: {
  labels: string[];
  index: number;
  duration: number;
  onSelect: (index: number) => void;
  onComplete: () => void;
}) {
  return (
    <ol className="mt-7 flex gap-3">
      {labels.map((label, i) => (
        <li key={label} className="flex-1">
          <button
            onClick={() => onSelect(i)}
            aria-label={`Show ${label}`}
            aria-current={i === index ? "true" : undefined}
            className="group relative block h-5 w-full"
          >
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/20 transition group-hover:bg-white/40" />
            {i === index && (
              <span className="absolute inset-x-0 top-1/2 h-4 -translate-y-1/2 overflow-hidden">
                <span
                  key={index}
                  onAnimationEnd={onComplete}
                  className="absolute inset-0 animate-sweep"
                  style={{ animationDuration: `${duration}ms` }}
                >
                  <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-white/35 to-white" />
                  <span className="absolute top-1/2 right-0 size-[5px] translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_3px_color-mix(in_oklab,var(--color-white)_75%,transparent)]" />
                </span>
              </span>
            )}
          </button>
        </li>
      ))}
    </ol>
  );
}
