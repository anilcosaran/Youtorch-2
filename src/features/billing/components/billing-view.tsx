"use client";

import { Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { monthlyBudget, totalSpend, usageSeries } from "@/mocks/usage";
import { useConsole } from "@/providers/console-provider";
import { BalanceCard } from "./balance-card";
import { BillingHistory } from "./billing-history";
import { BonusLadder } from "./bonus-ladder";
import { PaymentMethods } from "./payment-methods";
import { SpendOverview } from "./spend-overview";

export function BillingView() {
  const { openDialog, sampleMode, transactions } = useConsole();
  const monthToDate = sampleMode ? usageSeries.slice(-7).reduce((s, d) => s + totalSpend(d), 0) : 0;

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Billing"
        description="Prepaid credits, invoices and spending controls for your workspace."
        actions={
          <>
            <Button variant="outline" disabled={!transactions.length}>
              <Download /> Export CSV
            </Button>
            <Button variant="primary" onClick={() => openDialog("add-funds")}>
              <Plus /> Add credits
            </Button>
          </>
        }
      />

      <div className="grid gap-3 lg:grid-cols-12">
        <BalanceCard monthToDate={monthToDate} budget={monthlyBudget} />
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
