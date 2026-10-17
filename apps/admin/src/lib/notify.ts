import { toast } from "sonner";
import { ApiError, errorMessage } from "@modelvend/admin-api/client";

/** Shows a failed request as a toast. A 401 is skipped: the browser is already on its way to sign in. */
export function toastError(error: unknown, title?: string) {
  if (error instanceof ApiError && error.status === 401) return;
  const message = errorMessage(error);
  if (title) toast.error(title, { description: message });
  else toast.error(message);
}
