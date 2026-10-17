import { keys } from "@/lib/query-keys";
import type { QueryClient } from "@tanstack/react-query";
import type { Customer } from "@modelvend/admin-api/customers";

/**
 * After a change to a customer: the detail shows the server's answer at once,
 * and the lists, search results and audit log load again.
 */
export function storeCustomer(queryClient: QueryClient, customer: Customer) {
  queryClient.setQueryData(keys.customer(customer.id), customer);
  void queryClient.invalidateQueries({
    queryKey: keys.customers,
    predicate: (query) => query.queryKey[1] !== "detail",
  });
  void queryClient.invalidateQueries({ queryKey: keys.audit });
}
