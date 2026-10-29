"use client";

import { useConsole } from "@/providers/console-provider";

export function UserAvatar() {
  const { user } = useConsole();
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-iris-400 to-ember-500 text-[12px] font-semibold text-[#fff]">
      {user.name.charAt(0)}
    </span>
  );
}

/** Who is signed in. Not a menu yet: there is no account page or sign-out until authentication lands. */
export function UserRow() {
  const { user } = useConsole();
  return (
    <div className="flex w-full items-center gap-2.5 p-1.5">
      <UserAvatar />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] leading-tight font-medium">{user.name}</span>
        <span className="block truncate text-[12px] text-subtle">{user.email}</span>
      </span>
    </div>
  );
}
