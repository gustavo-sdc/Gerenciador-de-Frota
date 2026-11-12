import { createClient } from "npm:@supabase/supabase-js@2";

const configuredOrigins = (Deno.env.get("APP_ORIGINS") ?? Deno.env.get("APP_ORIGIN") ?? "")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
const vehicleCategories = new Set(["moto", "carro_passeio", "utilitario_medio", "utilitario_grande", "caminhao"]);
const productionOrigins = new Set(["https://garagem-frota.netlify.app"]);
const localOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost", "https://localhost", "capacitor://localhost"]);
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

function validateOptions(answerType: string, value: unknown): string | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 50) return "Cadastre de 2 a 50 opções para a pergunta.";
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "Uma das opções é inválida.";
    const option = raw as Record<string, unknown>;
    const label = String(option.label ?? "").trim();
    const multiplier = Number(option.multiplier);
    if (!label || label.length > 120 || !Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 100) return "Revise o rótulo e o multiplicador de cada opção.";
    if (answerType === "number") {
      const min = Number(option.min); const max = Number(option.max);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return "Informe faixas numéricas válidas.";
      const key = `${min}:${max}`;
      if (seen.has(key)) return "Não repita uma faixa de resposta.";
      seen.add(key);
    } else {
      const answer = String(option.value ?? "").trim();
      if (!answer || answer.length > 80 || seen.has(answer)) return "Cada opção precisa de um valor único.";
      seen.add(answer);
    }
  }
  return null;
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
  const { data: developer, error: developerError } = await db.from("platform_developers")
    .select("user_id").eq("user_id", user.id).maybeSingle();
  if (developerError) return json({ error: "Falha ao validar acesso de desenvolvedor" }, 500);

  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const action = String(input.action ?? "");
  if (action === "status") return json({ data: { isDeveloper: Boolean(developer) } });
  if (!developer) return json({ error: "Acesso restrito a desenvolvedores" }, 403);
  if (action === "list") {
    const [{ data: systems, error: systemsError }, { data: categoryRules, error: categoryRulesError }, { data: questions, error: questionsError }] = await Promise.all([
      db.from("maintenance_system_rules").select("*").order("name"),
      db.from("maintenance_category_system_rules").select("*").order("vehicle_category").order("system_code"),
      db.from("maintenance_rule_questions").select("*").order("system_code").order("display_order"),
    ]);
    if (systemsError || categoryRulesError || questionsError) return json({ error: "Não foi possível carregar as regras." }, 500);
    return json({ data: { systems: systems ?? [], category_rules: categoryRules ?? [], questions: questions ?? [] } });
  }

  if (action === "save_system") {
    const record = input.record as Record<string, unknown> | undefined;
    if (!record) return json({ error: "Sistema inválido." }, 400);
    const code = String(record.system_code ?? "").trim().toLowerCase();
    const name = String(record.name ?? "").trim();
    const baseLife = record.base_life_km == null || record.base_life_km === "" ? null : Number(record.base_life_km);
    const replacementCost = record.replacement_cost == null || record.replacement_cost === "" ? null : Number(record.replacement_cost);
    const formulas = [record.formula_adjusted_life, record.formula_cpk, record.formula_route_cost].map((value) => String(value ?? "").trim());
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(code) || name.length < 2 || name.length > 100) return json({ error: "Informe um código e nome válidos." }, 400);
    if ((baseLife !== null && (!Number.isFinite(baseLife) || baseLife <= 0)) || (replacementCost !== null && (!Number.isFinite(replacementCost) || replacementCost < 0))) return json({ error: "Vida útil e custo precisam ser números válidos." }, 400);
    const allowedVariables = new Set(["base_life_km", "factor_product", "replacement_cost", "route_km", "adjusted_life_km", "cpk"]);
    const { data: questionKeys } = await db.from("maintenance_rule_questions").select("answer_key");
    for (const item of questionKeys ?? []) allowedVariables.add(`${item.answer_key}_multiplier`);
    for (const formula of formulas) {
      if (!formula || formula.length > 240) return json({ error: "Preencha as três fórmulas (máximo de 240 caracteres)." }, 400);
      const tokens = formula.match(/[A-Za-z_][A-Za-z0-9_]*|(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/]/g) ?? [];
      if (tokens.join("") !== formula.replace(/\s+/g, "") || tokens.some((token) => /^[A-Za-z_]/.test(token) && !allowedVariables.has(token))) return json({ error: "Fórmula inválida. Use números, parênteses e +, -, *, / com as variáveis permitidas." }, 400);
    }
    const payload = {
      system_code: code, name, base_life_km: baseLife, replacement_cost: replacementCost,
      formula_adjusted_life: formulas[0], formula_cpk: formulas[1], formula_route_cost: formulas[2],
      basis_note: record.basis_note == null ? null : String(record.basis_note).slice(0, 500),
      is_active: record.is_active !== false, updated_at: new Date().toISOString(),
    };
    const { data, error } = await db.from("maintenance_system_rules").upsert(payload, { onConflict: "system_code" }).select().single();
    if (error) return json({ error: "Não foi possível salvar o sistema. Verifique se o código já está sendo usado." }, 400);
    return json({ data });
  }

  if (action === "save_category_rule") {
    const record = input.record as Record<string, unknown> | undefined;
    if (!record) return json({ error: "Regra de categoria inválida." }, 400);
    const systemCode = String(record.system_code ?? "").trim().toLowerCase();
    const vehicleCategory = String(record.vehicle_category ?? "");
    const baseLife = record.base_life_km == null || record.base_life_km === "" ? null : Number(record.base_life_km);
    const replacementCost = record.replacement_cost == null || record.replacement_cost === "" ? null : Number(record.replacement_cost);
    const formulas = [record.formula_adjusted_life, record.formula_cpk, record.formula_route_cost].map((value) => String(value ?? "").trim());
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(systemCode) || !vehicleCategories.has(vehicleCategory)) return json({ error: "Selecione um sistema e uma categoria válidos." }, 400);
    if ((baseLife !== null && (!Number.isFinite(baseLife) || baseLife <= 0)) || (replacementCost !== null && (!Number.isFinite(replacementCost) || replacementCost < 0))) return json({ error: "Vida útil e custo precisam ser números válidos." }, 400);
    const allowedVariables = new Set(["base_life_km", "factor_product", "replacement_cost", "route_km", "adjusted_life_km", "cpk"]);
    const { data: questionKeys } = await db.from("maintenance_rule_questions").select("answer_key");
    for (const item of questionKeys ?? []) allowedVariables.add(`${item.answer_key}_multiplier`);
    for (const formula of formulas) {
      if (!formula || formula.length > 240) return json({ error: "Preencha as três fórmulas (máximo de 240 caracteres)." }, 400);
      const tokens = formula.match(/[A-Za-z_][A-Za-z0-9_]*|(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/]/g) ?? [];
      if (tokens.join("") !== formula.replace(/\s+/g, "") || tokens.some((token) => /^[A-Za-z_]/.test(token) && !allowedVariables.has(token))) return json({ error: "Fórmula inválida. Use números, parênteses e +, -, *, / com as variáveis permitidas." }, 400);
    }
    const payload = {
      system_code: systemCode, vehicle_category: vehicleCategory, base_life_km: baseLife,
      replacement_cost: replacementCost, formula_adjusted_life: formulas[0], formula_cpk: formulas[1],
      formula_route_cost: formulas[2], basis_note: record.basis_note == null ? null : String(record.basis_note).slice(0, 500),
      is_active: record.is_active !== false, updated_at: new Date().toISOString(),
    };
    const { data, error } = await db.from("maintenance_category_system_rules")
      .upsert(payload, { onConflict: "system_code,vehicle_category" }).select().single();
    if (error) return json({ error: "Não foi possível salvar a regra. Verifique sistema e categoria." }, 400);
    return json({ data });
  }

  if (action === "save_category_rules") {
    const records = input.records;
    if (!Array.isArray(records) || records.length < 1 || records.length > 500) return json({ error: "Envie de 1 a 500 regras por arquivo." }, 400);
    const { data: questionKeys } = await db.from("maintenance_rule_questions").select("answer_key");
    const allowedVariables = new Set(["base_life_km", "factor_product", "replacement_cost", "route_km", "adjusted_life_km", "cpk"]);
    for (const item of questionKeys ?? []) allowedVariables.add(`${item.answer_key}_multiplier`);
    const seen = new Set<string>();
    const payload: Record<string, unknown>[] = [];
    for (let index = 0; index < records.length; index++) {
      const rawRecord = records[index];
      if (!rawRecord || typeof rawRecord !== "object" || Array.isArray(rawRecord)) return json({ error: `Linha ${index + 2}: dados inválidos.` }, 400);
      const record = rawRecord as Record<string, unknown>;
      const systemCode = String(record.system_code ?? "").trim().toLowerCase();
      const vehicleCategory = String(record.vehicle_category ?? "");
      const baseLife = record.base_life_km == null || record.base_life_km === "" ? null : Number(record.base_life_km);
      const replacementCost = record.replacement_cost == null || record.replacement_cost === "" ? null : Number(record.replacement_cost);
      const formulas = [record.formula_adjusted_life, record.formula_cpk, record.formula_route_cost].map((value) => String(value ?? "").trim());
      const row = index + 2;
      if (!/^[a-z][a-z0-9_]{1,49}$/.test(systemCode) || !vehicleCategories.has(vehicleCategory)) return json({ error: `Linha ${row}: sistema ou categoria inválidos.` }, 400);
      if ((baseLife !== null && (!Number.isFinite(baseLife) || baseLife <= 0)) || (replacementCost !== null && (!Number.isFinite(replacementCost) || replacementCost < 0))) return json({ error: `Linha ${row}: vida útil ou custo inválidos.` }, 400);
      if (formulas.some((formula) => !formula || formula.length > 240)) return json({ error: `Linha ${row}: preencha as três fórmulas (até 240 caracteres).` }, 400);
      for (const formula of formulas) {
        const tokens = formula.match(/[A-Za-z_][A-Za-z0-9_]*|(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/]/g) ?? [];
        if (tokens.join("") !== formula.replace(/\s+/g, "") || tokens.some((token) => /^[A-Za-z_]/.test(token) && !allowedVariables.has(token))) return json({ error: `Linha ${row}: fórmula inválida.` }, 400);
      }
      const key = `${systemCode}:${vehicleCategory}`;
      if (seen.has(key)) return json({ error: `O arquivo repete sistema e categoria na linha ${row}.` }, 400);
      seen.add(key);
      payload.push({
        system_code: systemCode, vehicle_category: vehicleCategory, base_life_km: baseLife,
        replacement_cost: replacementCost, formula_adjusted_life: formulas[0], formula_cpk: formulas[1],
        formula_route_cost: formulas[2], basis_note: record.basis_note == null ? null : String(record.basis_note).slice(0, 500),
        is_active: record.is_active !== false, updated_at: new Date().toISOString(),
      });
    }
    const { error } = await db.from("maintenance_category_system_rules")
      .upsert(payload, { onConflict: "system_code,vehicle_category" });
    if (error) return json({ error: "Importação não salva. Confira se todos os códigos de sistema existem." }, 400);
    return json({ data: { count: payload.length } });
  }

  if (action === "save_question") {
    const record = input.record as Record<string, unknown> | undefined;
    if (!record) return json({ error: "Pergunta inválida." }, 400);
    const systemCode = String(record.system_code ?? "").trim().toLowerCase();
    const answerKey = String(record.answer_key ?? "").trim().toLowerCase();
    const question = String(record.question ?? "").trim();
    const answerType = String(record.answer_type ?? "select");
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(systemCode) || !/^[a-z][a-z0-9_]{1,59}$/.test(answerKey) || question.length < 5 || question.length > 300 || !["select", "number"].includes(answerType)) return json({ error: "Revise o sistema, código, pergunta e tipo de resposta." }, 400);
    const optionsError = validateOptions(answerType, record.options);
    if (optionsError) return json({ error: optionsError }, 400);
    const payload = {
      ...(record.id ? { id: String(record.id) } : {}), system_code: systemCode,
      answer_key: answerKey, question, answer_type: answerType, options: record.options,
      required: record.required !== false, display_order: Number.isInteger(Number(record.display_order)) ? Number(record.display_order) : 0,
      is_active: record.is_active !== false, updated_at: new Date().toISOString(),
    };
    const { data, error } = await db.from("maintenance_rule_questions").upsert(payload, { onConflict: "id" }).select().single();
    if (error) return json({ error: "Não foi possível salvar a pergunta. Confira o código e as respostas." }, 400);
    return json({ data });
  }

  if (action === "delete_question") {
    const id = String(input.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "ID inválido." }, 400);
    const { error } = await db.from("maintenance_rule_questions").delete().eq("id", id);
    if (error) return json({ error: "Não foi possível excluir a pergunta." }, 400);
    return json({ success: true });
  }
  if (action === "delete_system") {
    const code = String(input.system_code ?? "");
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(code)) return json({ error: "Código inválido." }, 400);
    const { error } = await db.from("maintenance_system_rules").delete().eq("system_code", code);
    if (error) return json({ error: "Não foi possível excluir o sistema." }, 400);
    return json({ success: true });
  }
  return json({ error: "Operação inválida." }, 400);
});
