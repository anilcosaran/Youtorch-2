import { ConsoleShell } from "@/components/layout/console-shell";

export default function ConsoleLayout({ children }: LayoutProps<"/">) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
