"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { StatusScreen } from "@/components/feedback/status-screen";
import { Button, buttonClass } from "@/components/ui/button";

export default function ConsoleError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // Hook an error reporter (Sentry, Datadog, ...) in here.
    console.error(error);
  }, [error]);

  return (
    <StatusScreen
      code={error.digest ? `Error · ${error.digest}` : "Error"}
      title="Something went wrong"
      description="This part of the console failed to load. Your balance and keys are safe. Try again, or come back in a moment."
      actions={
        <>
          <Button variant="primary" onClick={() => retry()}>
            <RotateCcw /> Try again
          </Button>
          <Link href="/" className={buttonClass({ variant: "outline" })}>
            Dashboard
          </Link>
        </>
      }
    />
  );
}
