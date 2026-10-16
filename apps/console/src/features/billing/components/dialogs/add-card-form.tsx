"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useConsole } from "@/providers/console-provider";
import { cardBrand, cardDigits, formatCardNumber, formatCvc, formatExpiry, isCardComplete } from "../../lib/card";

export function AddCardForm({ onDone }: { onDone: () => void }) {
  const { addPaymentMethod } = useConsole();
  const toast = useToast();
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const digits = cardDigits(number);
  const brand = cardBrand(digits);

  const save = () => {
    addPaymentMethod({ brand, last4: digits.slice(-4), expiry });
    toast(`${brand} •••• ${digits.slice(-4)} saved`);
    onDone();
  };

  return (
    <div className="space-y-3">
      <Field label="Card number">
        <Input
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="4242 4242 4242 4242"
          className="font-mono tabular"
          value={number}
          onChange={(e) => setNumber(formatCardNumber(e.target.value))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Expiry">
          <Input
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/YY"
            className="font-mono tabular"
            value={expiry}
            onChange={(e) => setExpiry(formatExpiry(e.target.value))}
          />
        </Field>
        <Field label="CVC">
          <Input
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="123"
            className="font-mono tabular"
            value={cvc}
            onChange={(e) => setCvc(formatCvc(e.target.value))}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!isCardComplete(digits, expiry, cvc)} onClick={save}>
          Save card
        </Button>
      </div>
    </div>
  );
}
