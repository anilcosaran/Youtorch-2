"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { site } from "@/config/site";
import { randomToken } from "@/lib/random";
import { workspacePreview } from "@/mocks/workspace";
import type { ApiKey, AutoReload, Environment, PaymentMethod, Transaction } from "@/types/workspace";

export type ConsoleDialog = "add-funds" | "auto-reload" | "add-card" | "command" | null;

interface ConsoleState {
  dialog: ConsoleDialog;
  openDialog: (dialog: ConsoleDialog) => void;
  env: Environment;
  setEnv: (env: Environment) => void;
  balance: number;
  addFunds: (amount: number, bonus?: number) => void;
  autoReload: AutoReload;
  setAutoReload: (value: AutoReload) => void;
  sampleMode: boolean;
  setSampleMode: (value: boolean) => void;
  keys: ApiKey[];
  createKey: (name: string, env: Environment) => string;
  revokeKey: (id: string) => void;
  paymentMethods: PaymentMethod[];
  addPaymentMethod: (method: Omit<PaymentMethod, "id">) => void;
  transactions: Transaction[];
}

const ConsoleContext = createContext<ConsoleState | null>(null);

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Client-side workspace state. Every mutation is local until the console is wired to the API. */
export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [dialog, openDialog] = useState<ConsoleDialog>(null);
  const [env, setEnv] = useState<Environment>("live");
  const [balance, setBalance] = useState(workspacePreview.balance);
  const [autoReload, setAutoReload] = useState<AutoReload>(workspacePreview.autoReload);
  const [sampleMode, setSampleMode] = useState(true);
  const [keys, setKeys] = useState<ApiKey[]>(workspacePreview.keys);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(workspacePreview.paymentMethods);
  const [transactions, setTransactions] = useState<Transaction[]>(workspacePreview.transactions);

  const addFunds = useCallback((amount: number, bonus = 0) => {
    setBalance((b) => +(b + amount + bonus).toFixed(2));
    setTransactions((t) => [
      { id: `txn_${randomToken(10)}`, label: "Credit top-up", amount, bonus, date: dateFmt.format(new Date()) },
      ...t,
    ]);
  }, []);

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

  const addPaymentMethod = useCallback(
    (method: Omit<PaymentMethod, "id">) => setPaymentMethods((m) => [...m, { ...method, id: randomToken(8) }]),
    [],
  );

  const value = useMemo<ConsoleState>(
    () => ({
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
      addPaymentMethod,
      transactions,
    }),
    [dialog, env, balance, addFunds, autoReload, sampleMode, keys, createKey, revokeKey, paymentMethods, addPaymentMethod, transactions],
  );

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useConsole() {
  const ctx = useContext(ConsoleContext);
  if (!ctx) throw new Error("useConsole must be used inside <ConsoleProvider>");
  return ctx;
}
