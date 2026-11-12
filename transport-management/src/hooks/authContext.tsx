import React, { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { AuthContext, type TenantAccess } from "./authContextValue";
import supabase from "../supabase/supabase";

interface AuthContextProviderProps {
  children?: React.ReactNode;
}

export function AuthContextProvider({ children }: AuthContextProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [access, setAccess] = useState<TenantAccess | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const requestId = useRef(0);

  const fetchAccess = useCallback(async (currentRequest: number) => {
    try {
      const { data, error } = await supabase.rpc("get_my_access").maybeSingle();
      if (requestId.current !== currentRequest) return null;
      if (error) throw error;

      const nextAccess = data as TenantAccess | null;
      setAccess(nextAccess);
      setAccessError(null);
      return nextAccess;
    } catch {
      if (requestId.current === currentRequest) {
        setAccess(null);
        setAccessError("Não foi possível confirmar o acesso da empresa. Tente novamente.");
      }
      throw new Error("Não foi possível confirmar o acesso da empresa.");
    } finally {
      if (requestId.current === currentRequest) setIsLoading(false);
    }
  }, []);

  const refreshAccess = useCallback(() => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setAccessError(null);
    return fetchAccess(currentRequest);
  }, [fetchAccess]);

  useEffect(() => {
    let disposed = false;
    let removeAppListener: (() => void) | null = null;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentRequest = ++requestId.current;
      const user = session?.user;
      setUserId(user?.id ?? null);
      setIsAuthenticated(Boolean(user));
      setAccess(null);
      setAccessError(null);

      if (!user) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      // Supabase recommends doing Auth-dependent requests after the auth callback returns.
      window.setTimeout(() => { void fetchAccess(currentRequest).catch(() => {}); }, 0);
    });

    if (Capacitor.isNativePlatform()) {
      supabase.auth.startAutoRefresh();
      void App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) {
          supabase.auth.startAutoRefresh();
          void supabase.auth.getSession();
        } else {
          supabase.auth.stopAutoRefresh();
        }
      }).then((listener) => {
        if (disposed) void listener.remove();
        else removeAppListener = () => { void listener.remove(); };
      });
    }

    return () => {
      disposed = true;
      requestId.current += 1;
      subscription.unsubscribe();
      removeAppListener?.();
      if (Capacitor.isNativePlatform()) supabase.auth.stopAutoRefresh();
    };
  }, [fetchAccess]);

  const callSignOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new Error("Não foi possível sair. Tente novamente.");
  }, []);

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      isLoading,
      userId,
      tenantId: access?.tenant_id ?? null,
      role: access?.role ?? null,
      accessStatus: access?.status ?? null,
      accessUntil: access?.access_until ?? null,
      blockReason: access?.block_reason ?? null,
      accessError,
      refreshAccess,
      callSignOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
