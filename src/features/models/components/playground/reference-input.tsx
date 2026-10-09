"use client";

import { useRef, useState, type DragEvent } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { mediumMeta } from "@/lib/modality";
import type { ReferenceSlot } from "../../lib/playground";

export interface Reference {
  id: number;
  name: string;
  url: string;
  kind: "image" | "video";
}

export function ReferenceInput({
  slot,
  value,
  onChange,
}: {
  slot: ReferenceSlot;
  value: Reference[];
  onChange: (refs: Reference[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const [dragging, setDragging] = useState(false);
  const remaining = slot.max - value.length;
  const kinds = slot.accept.map((m) => mediumMeta[m].label).join(" or ");
  const limit = slot.max > 1 ? `up to ${slot.max}` : "1 file";

  const add = (files: FileList | null) => {
    if (!files) return;
    const picked = [...files]
      .filter((f) => slot.accept.some((m) => f.type.startsWith(`${m}/`)))
      .slice(0, remaining)
      .map((f): Reference => ({
        id: nextId.current++,
        name: f.name,
        url: URL.createObjectURL(f),
        kind: f.type.startsWith("video/") ? "video" : "image",
      }));
    if (picked.length) onChange([...value, ...picked]);
  };

  const remove = (ref: Reference) => {
    URL.revokeObjectURL(ref.url);
    onChange(value.filter((r) => r.id !== ref.id));
  };

  const dropProps = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      add(e.dataTransfer.files);
    },
  };

  const browse = () => inputRef.current?.click();

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={slot.accept.map((m) => `${m}/*`).join(",")}
        multiple={remaining > 1}
        hidden
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />

      {value.length === 0 ? (
        <button
          type="button"
          onClick={browse}
          {...dropProps}
          className={cn(
            "flex h-[124px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition",
            dragging ? "border-white/40 bg-white/[0.05]" : "border-line-strong bg-canvas/30 hover:border-white/25 hover:bg-white/[0.03]",
          )}
        >
          <span className="flex -space-x-2">
            {slot.accept.map((m) => {
              const Icon = mediumMeta[m].icon;
              return (
                <span
                  key={m}
                  className="grid size-9 place-items-center rounded-full border border-line-strong bg-overlay text-fg/80 shadow-lg shadow-black/30"
                >
                  <Icon className="size-4" />
                </span>
              );
            })}
          </span>
          <span className="text-[14px] font-medium text-fg">Add {slot.label.toLowerCase()}</span>
          <span className="text-[12.5px] text-muted">
            {kinds} · {limit}
            {slot.required && (
              <span className="ml-1.5 rounded bg-white/[0.08] px-1.5 py-px text-[11px] font-medium text-fg/80">Required</span>
            )}
          </span>
        </button>
      ) : (
        <div className="rounded-xl border border-line bg-canvas/30 p-2.5" {...dropProps}>
          <div className="mb-2 flex items-center justify-between px-0.5 text-[12.5px]">
            <span className="font-medium text-muted">{slot.label}</span>
            <span className="text-subtle tabular">
              {value.length}/{slot.max}
            </span>
          </div>
          <ul className="flex flex-wrap gap-2">
            {value.map((ref) => (
              <li key={ref.id} className="group relative size-[72px] overflow-hidden rounded-lg border border-line bg-canvas">
                {ref.kind === "video" ? (
                  <video src={ref.url} muted className="size-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL, nothing to optimize
                  <img src={ref.url} alt={ref.name} className="size-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => remove(ref)}
                  aria-label={`Remove ${ref.name}`}
                  className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-[rgb(0_0_0/0.7)] text-[#fff] opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
            {remaining > 0 && (
              <li>
                <button
                  type="button"
                  onClick={browse}
                  aria-label="Add another"
                  className={cn(
                    "grid size-[72px] place-items-center rounded-lg border border-dashed text-muted transition hover:border-white/25 hover:text-fg",
                    dragging ? "border-white/40 text-fg" : "border-line-strong",
                  )}
                >
                  <Plus className="size-4" />
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
