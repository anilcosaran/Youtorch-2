import type { Metadata } from "next";
import { UsageView } from "@/features/usage/components/usage-view";

export const metadata: Metadata = { title: "Usage & logs" };

export default function UsagePage() {
  return <UsageView />;
}
