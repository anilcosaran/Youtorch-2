"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ArrowRight, Boxes, CornerDownLeft, LoaderCircle, Search, type LucideIcon } from "lucide-react";
import { errorMessage } from "@modelvend/admin-api/client";
import { listCustomers, type CustomerRow } from "@modelvend/admin-api/customers";
import { listModels, type ModelSummary } from "@modelvend/admin-api/models";
import { Monogram } from "@/components/shared/monogram";
import { CustomerStatusPill, ModelStatePill } from "@/components/shared/status";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { modelHref } from "@/lib/catalog";
import { keys } from "@/lib/query-keys";
import { matchesQuery } from "@/lib/search";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { visibleNav } from "./nav";

const PaletteContext = createContext<() => void>(() => {});

/** Opens the command palette. */
export const useCommandPalette = () => useContext(PaletteContext);

const noopSubscribe = () => () => {};

/** "⌘K" on Apple devices, "Ctrl K" elsewhere (and before hydration). */
export function useShortcutLabel(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"),
    () => "Ctrl K",
  );
}

/** Mounts the palette and opens it with Ctrl K (⌘K on a Mac) anywhere in the console. */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <PaletteContext.Provider value={show}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <DialogTitle className="sr-only">Search the console</DialogTitle>
          <DialogDescription className="sr-only">
            Go to a page, or find a model or a customer.
          </DialogDescription>
          {/* Mounted only while open, so every visit starts empty. */}
          {open && <PaletteBody onClose={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </PaletteContext.Provider>
  );
}

interface PageOption {
  kind: "page";
  key: string;
  href: string;
  label: string;
  group?: string;
  icon: LucideIcon;
  tone?: "warning";
}

type Option =
  | PageOption
  | { kind: "model"; key: string; href: string; model: ModelSummary }
  | { kind: "customer"; key: string; href: string; customer: CustomerRow }
  | { kind: "all"; key: string; href: string; query: string };

const MIN_SEARCH = 2;
const CUSTOMER_RESULTS = 6;
const MODEL_RESULTS = 5;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { allows, can } = useSession();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const term = query.trim();
  const searchTerm = useDebounced(term, 250);
  // Finding customers needs the right to see them; pages are filtered the same way as the sidebar.
  const findsCustomers = can.viewCustomers;
  const searching = findsCustomers && searchTerm.length >= MIN_SEARCH;

  const customers = useQuery({
    queryKey: keys.customerSearch(searchTerm),
    queryFn: () => listCustomers({ query: searchTerm, limit: CUSTOMER_RESULTS }),
    enabled: searching,
    staleTime: 30_000,
  });
  const findsModels = can.viewCatalog && searchTerm.length >= MIN_SEARCH;
  const models = useQuery({
    queryKey: keys.modelSearch(searchTerm),
    queryFn: () => listModels({ query: searchTerm, limit: MODEL_RESULTS }),
    enabled: findsModels,
    staleTime: 30_000,
  });

  const pages: PageOption[] = visibleNav(allows).flatMap((group) =>
    group.items
      .filter((item) => matchesQuery(term, item.label, item.keywords, group.label))
      .map((item) => ({
        kind: "page" as const,
        key: `page:${item.href}`,
        href: item.href,
        label: item.label,
        group: group.label,
        icon: item.icon,
        tone: item.tone,
      })),
  );
  const people: Option[] =
    searching && customers.data
      ? customers.data.items.map((customer) => ({
          kind: "customer" as const,
          key: `customer:${customer.id}`,
          href: `/customers/${customer.id}`,
          customer,
        }))
      : [];
  if (searching && customers.data?.nextCursor) {
    people.push({
      kind: "all",
      key: "all",
      href: `/customers?query=${encodeURIComponent(searchTerm)}`,
      query: searchTerm,
    });
  }
  const catalog: Option[] =
    findsModels && models.data
      ? models.data.items.map((model) => ({
          kind: "model" as const,
          key: `model:${model.id}`,
          href: modelHref(model.id),
          model,
        }))
      : [];
  const options = [...pages, ...catalog, ...people];
  const active = options.find((option) => option.key === activeKey) ?? options[0];

  useEffect(() => {
    if (!active) return;
    document.getElementById(`${listId}-${active.key}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  const go = (option: Option | undefined) => {
    if (!option) return;
    onClose();
    router.push(option.href);
  };

  const move = (step: number) => {
    if (options.length === 0) return;
    const index = active ? options.indexOf(active) : -1;
    setActiveKey(options[(index + step + options.length) % options.length].key);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(active);
    }
  };

  const optionProps = (option: Option) => ({
    id: `${listId}-${option.key}`,
    role: "option" as const,
    "aria-selected": option === active,
    onClick: () => go(option),
    onMouseMove: () => option !== active && setActiveKey(option.key),
    className: cn(
      "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[13px] select-none",
      option === active ? "bg-foreground/8 text-foreground" : "text-foreground/90",
    ),
  });

  let customerStatus: ReactNode = null;
  if (term.length < MIN_SEARCH) {
    customerStatus = "Type a workspace name or a member's email to find a customer.";
  } else if (customers.error && !customers.data) {
    customerStatus = `Couldn't search customers. ${errorMessage(customers.error)}`;
  } else if (!searching || customers.isPending || (customers.isFetching && people.length === 0)) {
    customerStatus = (
      <span className="flex items-center gap-2">
        <LoaderCircle className="size-3.5 animate-spin" /> Searching customers…
      </span>
    );
  } else if (people.length === 0) {
    customerStatus = `No customers match “${searchTerm}”.`;
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <input
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active ? `${listId}-${active.key}` : undefined}
          aria-label={findsCustomers ? "Search pages, models and customers" : "Search pages and models"}
          placeholder={findsCustomers ? "Search pages, models and customers…" : "Search pages and models…"}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveKey(null);
          }}
          onKeyDown={onKeyDown}
          className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <kbd className="hidden h-5 items-center rounded border px-1.5 font-sans text-[10px] text-muted-foreground sm:inline-flex">
          Esc
        </kbd>
      </div>
      <div
        id={listId}
        role="listbox"
        aria-label="Results"
        className="scroll-thin max-h-[min(60vh,420px)] overflow-y-auto p-1.5"
      >
        {pages.length > 0 && (
          <div role="group" aria-labelledby={`${listId}-pages`} className="pb-1">
            <div id={`${listId}-pages`} className="px-2 pt-1 pb-1 text-[11px] font-medium text-muted-foreground">
              Pages
            </div>
            {pages.map((option) => (
              <div key={option.key} {...optionProps(option)}>
                <option.icon
                  className={cn("size-4 shrink-0", option.tone === "warning" ? "text-warning" : "text-muted-foreground")}
                  strokeWidth={1.75}
                />
                <span className="truncate">{option.label}</span>
                {option.group && <span className="text-xs text-muted-foreground">{option.group}</span>}
                {option === active && <CornerDownLeft className="ml-auto size-3.5 text-muted-foreground" />}
              </div>
            ))}
          </div>
        )}
        {pages.length === 0 && !findsCustomers && (
          <p role="status" className="px-2 py-2 text-[13px] text-muted-foreground">
            No pages match “{term}”.
          </p>
        )}
        {catalog.length > 0 && (
          <div role="group" aria-labelledby={`${listId}-models`} className="pb-1">
            <div id={`${listId}-models`} className="px-2 pt-1 pb-1 text-[11px] font-medium text-muted-foreground">
              Models
            </div>
            {catalog.map((option) =>
              option.kind === "model" ? (
                <div key={option.key} {...optionProps(option)}>
                  <Boxes className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{option.model.name}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{option.model.id}</span>
                  </span>
                  <ModelStatePill state={option.model.state} />
                </div>
              ) : null,
            )}
          </div>
        )}
        {findsCustomers && (
          <div role="group" aria-labelledby={`${listId}-customers`}>
            <div id={`${listId}-customers`} className="px-2 pt-1 pb-1 text-[11px] font-medium text-muted-foreground">
              Customers
            </div>
            {people.map((option) => {
              if (option.kind === "customer") {
                const { customer } = option;
                return (
                  <div key={option.key} {...optionProps(option)}>
                    <Monogram name={customer.name} className="size-6 text-[9px]" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{customer.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{customer.owner.email}</span>
                    </span>
                    <CustomerStatusPill status={customer.status} />
                  </div>
                );
              }
              if (option.kind === "all") {
                return (
                  <div key={option.key} {...optionProps(option)}>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                    <span className="truncate">See every customer matching “{option.query}”</span>
                  </div>
                );
              }
              return null;
            })}
            {customerStatus && (
              <p role="status" className="px-2 py-2 text-[13px] text-muted-foreground">
                {customerStatus}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="hidden items-center gap-4 border-t px-3 py-2 text-[11px] text-muted-foreground sm:flex">
        <span>
          <kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> to move
        </span>
        <span>
          <kbd className="font-sans">Enter</kbd> to open
        </span>
        <span>
          <kbd className="font-sans">Esc</kbd> to close
        </span>
      </div>
    </>
  );
}
