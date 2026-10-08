import { ChevronsUpDown } from "lucide-react";
import { site } from "@/config/site";

export function UserAvatar() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-iris-400 to-ember-500 text-[12px] font-semibold text-[#fff]">
      {site.user.firstName.charAt(0)}
    </span>
  );
}

export function UserRow() {
  return (
    <button className="flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left transition hover:bg-white/[0.04]">
      <UserAvatar />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] leading-tight font-medium">{site.user.fullName}</span>
        <span className="block truncate text-[12px] text-subtle">{site.user.email}</span>
      </span>
      <ChevronsUpDown className="size-3.5 text-subtle" />
    </button>
  );
}
