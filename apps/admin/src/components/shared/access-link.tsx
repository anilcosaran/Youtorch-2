"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import type { Permission } from "@/lib/api/auth";
import { useSession } from "@/lib/session";

/**
 * A link to a page that needs a permission. Operators without it see the
 * text alone, so nothing leads them to a page they can't open.
 */
export function AccessLink({
  permission,
  plainClassName,
  ...props
}: ComponentProps<typeof Link> & {
  permission: Permission;
  /** Classes for the text shown in place of the link. */
  plainClassName?: string;
}) {
  const { allows } = useSession();
  if (!allows(permission)) return <span className={plainClassName}>{props.children}</span>;
  return <Link {...props} />;
}
