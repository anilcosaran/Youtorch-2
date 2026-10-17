"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@modelvend/admin-api/auth";
import { errorMessage, isUnauthorized } from "@modelvend/admin-api/client";
import { Field, FormError } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { keys } from "@/lib/query-keys";

/** Only same-site paths are followed after signing in. */
function safeNext(next: string | undefined): string {
  // Browsers read "/\host" and "/<tab>/host" like "//host", so backslashes and
  // control characters are refused anywhere.
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next))
    return "/";
  if (next.startsWith("/login")) return "/";
  return next;
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const operator = await login({ email: email.trim(), password });
      queryClient.setQueryData(keys.me, operator);
      router.replace(safeNext(next));
    } catch (err) {
      setError(
        isUnauthorized(err) ? "That email and password don't match." : errorMessage(err),
      );
      setPassword("");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="mb-1">
        <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">For Modelvend operators.</p>
      </div>
      <FormError message={error} />
      <Field id="email" label="Email">
        <Input
          id="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field id="password" label="Password">
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy && <LoaderCircle className="animate-spin" />}
        Sign in
      </Button>
    </form>
  );
}
