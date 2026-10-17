"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function EarlyAccessButton() {
  const toast = useToast();
  const [joined, setJoined] = useState(false);

  return (
    <Button
      variant={joined ? "outline" : "primary"}
      disabled={joined}
      onClick={() => {
        setJoined(true);
        toast("You're on the Canvas early-access list");
      }}
    >
      {joined ? <Check /> : <Sparkles />} {joined ? "On the list" : "Request early access"}
    </Button>
  );
}
