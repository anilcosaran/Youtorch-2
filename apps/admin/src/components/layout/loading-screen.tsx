import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";

/** Shown when the session can't be loaded, with a way to try again. */
export function LoadFailedScreen({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo className="size-10" />
      <div>
        <p className="text-sm font-medium">Couldn&apos;t load the console</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" onClick={onRetry} disabled={retrying}>
        {retrying && <LoaderCircle className="animate-spin" />}
        Try again
      </Button>
    </div>
  );
}
