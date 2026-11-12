import { createClient } from "npm:@supabase/supabase-js@2";

const configuredOrigins = (Deno.env.get("APP_ORIGINS") ?? Deno.env.get("APP_ORIGIN") ?? "")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
const productionOrigins = new Set(["https://garagem-frota.netlify.app"]);
const localOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8000", "http://127.0.0.1:8000", "http://localhost", "https://localhost", "capacitor://localhost"]);
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
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!url || !anon || !serviceKey) return json({ error: "Configuração ausente" }, 500);
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

  const auth = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user) return json({ error: "Sessão inválida" }, 401);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const action = String(input.action ?? "");
  const { data: developer, error: developerError } = await db.from("platform_developers")
    .select("user_id").eq("user_id", user.id).maybeSingle();
  if (developerError) return json({ error: "Falha ao validar permissão" }, 500);
  const isDeveloper = Boolean(developer);

  if (action === "status") return json({ data: { isDeveloper } });

  const { data: profile } = await db.from("profiles").select("tenant_id").eq("id", user.id).maybeSingle();
  const tenantId = profile?.tenant_id as string | undefined;

  if (action === "create_ticket") {
    if (!tenantId) return json({ error: "Não encontramos a empresa vinculada à sua conta." }, 403);
    const subject = String(input.subject ?? "").trim();
    const description = String(input.description ?? "").trim();
    const category = String(input.category ?? "other");
    if (subject.length < 4 || subject.length > 160 || description.length < 10 || description.length > 5000 || !["bug", "question", "access", "billing", "other"].includes(category)) return json({ error: "Revise o assunto, a descrição e o tipo do chamado." }, 400);
    const { data, error } = await db.from("support_tickets").insert({ tenant_id: tenantId, user_id: user.id, subject, description, category }).select("id,subject,category,status,priority,created_at,updated_at").single();
    if (error) return json({ error: "Não foi possível abrir o chamado." }, 400);
    return json({ data });
  }

  if (action === "my_tickets") {
    const { data, error } = await db.from("support_tickets").select("id,subject,description,category,status,priority,created_at,updated_at,closed_at")
      .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(100);
    if (error) return json({ error: "Não foi possível carregar seus chamados." }, 500);
    const ids = (data ?? []).map((ticket) => ticket.id);
    const { data: messages, error: messageError } = ids.length
      ? await db.from("support_ticket_messages").select("id,ticket_id,author_type,body,created_at").in("ticket_id", ids).order("created_at")
      : { data: [], error: null };
    if (messageError) return json({ error: "Não foi possível carregar as respostas." }, 500);
    return json({ data: (data ?? []).map((ticket) => ({ ...ticket, messages: (messages ?? []).filter((message) => message.ticket_id === ticket.id) })) });
  }

  if (action === "reply_ticket") {
    const ticketId = String(input.ticket_id ?? "");
    const body = String(input.body ?? "").trim();
    if (body.length < 1 || body.length > 5000) return json({ error: "A mensagem deve ter até 5.000 caracteres." }, 400);
    const ticketQuery = db.from("support_tickets").select("id,status,user_id").eq("id", ticketId);
    if (!isDeveloper) ticketQuery.eq("user_id", user.id);
    const { data: ticket, error: ticketError } = await ticketQuery.maybeSingle();
    if (ticketError || !ticket) return json({ error: "Chamado não encontrado." }, 404);
    if (ticket.status === "closed") return json({ error: "Este chamado está encerrado." }, 409);
    const { data, error } = await db.from("support_ticket_messages").insert({ ticket_id: ticketId, author_user_id: user.id, author_type: isDeveloper ? "developer" : "user", body }).select("id,ticket_id,author_type,body,created_at").single();
    if (error) return json({ error: "Não foi possível enviar a mensagem." }, 400);
    const nextStatus = isDeveloper ? "waiting_user" : "open";
    await db.from("support_tickets").update({ status: nextStatus, updated_at: new Date().toISOString() }).eq("id", ticketId);
    return json({ data });
  }

  if (action === "report_error") {
    const title = String(input.title ?? "Erro do aplicativo").replace(/[\r\n\t]+/g, " ").trim().slice(0, 300);
    const fingerprint = String(input.fingerprint ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
    const route = String(input.route ?? "").split(/[?#]/)[0].slice(0, 240) || null;
    const stack = String(input.stack ?? "").slice(0, 6000) || null;
    const platform = ["web", "android", "ios"].includes(String(input.platform)) ? String(input.platform) : "unknown";
    const appVersion = String(input.app_version ?? "").slice(0, 40) || null;
    if (title.length < 1 || fingerprint.length < 8) return json({ error: "Relato inválido." }, 400);
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recent } = await db.from("app_error_events").select("id,occurrences")
      .eq("user_id", user.id).eq("fingerprint", fingerprint).gte("last_seen_at", cutoff).order("last_seen_at", { ascending: false }).limit(1).maybeSingle();
    if (recent) {
      await db.from("app_error_events").update({ occurrences: Number(recent.occurrences) + 1, last_seen_at: new Date().toISOString() }).eq("id", recent.id);
      return json({ data: { recorded: true, duplicate: true } });
    }
    const { error } = await db.from("app_error_events").insert({ tenant_id: tenantId ?? null, user_id: user.id, fingerprint, title, stack, route, platform, app_version: appVersion });
    if (error) return json({ error: "Não foi possível registrar o erro." }, 400);
    return json({ data: { recorded: true } });
  }

  if (!isDeveloper) return json({ error: "Acesso exclusivo ao administrador da plataforma." }, 403);

  if (action === "overview") {
    const [ticketsOpen, errorsOpen, tenantsTotal, tenantsBlocked, tenantsTest] = await Promise.all([
      db.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress", "waiting_user"]),
      db.from("app_error_events").select("id", { count: "exact", head: true }).in("status", ["open", "investigating"]),
      db.from("tenants").select("id", { count: "exact", head: true }),
      db.from("tenant_access").select("tenant_id", { count: "exact", head: true }).eq("status", "blocked"),
      db.from("tenant_access").select("tenant_id", { count: "exact", head: true }).eq("access_type", "test").eq("status", "active"),
    ]);
    return json({ data: { open_tickets: ticketsOpen.count ?? 0, open_errors: errorsOpen.count ?? 0, tenants: tenantsTotal.count ?? 0, blocked: tenantsBlocked.count ?? 0, active_tests: tenantsTest.count ?? 0 } });
  }

  if (action === "list_tickets") {
    const { data, error } = await db.from("support_tickets").select("id,tenant_id,user_id,subject,description,category,status,priority,created_at,updated_at")
      .order("updated_at", { ascending: false }).limit(150);
    if (error) return json({ error: "Não foi possível carregar os chamados." }, 500);
    const ids = (data ?? []).map((ticket) => ticket.id);
    const tenantIds = [...new Set((data ?? []).map((ticket) => ticket.tenant_id))];
    const [{ data: messages }, { data: tenants }] = await Promise.all([
      ids.length ? db.from("support_ticket_messages").select("id,ticket_id,author_type,body,created_at").in("ticket_id", ids).order("created_at") : Promise.resolve({ data: [] }),
      tenantIds.length ? db.from("tenants").select("id,name").in("id", tenantIds) : Promise.resolve({ data: [] }),
    ]);
    return json({ data: (data ?? []).map((ticket) => ({ ...ticket, tenant_name: tenants?.find((tenant) => tenant.id === ticket.tenant_id)?.name ?? "Empresa", messages: messages?.filter((message) => message.ticket_id === ticket.id) ?? [] })) });
  }

  if (action === "update_ticket") {
    const id = String(input.id ?? "");
    const status = String(input.status ?? "");
    const priority = String(input.priority ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id) || !["open", "in_progress", "waiting_user", "resolved", "closed"].includes(status) || !["low", "normal", "high", "urgent"].includes(priority)) return json({ error: "Status ou prioridade inválidos." }, 400);
    const { error } = await db.from("support_tickets").update({ status, priority, updated_at: new Date().toISOString(), closed_at: ["resolved", "closed"].includes(status) ? new Date().toISOString() : null }).eq("id", id);
    if (error) return json({ error: "Não foi possível atualizar o chamado." }, 400);
    return json({ data: { saved: true } });
  }

  if (action === "list_errors") {
    const { data, error } = await db.from("app_error_events").select("id,tenant_id,user_id,fingerprint,title,stack,route,app_version,platform,status,occurrences,first_seen_at,last_seen_at")
      .order("last_seen_at", { ascending: false }).limit(200);
    if (error) return json({ error: "Não foi possível carregar os erros." }, 500);
    return json({ data });
  }

  if (action === "update_error") {
    const id = String(input.id ?? ""); const status = String(input.status ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id) || !["open", "investigating", "resolved", "ignored"].includes(status)) return json({ error: "Status inválido." }, 400);
    const { error } = await db.from("app_error_events").update({ status }).eq("id", id);
    if (error) return json({ error: "Não foi possível atualizar o erro." }, 400);
    return json({ data: { saved: true } });
  }

  if (action === "list_access") {
    const [{ data: tenants, error }, { data: accesses, error: accessError }, { data: userPage }] = await Promise.all([
      db.from("tenants").select("id,name,cnpj,document_type,document_number,user_id,created_at").order("created_at", { ascending: false }).limit(300),
      db.from("tenant_access").select("tenant_id,status,access_until,block_reason,access_type,admin_note,updated_at"),
      db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (error || accessError) return json({ error: "Não foi possível carregar as empresas." }, 500);
    return json({ data: (tenants ?? []).map((tenant) => ({ ...tenant, access: accesses?.find((access) => access.tenant_id === tenant.id) ?? null, email: userPage.users?.find((account) => account.id === tenant.user_id)?.email ?? "" })) });
  }

  if (action === "set_access") {
    const tenantIdValue = String(input.tenant_id ?? "");
    const status = String(input.status ?? "");
    const accessType = String(input.access_type ?? "manual");
    const accessUntil = input.access_until ? String(input.access_until) : null;
    const reason = String(input.block_reason ?? (status === "blocked" ? "administrative" : ""));
    const adminNote = String(input.admin_note ?? "").trim().slice(0, 500);
    if (!/^[0-9a-f-]{36}$/i.test(tenantIdValue) || !["active", "blocked", "cancelled"].includes(status) || !["manual", "paid", "test", "complimentary"].includes(accessType) || (status === "blocked" && !["nonpayment", "administrative", "security"].includes(reason))) return json({ error: "Revise o status e o tipo de acesso." }, 400);
    if (accessUntil && !Number.isFinite(Date.parse(accessUntil))) return json({ error: "Data de validade inválida." }, 400);
    const { data, error } = await db.from("tenant_access").update({ status, access_type: accessType, access_until: accessUntil, blocked_at: status === "blocked" ? new Date().toISOString() : null, block_reason: status === "blocked" ? reason : null, admin_note: adminNote || null, updated_by: user.id, updated_at: new Date().toISOString() }).eq("tenant_id", tenantIdValue).select("tenant_id,status,access_type,access_until,block_reason,admin_note,updated_at").maybeSingle();
    if (error || !data) return json({ error: "Não foi possível atualizar o acesso." }, 400);
    return json({ data });
  }

  if (action === "list_catalog") {
    const [{ data: brands, error: brandError }, { data: models, error: modelError }, { data: profiles, error: profileError }, { data: systems, error: systemError }] = await Promise.all([
      db.from("vehicle_catalog_brands").select("*").order("name"),
      db.from("vehicle_catalog_models").select("*").order("name"),
      db.from("vehicle_catalog_cpk_profiles").select("*").order("system_code").order("component_name"),
      db.from("maintenance_system_rules").select("system_code,name").eq("is_active", true).order("name"),
    ]);
    if (brandError || modelError || profileError || systemError) return json({ error: "Não foi possível carregar o catálogo." }, 500);
    return json({ data: { brands: brands ?? [], models: models ?? [], profiles: profiles ?? [], systems: systems ?? [] } });
  }

  if (action === "save_brand") {
    const id = String(input.id ?? ""); const name = String(input.name ?? "").trim();
    if (name.length < 1 || name.length > 100) return json({ error: "Informe uma marca de até 100 caracteres." }, 400);
    const payload = { ...(id ? { id } : {}), name, is_active: input.is_active !== false, updated_at: new Date().toISOString() };
    const { data, error } = await db.from("vehicle_catalog_brands").upsert(payload).select().single();
    if (error) return json({ error: "Marca duplicada ou inválida." }, 400);
    return json({ data });
  }

  if (action === "save_model") {
    const id = String(input.id ?? ""); const brandId = String(input.brand_id ?? ""); const name = String(input.name ?? "").trim();
    const category = String(input.vehicle_category ?? ""); const yearStart = Number(input.year_start); const yearEnd = Number(input.year_end);
    if (!/^[0-9a-f-]{36}$/i.test(brandId) || name.length < 1 || name.length > 120 || !["moto", "carro_passeio", "utilitario_medio", "utilitario_grande", "caminhao"].includes(category) || !Number.isInteger(yearStart) || !Number.isInteger(yearEnd) || yearStart < 1900 || yearEnd < yearStart || yearEnd > 2200) return json({ error: "Revise marca, modelo, categoria e faixa de anos." }, 400);
    const [{ data: brand }, { data: existingModels, error: modelLookupError }] = await Promise.all([
      db.from("vehicle_catalog_brands").select("id,is_active").eq("id", brandId).maybeSingle(),
      db.from("vehicle_catalog_models").select("id,name,vehicle_category,year_start,year_end,engine_version").eq("brand_id", brandId),
    ]);
    if (!brand?.is_active) return json({ error: "Selecione uma marca ativa." }, 400);
    if (modelLookupError) return json({ error: "Não foi possível validar os modelos existentes." }, 500);
    const normalizedModel = name.trim().toLocaleLowerCase();
    const normalizedEngine = String(input.engine_version ?? "").trim().toLocaleLowerCase();
    const overlap = (existingModels ?? []).some((model) => model.id !== id && model.name.trim().toLocaleLowerCase() === normalizedModel && model.vehicle_category === category && yearStart <= model.year_end && model.year_start <= yearEnd && (!normalizedEngine || !model.engine_version || model.engine_version.trim().toLocaleLowerCase() === normalizedEngine));
    if (overlap) return json({ error: "Esta marca, modelo e categoria já têm uma faixa de anos sobreposta. Ajuste os anos ou a versão do motor." }, 400);
    const payload = { ...(id ? { id } : {}), brand_id: brandId, name, vehicle_category: category, year_start: yearStart, year_end: yearEnd, fuel_type: String(input.fuel_type ?? "").slice(0, 40) || null, engine_version: String(input.engine_version ?? "").slice(0, 100) || null, source_note: String(input.source_note ?? "").slice(0, 500) || null, source_url: String(input.source_url ?? "").slice(0, 1000) || null, is_active: input.is_active !== false, updated_at: new Date().toISOString() };
    const { data, error } = await db.from("vehicle_catalog_models").upsert(payload).select().single();
    if (error) return json({ error: "Não foi possível salvar o modelo. Confira se a marca existe." }, 400);
    return json({ data });
  }

  if (action === "save_catalog_cpk") {
    const id = String(input.id ?? ""); const modelId = String(input.model_id ?? ""); const systemCode = String(input.system_code ?? ""); const componentName = String(input.component_name ?? "").trim();
    const baseLife = input.base_life_km === "" || input.base_life_km == null ? null : Number(input.base_life_km);
    const replacementCost = input.replacement_cost === "" || input.replacement_cost == null ? null : Number(input.replacement_cost);
    if (!/^[0-9a-f-]{36}$/i.test(modelId) || !/^[a-z][a-z0-9_]{1,49}$/.test(systemCode) || componentName.length < 1 || componentName.length > 120 || (baseLife !== null && (!Number.isFinite(baseLife) || baseLife <= 0)) || (replacementCost !== null && (!Number.isFinite(replacementCost) || replacementCost < 0))) return json({ error: "Confira modelo, sistema, item, vida útil e custo." }, 400);
    const { data: model, error: modelError } = await db.from("vehicle_catalog_models").select("vehicle_category").eq("id", modelId).maybeSingle();
    if (modelError || !model) return json({ error: "Selecione um modelo cadastrado." }, 400);
    const { data: activeCategoryRule, error: categoryRuleError } = await db.from("maintenance_category_system_rules").select("system_code").eq("vehicle_category", model.vehicle_category).eq("system_code", systemCode).eq("is_active", true).maybeSingle();
    if (categoryRuleError) return json({ error: "Não foi possível validar o sistema para esta categoria." }, 500);
    if (!activeCategoryRule) return json({ error: "Este sistema ainda não está ativo na categoria. Ative-o nas regras CPK antes de cadastrar o padrão do modelo." }, 400);
    const payload = { ...(id ? { id } : {}), model_id: modelId, system_code: systemCode, component_name: componentName, component_reference: String(input.component_reference ?? "").slice(0, 160) || null, base_life_km: baseLife, replacement_cost: replacementCost, source_note: String(input.source_note ?? "").slice(0, 500) || null, source_url: String(input.source_url ?? "").slice(0, 1000) || null, is_active: input.is_active !== false, updated_at: new Date().toISOString() };
    const { data, error } = await db.from("vehicle_catalog_cpk_profiles").upsert(payload).select().single();
    if (error) return json({ error: "Não foi possível salvar o padrão CPK deste item." }, 400);
    return json({ data });
  }

  if (action === "delete_catalog_cpk") {
    const id = String(input.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Item inválido." }, 400);
    const { error } = await db.from("vehicle_catalog_cpk_profiles").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return json({ error: "Não foi possível desativar este padrão." }, 400);
    return json({ data: { saved: true } });
  }

  return json({ error: "Operação inválida." }, 400);
});
