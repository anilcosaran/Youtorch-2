import { request, type PageParams } from "./client";
import type { S } from "./schema";

/*
 * Every model call and app run is a task. A task makes one or more attempts:
 * the router tries routes in order and falls back when one fails before
 * producing output. `amountMicros` is what the customer paid, and only a
 * success costs them anything; `costMicros` is what the provider charged us,
 * which a failure can still have.
 */

export type TaskStatus = S["TaskStatus"];
export const TASK_STATUSES = ["queued", "running", "succeeded", "failed", "canceled"] as const satisfies readonly TaskStatus[];

export type AttemptStatus = S["AttemptStatus"];
export type TaskRow = S["TaskRow"];
export type Attempt = S["Attempt"];
export type TaskEvent = S["TaskEvent"];
export type TaskDetail = S["TaskDetail"];

export interface TaskFilters {
  query?: string;
  status?: TaskStatus;
  model?: string;
  provider?: string;
  customerId?: string;
}

export const listTasks = (params: TaskFilters & PageParams) => request<S["TaskPage"]>("/tasks", { query: { ...params } });

export const getTask = (id: string) => request<TaskDetail>(`/tasks/${encodeURIComponent(id)}`);

export const refundTask = (id: string, reason: string) => request<TaskDetail>(`/tasks/${encodeURIComponent(id)}/refund`, { method: "POST", body: { reason } });
