"use client";

import { useState } from "react";
import { ChevronDown, Dices, RotateCcw, SlidersHorizontal, Sparkles } from "lucide-react";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { formatPrice, formatUsd } from "@/lib/format";
import { madeBy } from "@/lib/model";
import type { Model } from "@/types/model";
import { ModelArt } from "../model-art";
import {
  isSpeech,
  modeControl,
  modeLabel,
  promptCopy,
  type Control,
  type ControlValue,
  type CostEstimate,
  type PlaygroundValues,
  type ReferenceSlot,
} from "../../lib/playground";
import { ReferenceInput, type Reference } from "./reference-input";
import { SettingChip } from "./setting-chip";

export const promptFieldId = "playground-prompt";

const card = "rounded-xl border border-line bg-canvas/50";

export function PlaygroundForm({
  model,
  modes,
  mode,
  onMode,
  prompt,
  onPrompt,
  slot,
  references,
  onReferences,
  controls,
  values,
  onValue,
  cost,
  balance,
  canRun,
  onRun,
  onReset,
  onAddFunds,
}: {
  model: Model;
  modes: string[];
  mode?: string;
  onMode: (mode: string) => void;
  prompt: string;
  onPrompt: (prompt: string) => void;
  slot: ReferenceSlot | null;
  references: Reference[];
  onReferences: (refs: Reference[]) => void;
  controls: Control[];
  values: PlaygroundValues;
  onValue: (id: string, value: ControlValue) => void;
  cost: CostEstimate;
  balance: number;
  canRun: boolean;
  onRun: () => void;
  onReset: () => void;
  onAddFunds: () => void;
}) {
  const copy = promptCopy(model, slot);
  const blocked = balance < cost.total;
  const quick = controls.filter((c) => c.group === "quick");
  const toggles = controls.filter((c) => c.group === "toggle");
  const advanced = controls.filter((c) => c.group === "advanced");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onRun();
      }}
      className="flex flex-col gap-2 rounded-2xl border border-line bg-surface/60 p-2"
    >
      <div className="flex items-center gap-3 rounded-xl bg-canvas/60 p-1.5 pl-2.5">
        <ModelArt model={model} className="size-8 shrink-0 rounded-lg ring-1 ring-white/10" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-fg">{model.name}</p>
          <p className="truncate text-[12px] text-muted">{madeBy(model)}</p>
        </div>
        {modes.length > 1 && mode ? (
          <SettingChip control={modeControl(modes, mode)} value={mode} onChange={onMode} align="end" className="flex-none" />
        ) : (
          modes[0] && <span className="pr-2 text-[13px] text-muted">{modeLabel(modes[0])}</span>
        )}
      </div>

      {slot && <ReferenceInput key={slot.label} slot={slot} value={references} onChange={onReferences} />}

      <div className={cn(card, "transition focus-within:border-white/25")}>
        <label htmlFor={promptFieldId} className="flex items-center justify-between px-3 pt-2.5 text-[12.5px] font-medium text-muted">
          {copy.label}
          {slot?.required && <span className="font-normal text-subtle">optional</span>}
        </label>
        <textarea
          id={promptFieldId}
          rows={5}
          value={prompt}
          onChange={(e) => onPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onRun();
            }
          }}
          placeholder={copy.placeholder}
          className="block [field-sizing:content] max-h-80 min-h-36 w-full resize-none bg-transparent px-3 pt-1.5 text-[15px] leading-relaxed text-fg outline-none placeholder:text-subtle"
        />
        <div className="flex items-center gap-1.5 px-2 pt-1 pb-2">
          {toggles.map((t) => {
            const on = values[t.id] === true;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => onValue(t.id, !on)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[12.5px] font-medium transition",
                  on ? "border-line-strong bg-white/[0.07] text-fg" : "border-line text-muted hover:text-fg",
                )}
              >
                <t.icon className="size-3.5" /> {t.label}
                <span className={on ? "text-jade-400" : "text-subtle"}>{on ? "On" : "Off"}</span>
              </button>
            );
          })}
          <span className="flex-1" />
          <span className="pr-1 text-[11.5px] text-subtle tabular">{isSpeech(model) ? `${prompt.length} chars` : "⌘/Ctrl ↵"}</span>
        </div>
      </div>

      {quick.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${quick.length}, minmax(0, 1fr))` }}>
          {quick.map((c, i) =>
            c.kind === "choice" ? (
              <SettingChip
                key={c.id}
                control={c}
                value={String(values[c.id])}
                onChange={(v) => onValue(c.id, v)}
                align={i === quick.length - 1 && quick.length > 1 ? "end" : "start"}
              />
            ) : null,
          )}
        </div>
      )}

      {advanced.length > 0 && <AdvancedSettings controls={advanced} values={values} onValue={onValue} />}

      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={onReset}
          aria-label="Reset"
          title="Reset"
          className="grid size-12 shrink-0 place-items-center rounded-xl border border-line text-muted transition hover:border-line-strong hover:text-fg"
        >
          <RotateCcw className="size-4" />
        </button>
        {blocked ? (
          <button
            type="button"
            onClick={onAddFunds}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-line-strong text-[15px] font-semibold text-fg transition hover:bg-white/[0.06]"
          >
            Add credits to generate
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canRun}
            title={canRun ? undefined : slot?.required ? `Add a ${slot.label.toLowerCase()} first` : "Write a prompt first"}
            className="group flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-white text-[15px] font-semibold text-black transition hover:bg-white/90 active:translate-y-px disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-subtle"
          >
            <Sparkles className="size-4" /> Generate
            <span className="ml-1 inline-flex items-baseline gap-1.5 rounded-md bg-black/[0.08] px-2 py-0.5 text-[13px] tabular group-disabled:bg-white/[0.06]">
              {cost.list > cost.total + 0.00005 && <s className="text-[12px] opacity-50">{formatPrice(cost.list)}</s>}
              {formatPrice(cost.total)}
            </span>
          </button>
        )}
      </div>
      <p className="truncate px-1 pb-0.5 text-center text-[12px] text-subtle tabular" title={cost.detail}>
        {blocked ? `Your balance (${formatUsd(balance)}) doesn’t cover this run.` : `${cost.detail} · billed to your balance`}
      </p>
    </form>
  );
}

function AdvancedSettings({
  controls,
  values,
  onValue,
}: {
  controls: Control[];
  values: PlaygroundValues;
  onValue: (id: string, value: ControlValue) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={card}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full items-center gap-2.5 px-3 text-[14px] font-medium text-fg"
      >
        <SlidersHorizontal className="size-4 text-muted" /> Advanced settings
        <span className="flex-1" />
        <ChevronDown className={cn("size-4 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          {controls.map((c) => (
            <div key={c.id} className="flex min-h-8 items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[13.5px] text-muted">
                <c.icon className="size-3.5" /> {c.label}
              </span>
              {c.kind === "choice" ? (
                <Select
                  label={c.label}
                  value={String(values[c.id])}
                  onChange={(v) => onValue(c.id, v)}
                  options={c.options}
                  align="end"
                  className="min-w-36"
                />
              ) : c.kind === "seed" ? (
                <SeedInput value={String(values[c.id] ?? "")} onChange={(v) => onValue(c.id, v)} />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeedInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        inputMode="numeric"
        aria-label="Seed"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
        placeholder="Random"
        className="h-8 w-28 rounded-lg border border-line bg-white/[0.025] px-2.5 text-[13px] text-fg tabular outline-none placeholder:text-subtle focus:border-white/25"
      />
      <button
        type="button"
        onClick={() => onChange(String(Math.floor(Math.random() * 1e9)))}
        aria-label="Random seed"
        title="Random seed"
        className="grid size-8 place-items-center rounded-lg border border-line text-muted transition hover:border-line-strong hover:text-fg"
      >
        <Dices className="size-3.5" />
      </button>
    </div>
  );
}
