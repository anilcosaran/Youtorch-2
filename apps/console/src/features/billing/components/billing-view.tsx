"use client";

import { Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { downloadCsv } from "@/lib/csv";
import { monthlyBudget, monthToDate, totalSpend } from "@/mocks/usage";
import { useConsole } from "@/providers/console-provider";
import { BalanceCard } from "./balance-card";
import { BillingHistory } from "./billing-history";
import { BonusLadder } from "./bonus-ladder";
import { PaymentMethods } from "./payment-methods";
import { SpendOverview } from "./spend-overview";

export function BillingView() {
  const { openDialog, sampleMode, transactions } = useConsole();
  const { month, days } = monthToDate();
  const spentThisMonth = sampleMode ? days.reduce((s, d) => s + totalSpend(d), 0) : 0;

  // Exactly the rows of the billing history below.
  const exportCsv = () =>
    downloadCsv(
      "billing-history.csv",
      ["id", "date", "description", "amount_usd", "bonus_usd"],
      transactions.map((t) => [t.id, t.date, t.label, t.amount.toFixed(2), t.bonus.toFixed(2)]),
    );

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Billing"
        description="Prepaid credits, invoices and spending controls for your workspace."
        actions={
          <>
            <Button variant="outline" disabled={!transactions.length} onClick={exportCsv}>
              <Download /> Export CSV
            </Button>
            <Button variant="primary" onClick={() => openDialog("add-funds")}>
              <Plus /> Add credits
            </Button>
          </>
        }
      />

      <div className="grid gap-3 lg:grid-cols-12">
        <BalanceCard month={month} monthToDate={spentThisMonth} budget={monthlyBudget} />
        <BonusLadder />
      </div>

      <SpendOverview />

      <section className="mt-10 grid gap-8 lg:grid-cols-2">
        <PaymentMethods />
        <BillingHistory />
      </section>
    </>
  );
}
