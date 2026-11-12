import supabase from "../supabase/supabase";

export interface SupportMessage { id: string; ticket_id: string; author_type: "user" | "developer"; body: string; created_at: string }
export interface SupportTicket {
  id: string; tenant_id: string; tenant_name?: string; user_id?: string; subject: string; description: string;
  category: string; status: string; priority: string; created_at: string; updated_at: string; messages: SupportMessage[];
}
export interface AppErrorEvent {
  id: string; tenant_id: string | null; user_id: string | null; fingerprint: string; title: string; stack: string | null;
  route: string | null; app_version: string | null; platform: string; status: string; occurrences: number;
  first_seen_at: string; last_seen_at: string;
}
export interface AdminBrand { id: string; name: string; is_active: boolean }
export interface AdminModel {
  id: string; brand_id: string; name: string; vehicle_category: string; year_start: number; year_end: number;
  fuel_type: string | null; engine_version: string | null; source_note: string | null; source_url: string | null; is_active: boolean;
}
export interface CatalogCpk {
  id: string; model_id: string; system_code: string; component_name: string; component_reference: string | null;
  base_life_km: number | null; replacement_cost: number | null; source_note: string | null; source_url: string | null; is_active: boolean;
}
export interface AdminSystem { system_code: string; name: string }
export interface ManagedTenant {
  id: string; name: string | null; cnpj: string | null; document_type: "cpf" | "cnpj"; document_number: string; user_id: string; email: string; created_at: string;
  access: { status: string; access_type: string; access_until: string | null; block_reason: string | null; admin_note: string | null } | null;
}

async function invoke<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-support", { body });
  if (error) {
    let message = error.message;
    const context = (error as Error & { context?: Response }).context;
    if (context) {
      try { const body = await context.clone().json(); if (typeof body?.error === "string") message = body.error; } catch { /* Usa a mensagem do cliente. */ }
    }
    return { data: undefined as T | undefined, error: new Error(message) };
  }
  if (data?.error) return { data: undefined as T | undefined, error: new Error(String(data.error)) };
  return { data: data?.data as T, error: undefined };
}

export const callAdminSupport = <T = unknown>(body: Record<string, unknown>) => invoke<T>(body);

function redactDiagnostics(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[-.\s]?\d{2}\b/g, "[documento]")
    .replace(/\b\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[/.\s-]?\d{4}[-.\s]?\d{2}\b/g, "[documento]")
    .replace(/\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}\b/g, "[telefone]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+\b/g, "[token]")
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s)]+/gi, "$1[parâmetros removidos]");
}

export async function captureAppError(error: unknown, platform: string) {
  const source = error instanceof Error ? error : new Error(String(error));
  const title = redactDiagnostics(source.message || "Erro inesperado do aplicativo").slice(0, 300);
  const stack = redactDiagnostics(source.stack ?? "").slice(0, 6000);
  const fingerprint = await fingerprintFor(`${source.name}:${title}:${stack.split("\n").slice(0, 3).join("\n")}`);
  await invoke({ action: "report_error", title, fingerprint, stack, route: window.location.pathname, app_version: "1.2.0", platform });
}

async function fingerprintFor(value: string) {
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    return `fnv_${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }
}
