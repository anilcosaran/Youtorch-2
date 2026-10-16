import { site } from "@/config/site";
import type { ApiKey, AutoReload, PaymentMethod, TopUpPreset, Transaction } from "@/types/workspace";

/** Sample workspace so the console previews with data until it is wired to the API. */
export const workspacePreview: {
  balance: number;
  autoReload: AutoReload;
  keys: ApiKey[];
  paymentMethods: PaymentMethod[];
  transactions: Transaction[];
} = {
  balance: 248.6,
  autoReload: { enabled: true, threshold: 25, amount: 100 },
  keys: [
    {
      id: "k1prod",
      name: "Production",
      prefix: `${site.keyPrefix}_live_7Hq2…x9Fa`,
      env: "live",
      created: "Aug 21, 2026",
      lastUsed: "2 minutes ago",
    },
    {
      id: "k2stag",
      name: "Staging",
      prefix: `${site.keyPrefix}_test_Pm4k…2LcQ`,
      env: "test",
      created: "Sep 3, 2026",
      lastUsed: "Yesterday",
    },
  ],
  paymentMethods: [{ id: "pm4242", brand: "Visa", last4: "4242", expiry: "08/29" }],
  transactions: [
    { id: "txn_oct01", label: "Credit top-up", amount: 200, bonus: 20, date: "Oct 1, 2026" },
    { id: "txn_sep14", label: "Auto reload", amount: 100, bonus: 0, date: "Sep 14, 2026" },
    { id: "txn_aug21", label: "Credit top-up", amount: 50, bonus: 0, date: "Aug 21, 2026" },
  ],
};

export const topUpPresets: TopUpPreset[] = [
  { amount: 10, bonus: 0 },
  { amount: 50, bonus: 0 },
  { amount: 200, bonus: 0.1 },
  { amount: 1000, bonus: 0.2 },
];

export function bonusFor(amount: number) {
  return [...topUpPresets].reverse().find((p) => amount >= p.amount)?.bonus ?? 0;
}
