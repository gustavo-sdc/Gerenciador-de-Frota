import { createContext } from "react";

export interface TenantAccess {
  tenant_id: string;
  role: "admin" | "gestor" | "motorista";
  status: "active" | "blocked" | "cancelled";
  access_until: string | null;
  block_reason: "nonpayment" | "administrative" | "security" | null;
}

export interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: string | null;
  tenantId: string | null;
  role: TenantAccess["role"] | null;
  accessStatus: TenantAccess["status"] | null;
  accessUntil: string | null;
  blockReason: TenantAccess["block_reason"];
  accessError: string | null;
  refreshAccess: () => Promise<TenantAccess | null>;
  callSignOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  userId: null,
  tenantId: null,
  role: null,
  accessStatus: null,
  accessUntil: null,
  blockReason: null,
  accessError: null,
  refreshAccess: async () => null,
  callSignOut: async () => {},
});
