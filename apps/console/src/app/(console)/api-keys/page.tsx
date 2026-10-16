import { Suspense } from "react";
import type { Metadata } from "next";
import { ApiKeysView } from "@/features/api-keys/components/api-keys-view";

export const metadata: Metadata = { title: "API keys" };

export default function ApiKeysPage() {
  return (
    <Suspense>
      <ApiKeysView />
    </Suspense>
  );
}
