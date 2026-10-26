"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { site } from "@/config/site";
import { MAX_TOP_UP, MIN_TOP_UP } from "@/lib/money";
import { randomToken } from "@/lib/random";
import { bonusFor, workspacePreview } from "@/mocks/workspace";
import type { ApiKey, AutoReload, Environment, PaymentMethod, Transaction, User, Workspace } from "@/types/workspace";

export type ConsoleDialog = "add-funds" | "auto-reload" | "command" | null;

interface ConsoleState {
  workspace: Workspace;
  user: User;
  dialog: ConsoleDialog;
  openDialog: (dialog: ConsoleDialog) => void;
  env: Environment;
  setEnv: (env: Environment) => void;
  balance: number;
  /** Adds a top-up of `amount` dollars plus its bonus from the ladder. Returns the bonus, or null if the amount is invalid. */
  addFunds: (amount: number) => number | null;
  autoReload: AutoReload;
  setAutoReload: (value: AutoReload) => void;
  sampleMode: boolean;
  setSampleMode: (value: boolean) => void;
  keys: ApiKey[];
  createKey: (name: string, env: Environment) => string;
  revokeKey: (id: string) => void;
  /** Cards on file, for display only. Cards are added through Stripe's hosted form, never through this app. */
  paymentMethods: PaymentMethod[];
  transactions: Transaction[];
}

const ConsoleContext = createContext<ConsoleState | null>(null);

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Client-side workspace state. Every mutation is local until the console is wired to the API. */
export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [dialog, openDialog] = useState<ConsoleDialog>(null);
  const [env, setEnv] = useState<Environment>("live");
  const [balance, setBalance] = useState(workspacePreview.balance);
  const [autoReload, setAutoReloadState] = useState<AutoReload>(workspacePreview.autoReload);
  // Off until someone asks for it, so nobody mistakes sample charts and logs for their own traffic.
  const [sampleMode, setSampleMode] = useState(false);
  const [keys, setKeys] = useState<ApiKey[]>(workspacePreview.keys);
  const [transactions, setTransactions] = useState<Transaction[]>(workspacePreview.transactions);
  const paymentMethods = workspacePreview.paymentMethods;

  const addFunds = useCallback((input: number) => {
    // The bonus is ours to compute; callers only say how much they pay, in whole cents within the limits.
    const cents = Math.round(input * 100);
    if (!Number.isFinite(input) || Math.abs(cents - input * 100) > 1e-6) return null;
    const amount = cents / 100;
    if (amount < MIN_TOP_UP || amount > MAX_TOP_UP) return null;
    const bonus = bonusFor(amount);
    setBalance((b) => Math.round((b + amount + bonus) * 100) / 100);
    setTransactions((t) => [
      { id: `txn_${randomToken(10)}`, label: "Credit top-up", amount, bonus, date: dateFmt.format(new Date()) },
      ...t,
    ]);
    return bonus;
  }, []);

  // Auto reload charges a card, so it can't be on without one.
  const setAutoReload = useCallback(
    (value: AutoReload) => setAutoReloadState({ ...value, enabled: value.enabled && paymentMethods.length > 0 }),
    [paymentMethods],
  );

  const createKey = useCallback((name: string, keyEnv: Environment) => {
    const secret = `${site.keyPrefix}_${keyEnv}_${randomToken(32)}`;
    setKeys((k) => [
      {
        id: randomToken(8),
        name,
        prefix: `${secret.slice(0, 12)}…${secret.slice(-4)}`,
        env: keyEnv,
        created: dateFmt.format(new Date()),
        lastUsed: null,
      },
      ...k,
    ]);
    return secret;
  }, []);

  const revokeKey = useCallback((id: string) => setKeys((k) => k.filter((key) => key.id !== id)), []);

  const value = useMemo<ConsoleState>(
    () => ({
      workspace: workspacePreview.workspace,
      user: workspacePreview.user,
      dialog,
      openDialog,
      env,
      setEnv,
      balance,
      addFunds,
      autoReload,
      setAutoReload,
      sampleMode,
      setSampleMode,
      keys,
      createKey,
      revokeKey,
      paymentMethods,
      transactions,
    }),
    [dialog, env, balance, addFunds, autoReload, setAutoReload, sampleMode, keys, createKey, revokeKey, paymentMethods, transactions],
  );

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useConsole() {
  const ctx = useContext(ConsoleContext);
  if (!ctx) throw new Error("useConsole must be used inside <ConsoleProvider>");
  return ctx;
}
