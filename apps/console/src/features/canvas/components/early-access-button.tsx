import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/** There is no early-access list to join yet, so the button says so instead of pretending to sign people up. */
export function EarlyAccessButton() {
  return (
    <Button variant="outline" disabled>
      <Sparkles /> Early access opens soon
    </Button>
  );
}
