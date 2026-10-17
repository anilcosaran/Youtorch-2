"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { LoadFailedScreen } from "@/components/layout/loading-screen";
import { getMe, logout, type Operator, type Permission } from "./api/auth";
import { errorMessage, isUnauthorized } from "./api/client";
import { keys } from "./api/keys";
import { toastError } from "./notify";
import { can, permissionsFor, type Permissions } from "./permissions";

interface Session {
  /** Null until the signed-in operator has loaded. */
  operator: Operator | null;
  /** Everything is off until the operator has loaded, so no control flashes in and out. */
  can: Permissions;
  /** Whether the operator holds a permission; false until they have loaded. */
  allows: (permission: Permission) => boolean;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

/**
 * Loads the signed-in operator while the screens load their own data, so the
 * console renders at once. A missing session sends the browser to /login and
 * back afterwards (see `lib/api/client.ts`).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: keys.me, queryFn: getMe, staleTime: 5 * 60_000 });

  const signOut = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      // Unless the session is already gone, it is still valid: say so instead of pretending.
      if (!isUnauthorized(error)) {
        toastError(error, "Couldn't sign out");
        return;
      }
    }
    queryClient.clear();
    // A full load, so nothing from the ended session stays in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }, [queryClient]);

  const operator = me.data ?? null;
  const value = useMemo(
    (): Session => ({
      operator,
      can: permissionsFor(operator),
      allows: (permission) => can(operator, permission),
      signOut,
    }),
    [operator, signOut],
  );

  // A 401 is already on its way to /login.
  if (!operator && me.error && !isUnauthorized(me.error) && !me.isFetching) {
    return <LoadFailedScreen message={errorMessage(me.error)} onRetry={() => void me.refetch()} />;
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside SessionProvider");
  return session;
}

/** What the signed-in operator may see and change; nothing until the operator has loaded. */
export const usePermissions = () => useSession().can;
