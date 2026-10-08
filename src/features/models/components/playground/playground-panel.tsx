"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatPrice, formatUsd } from "@/lib/format";
import { discounted } from "@/lib/pricing";
import { useConsole } from "@/providers/console-provider";
import type { Model } from "@/types/model";
import { ModelArt } from "../model-art";
import { PlaygroundOutput, RenderProgress } from "./playground-output";
import { outputFrame, promptSuggestions } from "./prompts";
import { useSimulatedRender } from "./use-simulated-render";

interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  progress?: number;
  status?: "rendering" | "done" | "blocked";
}

export function PlaygroundPanel({ model, initialPrompt = "", onClose }: { model: Model; initialPrompt?: string; onClose: () => void }) {
  const { balance, openDialog } = useConsole();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState(initialPrompt);
  const render = useSimulatedRender();
  const listRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const cost = discounted(model);
  const blocked = balance < cost;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const update = (id: number, patch: Partial<Message>) => setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const send = (text: string) => {
    const prompt = text.trim();
    if (!prompt) return;
    const userId = nextId.current++;
    const replyId = nextId.current++;
    setDraft("");
    setMessages((list) => [
      ...list,
      { id: userId, role: "user", text: prompt },
      { id: replyId, role: "assistant", text: prompt, status: blocked ? "blocked" : "rendering", progress: 0 },
    ]);
    if (blocked) return;
    render(
      (p) => update(replyId, { progress: p }),
      () => update(replyId, { status: "done" }),
    );
  };

  const busy = messages.some((m) => m.status === "rendering");

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line pr-3 pl-5">
        <span className="text-[15px] font-semibold text-fg">Playground</span>
        <span className="truncate text-[13px] text-muted">{model.name}</span>
        <span className="flex-1" />
        <button
          onClick={onClose}
          aria-label="Close playground"
          className="grid size-8 place-items-center rounded-md text-muted transition hover:bg-white/[0.06] hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-5">
        {messages.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <Sparkles className="mx-auto size-5 text-fg" />
              <p className="mt-3 text-[14px] text-muted">Enter a prompt to try it</p>
            </div>
          </div>
        ) : (
          <ul className="space-y-5">
            {messages.map((m) =>
              m.role === "user" ? (
                <li key={m.id} className="flex animate-fade-up justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-white/[0.08] px-3.5 py-2 text-[14px] leading-relaxed text-fg">
                    {m.text}
                  </p>
                </li>
              ) : (
                <li key={m.id} className="flex animate-fade-up gap-2.5">
                  <ModelArt model={model} className="mt-0.5 size-6 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1">
                    {m.status === "blocked" ? (
                      <div className="rounded-lg border border-line bg-canvas p-3 text-[14px]">
                        <p className="text-fg">Your balance doesn’t cover this request ({formatPrice(cost)}).</p>
                        <Button variant="primary" size="sm" className="mt-3" onClick={() => openDialog("add-funds")}>
                          Add credits
                        </Button>
                      </div>
                    ) : (
                      <div className={cn("relative overflow-hidden rounded-lg border border-line bg-canvas", outputFrame[model.modality])}>
                        {m.status === "done" ? (
                          <PlaygroundOutput
                            model={model}
                            caption={`${model.unitDetail ?? model.unit} · ${cost < 1 ? formatPrice(cost) : formatUsd(cost)}`}
                          />
                        ) : (
                          <div className="absolute inset-0 grid place-items-center">
                            <RenderProgress value={m.progress ?? 0} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      <div className="shrink-0 space-y-2.5 px-4 pb-4">
        {messages.length === 0 && (
          <ul className="space-y-1.5">
            {promptSuggestions[model.modality].map((s) => (
              <li key={s}>
                <button
                  onClick={() => send(s)}
                  className="w-full truncate rounded-md border border-line px-3 py-2 text-left text-[13.5px] text-fg/85 transition hover:border-line-strong hover:text-fg"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="rounded-lg border border-line-strong bg-canvas transition focus-within:border-white/30"
        >
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            placeholder="Enter your message..."
            className="block w-full resize-none bg-transparent px-3 pt-2.5 text-[14px] leading-relaxed outline-none placeholder:text-subtle"
          />
          <div className="flex justify-end p-2 pt-0">
            <button
              type="submit"
              aria-label="Send"
              disabled={!draft.trim() || busy}
              className="grid size-7 place-items-center rounded-md bg-white text-canvas transition hover:bg-white/85 disabled:opacity-30"
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
        </form>
        <p className="text-[12px] text-subtle">
          Outputs are AI-generated. {formatPrice(cost)} per {model.unit}, billed to your balance.
        </p>
      </div>
    </div>
  );
}
