import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/layout/logo";
import { LoginForm } from "@/features/auth/login-form";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Sign in" };

// `?next=/models` returns there after signing in.
async function Form({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { next } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : undefined} />;
}

export default function Page({ searchParams }: PageProps<"/login">) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-sidebar p-4">
      <div className="mb-6 flex items-center gap-2.5">
        <Logo className="size-8" />
        <span className="text-lg font-semibold tracking-tight">{BRAND.name}</span>
      </div>
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-xs">
        <Suspense>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
