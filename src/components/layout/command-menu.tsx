"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, CreditCard, Database, KeyRound, Search, Sparkles, type LucideIcon } from "lucide-react";
import { models } from "@/mocks/models";
import { cn } from "@/lib/cn";
import { useConsole } from "@/providers/console-provider";
import { flatNav } from "./nav-config";

interface Command {
  id: string;
  group: "Pages" | "Models" | "Actions";
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

export function CommandMenu() {
  const router = useRouter();
  const { dialog, openDialog, sampleMode, setSampleMode } = useConsole();
  const open = dialog === "command";
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openDialog(open ? null : "command");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openDialog]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    return [
      ...flatNav
        .filter((n) => !n.external)
        .map((n) => ({ id: n.href, group: "Pages" as const, label: n.label, icon: n.icon, run: go(n.href) })),
      ...models.map((m) => ({
        id: m.slug,
        group: "Models" as const,
        label: m.name,
        hint: m.provider,
        icon: Sparkles,
        run: go(`/models/${m.slug}`),
      })),
      { id: "a-funds", group: "Actions", label: "Add credits", icon: CreditCard, run: () => openDialog("add-funds") },
      { id: "a-key", group: "Actions", label: "Create API key", icon: KeyRound, run: go("/api-keys?new=1") },
      {
        id: "a-sample",
        group: "Actions",
        label: sampleMode ? "Hide sample data" : "Preview with sample data",
        icon: Database,
        run: () => setSampleMode(!sampleMode),
      },
    ];
  }, [router, openDialog, sampleMode, setSampleMode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.filter((c) => c.group !== "Models" || ["lumen-1", "kling-3", "flux-2-pro"].includes(c.id));
    return commands.filter((c) => `${c.label} ${c.hint ?? ""}`.toLowerCase().includes(q));
  }, [commands, query]);

  const close = () => {
    openDialog(null);
    setQuery("");
    setActive(0);
  };

  const run = (command: Command | undefined) => {
    if (!command) return;
    const next = command.id === "a-funds" ? "add-funds" : null;
    command.run();
    if (!next) close();
    else {
      setQuery("");
      setActive(0);
    }
  };

  const ordered = (["Pages", "Models", "Actions"] as const).flatMap((group) => filtered.filter((c) => c.group === group));
  const groups = (["Pages", "Models", "Actions"] as const)
    .map((group) => ({
      group,
      items: ordered.map((command, index) => ({ command, index })).filter(({ command }) => command.group === group),
    }))
    .filter((g) => g.items.length);

  return (
    <dialog
      ref={ref}
      onClose={close}
      onClick={(e) => e.target === e.currentTarget && close()}
      className="mx-auto mt-[12vh] w-[min(92vw,560px)] overflow-visible bg-transparent p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      {open && (
        <div className="animate-fade-up overflow-hidden surface bg-raised shadow-2xl shadow-black/70">
          <div className="flex items-center gap-2.5 border-b border-line px-4">
            <Search className="size-4 text-subtle" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, filtered.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  run(ordered[active]);
                }
              }}
              placeholder="Search pages, models and actions…"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
            />
            <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-subtle">ESC</kbd>
          </div>
          <div className="max-h-[52vh] overflow-y-auto p-2">
            {groups.length === 0 && <p className="px-3 py-8 text-center text-[14px] text-subtle">No results for “{query}”.</p>}
            {groups.map(({ group, items }) => (
              <div key={group} className="mb-1">
                <p className="px-2.5 pt-2 pb-1 font-mono text-[11px] tracking-[0.16em] text-subtle uppercase">{group}</p>
                {items.map(({ command, index }) => {
                  const isActive = index === active;
                  const Icon = command.icon;
                  return (
                    <button
                      key={command.id}
                      onMouseMove={() => setActive(index)}
                      onClick={() => run(command)}
                      className={cn(
                        "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[14px]",
                        isActive ? "bg-white/[0.06] text-fg" : "text-muted",
                      )}
                    >
                      <Icon className={cn("size-4", isActive ? "text-ember-400" : "text-subtle")} />
                      <span className="flex-1">{command.label}</span>
                      {command.hint && <span className="text-[12px] text-subtle">{command.hint}</span>}
                      {isActive && <CornerDownLeft className="size-3.5 text-subtle" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </dialog>
  );
}
