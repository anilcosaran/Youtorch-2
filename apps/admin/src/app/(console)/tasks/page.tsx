import type { Metadata } from "next";
import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/require-access";
import { TasksView } from "@/features/tasks/tasks-view";

export const metadata: Metadata = { title: "Tasks" };

export default function Page() {
  return (
    <RequireAccess page="/tasks">
      <Suspense>
        <TasksView />
      </Suspense>
    </RequireAccess>
  );
}
