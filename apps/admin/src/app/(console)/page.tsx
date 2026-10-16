import type { Metadata } from "next";
import { Suspense } from "react";
import { OverviewView } from "@/features/overview/overview-view";

export const metadata: Metadata = { title: "Overview" };

export default function Page() {
  return (
    <Suspense>
      <OverviewView />
    </Suspense>
  );
}
