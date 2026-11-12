import { createClient } from "npm:@supabase/supabase-js@2";

const configuredOrigins = (Deno.env.get("APP_ORIGINS") ?? Deno.env.get("APP_ORIGIN") ?? "")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
const productionOrigins = new Set(["https://garagem-frota.netlify.app"]);
const localOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost", "https://localhost", "capacitor://localhost"]);
const isLocalhostOrigin = (origin: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin);
function corsFor(origin: string | null) {
  const allowed = !origin || productionOrigins.has(origin) || configuredOrigins.includes(origin) || localOrigins.has(origin) || isLocalhostOrigin(origin);
  return {
    ...(origin && allowed ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function normalizeCnpj(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isValidCnpj(value: string) {
  const cnpj = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^([A-Z0-9])\1{13}$/.test(cnpj)) return false;
  const digit = (base: string, weights: number[]) => {
    const sum = [...base].reduce((total, char, index) => total + (char.charCodeAt(0) - 48) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = digit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = digit(`${cnpj.slice(0, 12)}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${first}${second}`);
}

function normalizeCpf(value: string) {
  return value.replace(/\D/g, "");
}

function isValidCpf(value: string) {
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (base: string, firstWeight: number) => {
    const sum = [...base].reduce((total, char, index) => total + Number(char) * (firstWeight - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  const first = digit(cpf.slice(0, 9), 10);
  const second = digit(cpf.slice(0, 9) + first, 11);
  return cpf.endsWith(`${first}${second}`);
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  const cors = corsFor(origin);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
  if (origin && !cors["Access-Control-Allow-Origin"]) return json({ error: "Origem não permitida" }, 403);
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!url || !anonKey || !serviceKey) return json({ error: "Configuração indisponível" }, 500);
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: "Sessão inválida" }, 401);

  let input: { document_type?: unknown; document_number?: unknown; nome_empresa?: unknown };
  try { input = await request.json(); } catch { return json({ error: "Dados inválidos" }, 400); }
  const documentType = String(input.document_type ?? "");
  if (typeof input.document_number !== "string" || !["cpf", "cnpj"].includes(documentType)) return json({ error: "Selecione CPF ou CNPJ." }, 400);
  const documentNumber = documentType === "cpf" ? normalizeCpf(input.document_number) : normalizeCnpj(input.document_number);
  if (documentType === "cpf" ? !isValidCpf(documentNumber) : !isValidCnpj(documentNumber)) return json({ error: documentType === "cpf" ? "Informe um CPF válido." : "Informe um CNPJ válido." }, 400);
  if (typeof input.nome_empresa !== "string" || !input.nome_empresa.trim() || input.nome_empresa.trim().length > 160) {
    return json({ error: "Informe um nome de empresa válido." }, 400);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc("create_tenant_for_user", {
    p_user_id: user.id,
    p_document_type: documentType,
    p_document_number: documentNumber,
    p_name: input.nome_empresa.trim(),
  }).maybeSingle();

  if (error || !data) {
    if (error?.code === "23505") {
      const duplicateDocument = String(error.message ?? "").includes("tenants_cpf_unique_idx");
      return json({ error: duplicateDocument ? "Este CPF já está vinculado a uma conta." : "Esta conta já está vinculada a outra empresa." }, 409);
    }
    return json({ error: "Não foi possível vincular a empresa à conta." }, 500);
  }
  return json({ tenant_id: data.tenant_id, role: data.role }, 200);
});
