import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("APP_ORIGINS") ?? Deno.env.get("APP_ORIGIN") ?? "")
  .split(",").map((item) => item.trim()).filter(Boolean);
const productionOrigins = new Set(["https://garagem-frota.netlify.app"]);
const localOrigins = new Set(["http://localhost", "https://localhost", "capacitor://localhost"]);

function corsHeaders(origin: string | null) {
  const local = Boolean(origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin));
  const allowed = !origin || local || productionOrigins.has(origin) || localOrigins.has(origin) || allowedOrigins.includes(origin);
  return {
    ...(origin && allowed ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  const cors = corsHeaders(origin);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });

  if (origin && !cors["Access-Control-Allow-Origin"]) return json({ error: "Origem não permitida." }, 403);
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!url || !anonKey || !serviceKey) return json({ error: "Configuração indisponível." }, 500);
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Entre na sua conta para continuar." }, 401);

  let confirmation = "";
  try {
    const body = await request.json();
    confirmation = typeof body?.confirmation === "string" ? body.confirmation : "";
  } catch {
    return json({ error: "Solicitação inválida." }, 400);
  }
  if (confirmation !== "EXCLUIR") return json({ error: "Digite EXCLUIR para confirmar." }, 400);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Sessão inválida. Entre novamente." }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("tenant_id,role").eq("id", user.id).maybeSingle();
  if (profileError) return json({ error: "Não foi possível validar a conta." }, 500);

  const { data: ownedTenant, error: tenantError } = await admin.from("tenants")
    .select("id").eq("user_id", user.id).maybeSingle();
  if (tenantError) return json({ error: "Não foi possível validar a empresa." }, 500);

  if (ownedTenant) {
    const { error } = await admin.rpc("delete_tenant_account_data", {
      p_tenant_id: ownedTenant.id,
      p_owner_user_id: user.id,
    });
    if (error) return json({ error: "Não foi possível excluir os dados da empresa. Tente novamente ou contate o suporte." }, 500);
  } else if (profile) {
    const { error } = await admin.from("profiles").delete().eq("id", user.id).eq("tenant_id", profile.tenant_id);
    if (error) return json({ error: "Não foi possível remover o vínculo da conta." }, 500);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return json({ error: "Os dados foram removidos, mas não foi possível finalizar a exclusão da conta. Contate o suporte." }, 500);
  return json({ success: true });
});
