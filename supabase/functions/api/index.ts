import { createClient } from "npm:@supabase/supabase-js@2";
import { consumeRedisRateLimit, type RateLimitResult } from "../_shared/redis-rate-limit.ts";

const tables = new Set(["vehicles", "drivers", "clients", "routes", "maintenances", "finances"]);
const deactivatableTables = new Set(["vehicles", "drivers", "clients"]);
const writableColumns: Record<string, Set<string>> = {
  vehicles: new Set(["brand", "model", "plate", "fuel_type", "km_aquisicao", "km_atual", "color", "status", "year", "id_plate", "vehicle_category", "operation_type", "service_description", "starts_per_day", "operating_days_per_week", "average_daily_km", "engine_version", "engine_hours_per_day", "start_cycles_total", "urban_highway_score", "maintenance_history", "payload_capacity_kg", "fuel_efficiencies"]),
  drivers: new Set(["name", "document", "pay_per_day"]),
  clients: new Set(["name", "contact"]),
  routes: new Set(["km_total", "stop_count", "fuel_cost", "driver_cost", "other_costs", "price_charged", "start_time", "end_time", "status", "driver_id", "vehicle_id", "client_id", "maintenance_answers", "route_periodicity", "other_frequency_count", "payload_weight_kg", "duration_minutes", "fuel_type_used", "fuel_unit_price", "route_urban_highway_score"]),
  maintenances: new Set(["vehicle_id", "service", "parts", "cost", "local", "km_agendado", "date_service", "next_date", "component", "km_at_service", "start_cycles_at_service"]),
  finances: new Set(["type", "description", "amount", "related_maintenance_id"]),
};
const configuredOrigins = (Deno.env.get("APP_ORIGINS") ?? Deno.env.get("APP_ORIGIN") ?? "")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
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

function evaluateFormula(expression: string, values: Record<string, number>): number {
  const tokens = expression.match(/[A-Za-z_][A-Za-z0-9_]*|(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/]/g) ?? [];
  if (tokens.join("") !== expression.replace(/\s+/g, "")) throw new Error("Fórmula contém caracteres inválidos.");
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  const primary = (): number => {
    const token = take();
    if (token === "(") {
      const value = sum();
      if (take() !== ")") throw new Error("Parênteses inválidos.");
      return value;
    }
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token ?? "")) return Number(token);
    if (token !== undefined && /^[A-Za-z_][A-Za-z0-9_]*$/.test(token) && Object.hasOwn(values, token)) return values[token];
    throw new Error(`Variável inválida na fórmula: ${token ?? ""}`);
  };
  const unary = (): number => peek() === "-" ? (take(), -unary()) : peek() === "+" ? (take(), unary()) : primary();
  const product = (): number => {
    let value = unary();
    while (peek() === "*" || peek() === "/") {
      const op = take(); const right = unary();
      if (op === "/" && right === 0) throw new Error("Divisão por zero.");
      value = op === "*" ? value * right : value / right;
    }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (peek() === "+" || peek() === "-") {
      const op = take(); const right = product();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };
  const result = sum();
  if (position !== tokens.length || !Number.isFinite(result)) throw new Error("Resultado da fórmula inválido.");
  return result;
}

function calculateRuleResults(
  systems: Record<string, unknown>[],
  questions: Record<string, unknown>[],
  answers: Record<string, unknown>,
  routeKm: number,
) {
  return systems.map((system) => {
    const systemQuestions = questions.filter((question) => question.system_code === system.system_code);
    const missing: string[] = [];
    let factorProduct = 1;
    const variables: Record<string, number> = {
      base_life_km: Number(system.base_life_km ?? 0),
      replacement_cost: Number(system.replacement_cost ?? 0),
      route_km: routeKm,
      factor_product: 1,
    };
    for (const question of systemQuestions) {
      const rawAnswer = answers[String(question.id)] ?? answers[String(question.answer_key)];
      if (rawAnswer === undefined || rawAnswer === null || rawAnswer === "") {
        if (question.required) missing.push(String(question.question));
        continue;
      }
      const options = Array.isArray(question.options) ? question.options as Record<string, unknown>[] : [];
      const numericAnswer = Number(rawAnswer);
      const option = options.find((candidate) => {
        if (question.answer_type === "number") {
          const min = candidate.min == null ? -Infinity : Number(candidate.min);
          const max = candidate.max == null ? Infinity : Number(candidate.max);
          return Number.isFinite(numericAnswer) && numericAnswer >= min && numericAnswer <= max;
        }
        return String(candidate.value) === String(rawAnswer);
      });
      if (!option) { missing.push(String(question.question)); continue; }
      const multiplier = Number(option.multiplier ?? 1);
      factorProduct *= multiplier;
      variables[`${String(question.answer_key)}_multiplier`] = multiplier;
    }
    variables.factor_product = factorProduct;

    let adjustedLifeKm: number | null = null;
    let cpk: number | null = null;
    let routeCost: number | null = null;
    let calculationError: string | null = null;
    if (!missing.length && Number(system.base_life_km) > 0 && Number(system.replacement_cost) > 0) {
      try {
        adjustedLifeKm = evaluateFormula(String(system.formula_adjusted_life), variables);
        variables.adjusted_life_km = adjustedLifeKm;
        cpk = evaluateFormula(String(system.formula_cpk), variables);
        variables.cpk = cpk;
        routeCost = evaluateFormula(String(system.formula_route_cost), variables);
        if (adjustedLifeKm <= 0 || cpk < 0 || routeCost < 0) throw new Error("Os resultados precisam ser positivos.");
      } catch (error) {
        adjustedLifeKm = null; cpk = null; routeCost = null;
        calculationError = error instanceof Error ? error.message : "Fórmula inválida.";
      }
    }
    return {
      system_code: system.system_code, profile_id: system.profile_id ?? null,
      component_name: system.component_name ?? system.name,
      name: system.name, vehicle_category: system.vehicle_category, component_reference: system.component_reference ?? null, base_life_km: system.base_life_km,
      replacement_cost: system.replacement_cost, factor_product: factorProduct,
      adjusted_life_km: adjustedLifeKm, cpk, route_cost: routeCost,
      missing_questions: missing, formula_error: calculationError,
      basis_note: system.basis_note,
    };
  });
}

function applyVehicleCpkProfiles(
  categoryRules: Record<string, unknown>[],
  profiles: Record<string, unknown>[],
  systemNames: Map<string, string>,
) {
  return categoryRules.flatMap((rule) => {
    const systemCode = String(rule.system_code);
    const name = systemNames.get(systemCode) ?? systemCode;
    const customProfiles = profiles.filter((profile) => profile.system_code === systemCode);
    const components = customProfiles.length ? customProfiles : [{
      id: null, component_name: systemCode === "oleo_motor" ? "Óleo do motor" : name, component_reference: null,
      base_life_km: rule.base_life_km, replacement_cost: rule.replacement_cost,
    }];
    return components.map((component) => ({
      ...rule,
      profile_id: component.id ?? null,
      is_default: component.id == null,
      component_name: component.component_name ?? name,
      component_reference: component.component_reference ?? null,
      name,
      base_life_km: component.base_life_km ?? rule.base_life_km,
      replacement_cost: component.replacement_cost ?? rule.replacement_cost,
    }));
  });
}

function validateRecord(table: string, row: Record<string, unknown>, creating: boolean, validatePlate = creating): string | null {
  const required: Record<string, string[]> = {
    vehicles: ["brand", "model", "plate", "km_aquisicao", "km_atual", "vehicle_category", "operation_type", "urban_highway_score"],
    drivers: ["name"], clients: ["name"], routes: ["km_total", "stop_count", "vehicle_id", "route_periodicity", "payload_weight_kg", "duration_minutes"],
    maintenances: ["service", "cost", "date_service"], finances: ["type", "amount", "description"],
  };
  if (creating) {
    for (const key of required[table] ?? []) {
      if (row[key] === null || row[key] === undefined || row[key] === "") return `Preencha o campo obrigatório: ${key}.`;
    }
  }
  const nonnegative = (keys: string[]) => keys.find((key) => row[key] !== null && row[key] !== undefined && row[key] !== "" &&
    (!Number.isFinite(Number(row[key])) || Number(row[key]) < 0));
  if (table === "vehicles") {
    const plate = String(row.plate ?? "").toUpperCase().replace(/[\s-]/g, "");
    if (validatePlate && row.plate !== undefined && !/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(plate)) return "Informe uma placa válida (ABC1234 ou ABC1D23).";
    if (row.plate !== undefined) row.plate = plate;
    if (row.fuel_type && !["gasolina", "diesel", "etanol", "gnv", "flex"].includes(String(row.fuel_type))) return "Selecione um combustível válido.";
    if (row.vehicle_category !== null && row.vehicle_category !== undefined && row.vehicle_category !== "" && !["moto", "carro_passeio", "utilitario_medio", "utilitario_grande", "caminhao"].includes(String(row.vehicle_category))) return "Selecione uma categoria de veículo válida.";
    if (row.year !== undefined && row.year !== null && (Number(row.year) < 1900 || Number(row.year) > new Date().getFullYear() + 1)) return "Informe um ano de fabricação válido.";
    if (row.payload_capacity_kg !== undefined && row.payload_capacity_kg !== null && (!Number.isFinite(Number(row.payload_capacity_kg)) || Number(row.payload_capacity_kg) < 0)) return "Informe uma capacidade de carga válida.";
    if (row.fuel_efficiencies !== undefined) {
      if (!row.fuel_efficiencies || typeof row.fuel_efficiencies !== "object" || Array.isArray(row.fuel_efficiencies)) return "Os consumos do veículo são inválidos.";
      const expectedFuel = String(row.fuel_type) === "flex" ? ["gasolina", "etanol"] : [String(row.fuel_type)];
      for (const fuel of expectedFuel) {
        const efficiency = (row.fuel_efficiencies as Record<string, unknown>)[fuel];
        if (!efficiency || typeof efficiency !== "object" || Array.isArray(efficiency)) return `Informe o consumo de ${fuel} na cidade e na estrada.`;
        const values = efficiency as Record<string, unknown>;
        if (![values.city_km_per_unit, values.highway_km_per_unit].every((value) => Number.isFinite(Number(value)) && Number(value) > 0)) return `Informe os consumos válidos de ${fuel}.`;
      }
    }
    if (row.operation_type && !["entrega_porta_a_porta", "urbano", "rodoviario", "obras_campo", "passageiros", "coleta", "outro"].includes(String(row.operation_type))) return "Selecione um tipo de operação válido.";
    if (!Number.isInteger(Number(row.urban_highway_score)) || Number(row.urban_highway_score) < 1 || Number(row.urban_highway_score) > 5) return "Informe a predominância entre cidade e estrada na escala de 1 a 5.";
    if (!Number.isInteger(Number(row.operating_days_per_week ?? 5)) || Number(row.operating_days_per_week ?? 5) < 1 || Number(row.operating_days_per_week ?? 5) > 7) return "Os dias de operação por semana devem ficar entre 1 e 7.";
    if (row.starts_per_day !== null && row.starts_per_day !== undefined && row.starts_per_day !== "" && (!Number.isInteger(Number(row.starts_per_day)) || Number(row.starts_per_day) < 0 || Number(row.starts_per_day) > 500)) return "Informe de 0 a 500 partidas por dia.";
    if (row.average_daily_km !== null && row.average_daily_km !== undefined && row.average_daily_km !== "" && (!Number.isInteger(Number(row.average_daily_km)) || Number(row.average_daily_km) < 0 || Number(row.average_daily_km) > 2000)) return "Informe de 0 a 2.000 km por dia.";
    if (row.engine_hours_per_day !== null && row.engine_hours_per_day !== undefined && row.engine_hours_per_day !== "" && (!Number.isFinite(Number(row.engine_hours_per_day)) || Number(row.engine_hours_per_day) < 0 || Number(row.engine_hours_per_day) > 24)) return "Informe de 0 a 24 horas de motor por dia.";
    if (row.maintenance_history !== null && row.maintenance_history !== undefined) {
      const history = row.maintenance_history;
      if (typeof history !== "object" || Array.isArray(history)) return "O histórico de manutenção informado é inválido.";
      const allowed = new Set(["oleo_filtros", "pneus", "partida_eletrica", "bateria", "alternador", "injecao_bicos", "suspensao", "freios"]);
      const statuses = new Set(["known", "performed_unknown", "not_done", "unknown"]);
      for (const [component, entry] of Object.entries(history as Record<string, unknown>)) {
        if (!allowed.has(component) || !entry || typeof entry !== "object" || Array.isArray(entry)) return "Há um item inválido no histórico de manutenção.";
        const item = entry as Record<string, unknown>;
        if (!statuses.has(String(item.status))) return "Informe uma opção válida para cada item do histórico.";
        for (const key of ["km_at_service", "start_cycles_at_service"] as const) {
          const value = item[key];
          if (value !== null && value !== undefined && (!Number.isInteger(Number(value)) || Number(value) < 0)) return "KM e ciclos no histórico devem ser números inteiros positivos.";
        }
        if (item.date_service && (Number.isNaN(Date.parse(String(item.date_service))) || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.date_service)))) return "Informe uma data válida para o histórico de manutenção.";
        for (const key of ["tread_new_mm", "tread_current_mm", "tread_measurement_km"] as const) {
          const value = item[key];
          if (value !== null && value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > (key === "tread_measurement_km" ? 2_000_000 : 30))) return "Informe medições de pneus válidas.";
        }
        if (item.oil_spec != null && String(item.oil_spec).length > 120) return "A descrição do óleo deve ter até 120 caracteres.";
        if (item.tire_model != null && String(item.tire_model).length > 120) return "A descrição do pneu deve ter até 120 caracteres.";
        if (item.status === "known" && item.km_at_service == null && !item.date_service) return "Informe o KM ou a data da última manutenção marcada como conhecida.";
      }
    }
    const invalid = nonnegative(["km_aquisicao", "km_atual", "start_cycles_total", "payload_capacity_kg"]);
    if (invalid) return `O campo ${invalid} precisa ser um número igual ou maior que zero.`;
    if (Number(row.km_atual) < Number(row.km_aquisicao)) return "A quilometragem atual não pode ser menor que a quilometragem de aquisição.";
  }
  if (table === "drivers") {
    const invalid = nonnegative(["pay_per_day"]);
    if (invalid) return "A diária não pode ser negativa.";
    if (row.name !== undefined && !String(row.name).trim()) return "Informe o nome do motorista.";
  }
  if (table === "clients" && row.name !== undefined && !String(row.name).trim()) return "Informe o nome do cliente.";
  if (table === "routes") {
    const invalid = nonnegative(["km_total", "stop_count", "fuel_cost", "driver_cost", "other_costs", "price_charged", "payload_weight_kg", "duration_minutes", "fuel_unit_price"]);
    if (invalid) return "Distância e valores da rota não podem ser negativos.";
    if (row.stop_count !== undefined && (!Number.isInteger(Number(row.stop_count)) || Number(row.stop_count) > 1000)) return "Informe até 1.000 paradas na rota.";
    if (row.route_periodicity && !["diaria", "semanal", "quinzenal", "mensal", "esporadica", "outros"].includes(String(row.route_periodicity))) return "Selecione uma periodicidade válida.";
    if (row.route_periodicity !== "esporadica" && (!row.start_time || !row.end_time)) return "Informe as datas inicial e final do período da rota.";
    if ((row.start_time && !row.end_time) || (!row.start_time && row.end_time)) return "Informe as duas datas do período da rota.";
    if (row.route_periodicity === "outros" && (!Number.isInteger(Number(row.other_frequency_count)) || Number(row.other_frequency_count) < 1)) return "Informe quantas vezes a rota se repete.";
    if (row.other_frequency_count != null && row.other_frequency_count !== "" && (!Number.isInteger(Number(row.other_frequency_count)) || Number(row.other_frequency_count) < 1)) return "A frequência deve ser um número inteiro positivo.";
    if (row.duration_minutes != null && row.duration_minutes !== "" && !Number.isInteger(Number(row.duration_minutes))) return "A duração deve ser informada em minutos inteiros.";
    if (row.route_urban_highway_score != null && (!Number.isInteger(Number(row.route_urban_highway_score)) || Number(row.route_urban_highway_score) < 1 || Number(row.route_urban_highway_score) > 5)) return "Informe o perfil da rota na escala de 1 a 5.";
    if (row.fuel_type_used && !["gasolina", "diesel", "etanol", "gnv"].includes(String(row.fuel_type_used))) return "Selecione um combustível válido para a rota.";
    if (row.status !== "pendente" && (!row.vehicle_id || !row.driver_id)) return "Selecione o veículo e o motorista para iniciar ou concluir a rota.";
    if (row.status === "concluida" && row.price_charged == null) return "Informe o valor recebido antes de concluir a rota.";
    if (row.status && !["pendente", "em_andamento", "concluida"].includes(String(row.status))) return "Selecione um status de rota válido.";
    if (row.start_time && Number.isNaN(Date.parse(String(row.start_time)))) return "Informe uma data de início válida.";
    if (row.end_time && (Number.isNaN(Date.parse(String(row.end_time))) || !row.start_time || Date.parse(String(row.end_time)) < Date.parse(String(row.start_time)))) return "O fim da rota deve ocorrer depois do início.";
    if (row.route_periodicity === "outros" && row.start_time && row.end_time) {
      const days = Math.floor((Date.parse(`${String(row.end_time).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(row.start_time).slice(0, 10)}T00:00:00Z`)) / 86_400_000) + 1;
      if (Number(row.other_frequency_count) > days) return "A frequência personalizada não pode superar os dias do período.";
    }
    if (row.maintenance_answers !== undefined && (typeof row.maintenance_answers !== "object" || row.maintenance_answers === null || Array.isArray(row.maintenance_answers))) return "As respostas de uso da rota são inválidas.";
    if (row.maintenance_answers !== undefined && JSON.stringify(row.maintenance_answers).length > 20000) return "As respostas da rota excedem o limite permitido.";
  }
  if (table === "maintenances") {
    const invalid = nonnegative(["cost", "km_agendado", "km_at_service", "start_cycles_at_service"]);
    if (invalid) return "Custo e quilometragem agendada não podem ser negativos.";
    if (row.component && !["oleo_filtros", "pneus", "partida_eletrica", "bateria", "alternador", "injecao_bicos", "suspensao", "freios", "outro"].includes(String(row.component))) return "Selecione um componente válido.";
    if (row.next_date && row.date_service && String(row.next_date) < String(row.date_service)) return "A próxima revisão não pode anteceder o serviço atual.";
  }
  if (table === "finances") {
    if (row.type && !["entrada", "saida"].includes(String(row.type))) return "Selecione entrada ou saída.";
    if (row.amount !== undefined && (!Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0)) return "O valor deve ser maior que zero.";
    if (row.description !== undefined && !String(row.description).trim()) return "Informe uma descrição para o lançamento.";
  }
  return null;
}

async function validateActiveRouteReferences(
  db: ReturnType<typeof createClient>,
  tenantId: string,
  row: Record<string, unknown>,
): Promise<string | null> {
  const references = [
    { field: "vehicle_id", table: "vehicles", label: "veículo" },
    { field: "driver_id", table: "drivers", label: "motorista" },
    { field: "client_id", table: "clients", label: "cliente" },
  ];
  for (const reference of references) {
    const id = row[reference.field];
    if (id === undefined || id === null || id === "") continue;
    const { data, error } = await db.from(reference.table).select("id,status")
      .eq("tenant_id", tenantId).eq("id", id).maybeSingle();
    if (error) return "Não foi possível validar os cadastros vinculados à rota.";
    if (!data) return `O ${reference.label} selecionado não pertence a esta empresa.`;
    if (data.status === false) return `Não é possível usar um ${reference.label} desativado em uma nova rota.`;
  }
  return null;
}

function routeOccurrenceDates(row: Record<string, unknown>): string[] {
  const datePart = (value: unknown) => {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  };
  const start = datePart(row.start_time) ?? datePart(row.end_time) ?? new Date().toISOString().slice(0, 10);
  const end = datePart(row.end_time) ?? start;
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) throw new Error("Informe um intervalo de datas válido para a rota.");
  const periodicity = String(row.route_periodicity ?? "esporadica");
  const span = Math.floor((endMs - startMs) / 86_400_000);
  const dates: string[] = [];
  const addDays = (days: number) => new Date(startMs + days * 86_400_000).toISOString().slice(0, 10);
  if (periodicity === "esporadica") return [start];
  if (periodicity === "outros") {
    const count = Number(row.other_frequency_count);
    if (!Number.isInteger(count) || count < 1 || count > span + 1) throw new Error("A frequência personalizada precisa caber no período informado.");
    for (let i = 0; i < count; i++) dates.push(addDays(Math.round(i * span / Math.max(count - 1, 1))));
  } else if (periodicity === "mensal") {
    const initial = new Date(startMs);
    const originalDay = initial.getUTCDate();
    for (let month = 0; ; month++) {
      const firstOfMonth = new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth() + month, 1));
      const daysInMonth = new Date(Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0)).getUTCDate();
      const occurrence = new Date(Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth(), Math.min(originalDay, daysInMonth)));
      if (occurrence.getTime() > endMs) break;
      dates.push(occurrence.toISOString().slice(0, 10));
    }
  } else {
    const step = periodicity === "diaria" ? 1 : periodicity === "semanal" ? 7 : periodicity === "quinzenal" ? 14 : 0;
    if (!step) throw new Error("Selecione uma periodicidade válida.");
    for (let offset = 0; offset <= span; offset += step) dates.push(addDays(offset));
  }
  if (!dates.length || dates.length > 1000) throw new Error("O período deve gerar entre 1 e 1.000 execuções.");
  return dates;
}

async function calculateRouteCosts(
  db: ReturnType<typeof createClient>, tenantId: string, row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = { ...row };
  if (!row.vehicle_id) return result;
  const occurrences = routeOccurrenceDates(row);
  result.occurrence_count = occurrences.length;
  const { data: vehicle, error: vehicleError } = await db.from("vehicles")
    .select("fuel_type,fuel_efficiencies,payload_capacity_kg,urban_highway_score,vehicle_category")
    .eq("tenant_id", tenantId).eq("id", row.vehicle_id).maybeSingle();
  if (vehicleError || !vehicle) throw new Error("Não foi possível carregar o veículo para calcular os custos da rota.");
  if (row.payload_weight_kg != null && vehicle.payload_capacity_kg != null && Number(row.payload_weight_kg) > Number(vehicle.payload_capacity_kg)) {
    throw new Error("A carga supera a capacidade total cadastrada para este veículo.");
  }

  const fuel = String(row.fuel_type_used ?? "");
  const allowedFuels = String(vehicle.fuel_type) === "flex" ? ["gasolina", "etanol"] : [String(vehicle.fuel_type)];
  if (fuel && !allowedFuels.includes(fuel)) throw new Error("O combustível escolhido não é compatível com o veículo.");
  const efficiency = (vehicle.fuel_efficiencies as Record<string, Record<string, unknown>> | null)?.[fuel];
  const unitPrice = Number(row.fuel_unit_price);
  const routeKm = Number(row.km_total ?? 0);
  if (fuel && efficiency && Number.isFinite(unitPrice) && unitPrice > 0 && routeKm > 0) {
    const score = Math.max(1, Math.min(5, Number(row.route_urban_highway_score ?? vehicle.urban_highway_score ?? 3)));
    const cityShare = (5 - score) / 4;
    const highwayShare = (score - 1) / 4;
    const cityConsumption = Number(efficiency.city_km_per_unit);
    const highwayConsumption = Number(efficiency.highway_km_per_unit);
    if (cityConsumption > 0 && highwayConsumption > 0) {
      const units = routeKm * (cityShare / cityConsumption + highwayShare / highwayConsumption);
      result.fuel_cost = Math.round(units * unitPrice * 100) / 100;
    }
  }

  const category = String(vehicle.vehicle_category ?? "");
  if (!category) { result.maintenance_cost = 0; return result; }
  const [systemsResult, rulesResult, questionsResult, profilesResult] = await Promise.all([
    db.from("maintenance_system_rules").select("system_code,name").eq("is_active", true),
    db.from("maintenance_category_system_rules").select("system_code,vehicle_category,base_life_km,replacement_cost,formula_adjusted_life,formula_cpk,formula_route_cost,basis_note,is_active").eq("vehicle_category", category).eq("is_active", true),
    db.from("maintenance_rule_questions").select("id,system_code,answer_key,question,answer_type,options,required,is_active").eq("is_active", true),
    db.from("vehicle_cpk_profiles").select("id,system_code,component_name,component_reference,base_life_km,replacement_cost").eq("tenant_id", tenantId).eq("vehicle_id", row.vehicle_id),
  ]);
  if (systemsResult.error || rulesResult.error || questionsResult.error || profilesResult.error) throw new Error("Não foi possível carregar as regras CPK desta rota.");
  const names = new Map((systemsResult.data ?? []).map((system) => [system.system_code, system.name]));
  const rules = (rulesResult.data ?? []).filter((rule) => names.has(rule.system_code));
  const systems = applyVehicleCpkProfiles(rules, profilesResult.data ?? [], names);
  const answers = row.maintenance_answers && typeof row.maintenance_answers === "object" ? row.maintenance_answers as Record<string, unknown> : {};
  const calculations = calculateRuleResults(systems, questionsResult.data ?? [], answers, routeKm);
  result.maintenance_cost = Math.round(calculations.reduce((sum, item) => sum + (item.route_cost == null ? 0 : Number(item.route_cost)), 0) * 100) / 100;
  return result;
}

async function findMaintenanceManual(vehicle: Record<string, unknown>) {
  const brand = String(vehicle.brand ?? "");
  const model = String(vehicle.model ?? "");
  const engine = String(vehicle.engine_version ?? "");
  const query = [brand, model, vehicle.year, engine, "manual plano de manutenção revisões fabricante"].filter(Boolean).join(" ");
  const searchKey = Deno.env.get("TAVILY_API_KEY");
  const cleanBrand = brand.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const officialDomains: Record<string, string[]> = {
    iveco: ["iveco.com.br", "iveco.com"], ford: ["ford.com.br", "ford.com"],
    fiat: ["fiat.com.br", "fiat.com"], volkswagen: ["vw.com.br", "volkswagen.com"],
    mercedesbenz: ["mercedes-benz.com.br", "mercedes-benz-trucks.com"],
    renault: ["renault.com.br", "renault-trucks.com"], chevrolet: ["chevrolet.com.br"],
    toyota: ["toyota.com.br", "toyota.com"], volvo: ["volvotrucks.com", "volvocars.com.br"],
    scania: ["scania.com.br", "scania.com"], man: ["man.eu", "mantruckandbus.com"],
    daf: ["daf.com"], hino: ["hino.com.br", "hino-global.com"],
    hyundai: ["hyundai.com.br", "hyundai.com"], kia: ["kia.com.br", "kia.com"],
    peugeot: ["peugeot.com.br", "peugeot.com"], citroen: ["citroen.com.br", "citroen.com"],
    mitsubishi: ["mitsubishimotors.com.br", "mitsubishi-motors.com"],
    agrale: ["agrale.com.br"], ram: ["ram.com.br", "ramtrucks.com"], jeep: ["jeep.com.br"],
    bmw: ["bmw.com.br", "bmw.com"], audi: ["audi.com.br", "audi.com"], nissan: ["nissan.com.br", "nissan-global.com"],
    honda: ["honda.com.br", "honda.com"], suzuki: ["suzukiveiculos.com.br", "globalsuzuki.com"],
    yamaha: ["yamaha-motor.com.br", "yamaha-motor.eu", "yamaha-motor.com"],
    byd: ["byd.com", "byd.com.br"], jac: ["jacmotors.com.br"], gwm: ["gwm.com.br"],
    chery: ["caoachery.com.br", "cheryinternational.com"],
    johndeere: ["deere.com.br", "deere.com"], komatsu: ["komatsu.com.br", "komatsu.com"],
  };
  // Brand is user input: use exact host suffixes, never substring matching.
  const allowedDomains = officialDomains[cleanBrand] ?? [];
  if (searchKey) {
    try {
      const searchResponse = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${searchKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `${query} site oficial tabela manutenção programada km horas anos óleo recomendado viscosidade SAE API`,
          search_depth: "basic", topic: "general", max_results: 5,
          include_raw_content: true, include_answer: false,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        const candidates = (searchData.results ?? []).filter((result: Record<string, unknown>) => {
          if (typeof result.url !== "string" || !String(result.url).startsWith("https://") ||
            !/manual|manuten|revis|service|maintenance|pdf/i.test(`${result.title ?? ""} ${result.content ?? ""} ${result.url}`)) return false;
          try {
            const host = new URL(String(result.url)).hostname.toLowerCase();
            return allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
          } catch { return false; }
        });
        const tasks: Record<string, unknown>[] = [];
        let recommendedOil = "";
        const sources = candidates.map((result: Record<string, unknown>) => {
          let host = "";
          try { host = new URL(String(result.url)).hostname.toLowerCase(); } catch { return null; }
          const official = allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
          const raw = String(result.raw_content ?? result.content ?? "");
          const oilLine = raw.split(/\n+/).map((line) => line.trim()).find((line) =>
            /(?:óleo|oleo|lubrificante|engine oil)/i.test(line) && /\b\d{1,2}W[- ]?\d{2}\b/i.test(line) && /\b(?:API|ACEA|JASO)\b/i.test(line));
          if (!recommendedOil && oilLine) recommendedOil = oilLine.slice(0, 240);
          const excerpts = official ? raw.split(/(?<=[.!?])\s+|\n+/).map((line) => line.trim()).filter((line) =>
            line.length > 30 && line.length < 320 && /(?:manuten|revis|trocar|substitu|verificar|inspecionar|filtro|óleo|oleo|pneu|freio|suspens|inje[cç][aã]o|maintenance|service|replace|inspect|filter)/i.test(line) && /\d[\d., ]*\s*(?:km|quil[oô]metro|hours?|h(?:oras?)?\b|mes(?:es)?|months?|ano(?:s)?|years?)/i.test(line)) : [];
          for (const excerpt of excerpts.slice(0, 20)) {
            const kmMatch = excerpt.match(/(\d[\d., ]*)\s*(?:km|quil[oô]metros?)/i);
            const hourMatch = excerpt.match(/(\d[\d., ]*)\s*(?:hours?|horas?(?: de motor)?|h\b)/i);
            const monthMatch = excerpt.match(/(\d+)\s*(?:mes(?:es)?|months?)/i);
            const yearMatch = excerpt.match(/(\d+)\s*(?:anos?|years?)/i);
            const number = (value: string | undefined) => value ? Number(value.replace(/[., ]/g, "")) : undefined;
            const km = number(kmMatch?.[1]); const hours = number(hourMatch?.[1]); const months = number(monthMatch?.[1]); const years = number(yearMatch?.[1]);
            if (!km && !hours && !months && !years) continue;
            const component = /pneu|tire/i.test(excerpt) ? "pneus"
              : /óleo|oleo|lubrificante|oil|filtro/i.test(excerpt) ? "oleo_filtros"
              : /freio|brake/i.test(excerpt) ? "freios"
              : /suspens|amortecedor/i.test(excerpt) ? "suspensao"
              : /inje[cç][aã]o|bico|injector/i.test(excerpt) ? "injecao_bicos" : "outro";
            const id = `${excerpt.slice(0, 80)}-${km ?? ""}-${hours ?? ""}-${months ?? ""}-${years ?? ""}`;
            if (!tasks.some((task) => task.id === id)) tasks.push({ id, description: excerpt, interval_km: km, interval_hours: hours, interval_months: months, interval_years: years, component, source_url: result.url });
          }
          if (!official) return null;
          return { title: String(result.title ?? "Manual / página de manutenção"), url: String(result.url), excerpt: "", official };
        }).filter((source): source is {title:string;url:string;excerpt:string;official:boolean} => source !== null);
        const officialSources = sources.filter((source) => source.official);
        if (officialSources.length) return {
          found: true, title: `Fontes encontradas para ${brand} ${model}`,
          source_label: "Abrir fonte oficial", source_url: officialSources[0].url,
          note: tasks.length ? "Intervalos extraídos dos trechos retornados pela busca. Confira o manual da versão exata antes de executar o serviço." : "Fontes encontradas, mas os resultados não trouxeram intervalos legíveis. Abra o manual para confirmar a tabela.",
          severe_use: Number(vehicle.urban_highway_score ?? 3) <= 2 || vehicle.operation_type === "entrega_porta_a_porta",
          tasks: tasks.slice(0, 20), sources: officialSources, recommended_oil: recommendedOil || undefined,
        };
      }
    } catch { /* A busca pode falhar; mantém a consulta manual por link. */ }
  }

  const isDailyEuro6 = /iveco/i.test(brand) && /daily/i.test(model) && /(?:euro\s*6|\be6\b)/i.test(engine);
  if (!isDailyEuro6) {
    return {
      found: false,
      title: searchKey ? "Busca indisponível para este veículo" : "Pesquisa automática ainda não conectada",
      source_url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      source_label: "Buscar manual na internet",
      note: searchKey ? "A busca externa falhou. Use a pesquisa como alternativa e tente novamente depois." : "A busca automática para qualquer marca precisa da chave TAVILY_API_KEY como segredo da Edge Function no Supabase.",
      tasks: [],
    };
  }

  const tasks = [
    { id: "daily_oil", description: "Trocar óleo do motor e filtro", interval_km: 30000, interval_hours: 1200, interval_years: 1, low_km_only: true, component: "oleo_filtros" },
    { id: "daily_air_filter", description: "Substituir filtro de ar do motor", interval_km: 30000, component: "oleo_filtros" },
    { id: "daily_diesel_filter", description: "Substituir filtro de diesel", interval_km: 30000, interval_years: 1, low_km_only: true, component: "oleo_filtros" },
    { id: "daily_inspection", description: "Inspecionar freios, direção, vazamentos, fixações e suspensão", interval_km: 30000, component: "suspensao" },
    { id: "daily_aux_belt", description: "Substituir correias auxiliares e do ar-condicionado (se equipado)", interval_km: 60000, component: "outro" },
    { id: "daily_diff_oil", description: "Trocar óleo do diferencial e verificar respiro", interval_km: 90000, component: "outro" },
    { id: "daily_blowby", description: "Substituir filtro blow-by", interval_km: 90000, component: "outro" },
    { id: "daily_belt_tensioner", description: "Substituir tensores automáticos da correia Poly-V", interval_km: 120000, component: "outro" },
    { id: "daily_himatic_oil", description: "Trocar óleo e filtro da transmissão Hi-Matic", interval_km: 200000, component: "outro", applicability: "Somente transmissão automática Hi-Matic" },
    { id: "daily_timing_chain", description: "Substituir corrente, tensores e engrenagens de distribuição", interval_km: 240000, component: "outro" },
    { id: "daily_brake_fluid", description: "Substituir fluido de freio", interval_years: 2, component: "freios" },
    { id: "daily_cabin_filter", description: "Substituir filtro antipólen do ar-condicionado", interval_years: 2, component: "outro" },
    { id: "daily_coolant", description: "Substituir líquido de arrefecimento", interval_years: 5, component: "outro" },
  ];
  return {
    found: true,
    title: "IVECO Daily Euro 6 — Manual de Uso e Manutenção, edição 01",
    source_label: "Manual oficial IVECO Brasil (PDF)",
    source_url: "https://iveco.com.br/manuais/assets/files/daily/manutencao/Manual_Uso_Manutencao_DAILY_E6_Ed01_PN_5803345473.pdf",
    severe_use: Number(vehicle.urban_highway_score ?? 3) <= 2 || vehicle.operation_type === "entrega_porta_a_porta",
    note: "O manual pede antecipação quando o aviso de óleo acende e classifica entregas porta a porta, marcha lenta e baixa velocidade como uso severo. Confirme transmissão, versão e aplicabilidade dos itens no manual.",
    tasks,
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
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!url || !anon || !secret) return json({ error: "Configuração ausente" }, 500);
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

  let input: { table?: string; action?: string; id?: string; active?: boolean; vehicle_id?: string; system_code?: string; route_id?: string; mode?: string; route_km?: number; rule_answers?: Record<string, unknown>; search?: string; month?: string; data?: Record<string, unknown>; limit?: number; offset?: number };
  try { input = await request.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  if (!input.action || !["summary", "finance_summary", "maintenance_rules", "vehicle_cpk_profiles", "save_vehicle_cpk_profile", "delete_vehicle_cpk_profile", "maintenance_forecast", "maintenance_finance_indicators", "list", "resource_page", "create", "update", "set_active", "deactivate", "delete"].includes(input.action)) {
    return json({ error: "Operação inválida" }, 400);
  }
  if (!["summary", "finance_summary", "maintenance_rules", "vehicle_cpk_profiles", "save_vehicle_cpk_profile", "delete_vehicle_cpk_profile", "maintenance_forecast", "maintenance_finance_indicators"].includes(input.action) && (!input.table || !tables.has(input.table))) return json({ error: "Tabela inválida" }, 400);
  if (["update", "set_active", "deactivate", "delete"].includes(input.action) && !input.id) return json({ error: "ID obrigatório" }, 400);

  const auth = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const [{ data: { user }, error: authError }, { data: profile, error: profileError }] = await Promise.all([
    auth.auth.getUser(),
    auth.rpc("get_my_access").maybeSingle(),
  ]);
  if (authError || !user) return json({ error: "Sessão inválida" }, 401);
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  if (profileError) return json({ error: "Falha ao validar usuário" }, 500);
  if (!profile || !["admin", "gestor"].includes(profile.role)) return json({ error: "Acesso negado" }, 403);
  if (profile.status !== "active" || (profile.access_until && Date.parse(profile.access_until) <= Date.now())) {
    return json({ error: "Acesso da empresa bloqueado" }, 403);
  }

  const rate = input.action === "maintenance_forecast"
    ? { bucket: "maintenance_forecast", limit: 20, window: 3600 }
    : ["create", "update", "set_active", "deactivate", "delete", "save_vehicle_cpk_profile", "delete_vehicle_cpk_profile"].includes(input.action)
    ? { bucket: "write", limit: 60, window: 60 }
    : { bucket: "read", limit: 120, window: 60 };
  let rateLimit: RateLimitResult | null;
  try {
    rateLimit = await consumeRedisRateLimit((name) => Deno.env.get(name), {
      tenantId: profile.tenant_id, userId: user.id, ...rate,
    });
  } catch {
    // Do not switch counters during an outage: that would grant a second quota.
    console.error("Redis rate limiter unavailable");
    return new Response(JSON.stringify({ error: "Controle de uso temporariamente indisponível. Tente novamente em instantes." }), {
      status: 503, headers: { ...cors, "Content-Type": "application/json", "Retry-After": "5" },
    });
  }
  if (!rateLimit) {
    const { data, error: rateError } = await db.rpc("consume_api_rate_limit", {
    p_tenant_id: profile.tenant_id,
    p_user_id: user.id,
    p_bucket: rate.bucket,
    p_limit: rate.limit,
    p_window_seconds: rate.window,
  }).maybeSingle();
    if (rateError || !data) return json({ error: "Não foi possível validar o limite de uso." }, 500);
    rateLimit = data;
  }
  if (!rateLimit) return json({ error: "Não foi possível validar o limite de uso." }, 500);
  if (!rateLimit.allowed) {
    return new Response(JSON.stringify({ error: "Limite temporário de solicitações atingido. Tente novamente em instantes." }), {
      status: 429,
      headers: { ...cors, "Content-Type": "application/json", "Retry-After": String(rateLimit.retry_after_seconds) },
    });
  }

  if (input.action === "maintenance_rules") {
    const [{ data: systems, error: systemsError }, { data: categoryRules, error: categoryRulesError }, { data: questions, error: questionsError }] = await Promise.all([
      db.from("maintenance_system_rules").select("system_code,name,base_life_km,replacement_cost,formula_adjusted_life,formula_cpk,formula_route_cost,basis_note,is_active").eq("is_active", true).order("name"),
      db.from("maintenance_category_system_rules").select("system_code,vehicle_category,base_life_km,replacement_cost,formula_adjusted_life,formula_cpk,formula_route_cost,basis_note,is_active").eq("is_active", true),
      db.from("maintenance_rule_questions").select("id,system_code,answer_key,question,answer_type,options,required,display_order,is_active").eq("is_active", true).order("display_order").order("question"),
    ]);
    if (systemsError || categoryRulesError || questionsError) return json({ error: "Não foi possível carregar as regras de manutenção." }, 500);
    return json({ data: { systems: systems ?? [], category_rules: categoryRules ?? [], questions: questions ?? [] } });
  }

  if (["vehicle_cpk_profiles", "save_vehicle_cpk_profile", "delete_vehicle_cpk_profile"].includes(input.action)) {
    if (!input.vehicle_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.vehicle_id)) {
      return json({ error: "Selecione um veículo válido." }, 400);
    }
    const { data: vehicle, error: vehicleError } = await db.from("vehicles")
      .select("id,brand,model,plate,vehicle_category").eq("tenant_id", profile.tenant_id)
      .eq("id", input.vehicle_id).maybeSingle();
    if (vehicleError) return json({ error: "Não foi possível carregar o veículo." }, 500);
    if (!vehicle) return json({ error: "Veículo não encontrado." }, 404);
    if (!vehicle.vehicle_category) return json({ error: "Defina a categoria do veículo antes de configurar o CPK." }, 400);

    if (input.action === "delete_vehicle_cpk_profile") {
      const profileId = input.profile_id;
      if (typeof profileId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileId)) return json({ error: "Item inválido." }, 400);
      const { data: deleted, error: deleteError } = await db.from("vehicle_cpk_profiles").delete()
        .eq("id", profileId).eq("tenant_id", profile.tenant_id).eq("vehicle_id", vehicle.id).select("id").maybeSingle();
      if (deleteError) return json({ error: "Não foi possível excluir o item." }, 400);
      if (!deleted) return json({ error: "O item não existe mais para este veículo." }, 404);
      return json({ data: { deleted: true } });
    }

    if (input.action === "save_vehicle_cpk_profile") {
      if (!input.system_code || !/^[a-z][a-z0-9_]{1,49}$/.test(input.system_code)) return json({ error: "Sistema inválido." }, 400);
      const { data: categoryRule, error: categoryRuleError } = await db.from("maintenance_category_system_rules")
        .select("system_code").eq("vehicle_category", vehicle.vehicle_category).eq("system_code", input.system_code)
        .eq("is_active", true).maybeSingle();
      if (categoryRuleError) return json({ error: "Não foi possível confirmar a regra desta categoria." }, 500);
      if (!categoryRule) return json({ error: "Este sistema não está ativo para a categoria do veículo." }, 400);
      const payload = input.data ?? {};
      const componentName = typeof payload.component_name === "string" ? payload.component_name.trim() : "";
      if (!componentName || componentName.length > 120) return json({ error: "Informe o nome do item, com até 120 caracteres." }, 400);
      const reference = payload.component_reference;
      if (reference !== null && reference !== undefined && (typeof reference !== "string" || reference.trim().length > 120)) {
        return json({ error: "A descrição do modelo deve ter até 120 caracteres." }, 400);
      }
      const parsePositive = (value: unknown, label: string): number | null | string => {
        if (value === null || value === undefined || value === "") return null;
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0) return `${label} deve ser maior que zero.`;
        return number;
      };
      const baseLifeKm = parsePositive(payload.base_life_km, "A vida útil");
      if (typeof baseLifeKm === "string") return json({ error: baseLifeKm }, 400);
      const replacementCost = parsePositive(payload.replacement_cost, "O custo de troca");
      if (typeof replacementCost === "string") return json({ error: replacementCost }, 400);
      const values = {
        tenant_id: profile.tenant_id, vehicle_id: vehicle.id, system_code: input.system_code,
        component_name: componentName,
        component_reference: typeof reference === "string" ? reference.trim() || null : null,
        base_life_km: baseLifeKm, replacement_cost: replacementCost,
        source_catalog_profile_id: null, updated_at: new Date().toISOString(),
      };
      const profileId = typeof input.profile_id === "string" ? input.profile_id : null;
      let saveQuery = profileId
        ? db.from("vehicle_cpk_profiles").update(values).eq("id", profileId).eq("tenant_id", profile.tenant_id).eq("vehicle_id", vehicle.id)
        : db.from("vehicle_cpk_profiles").insert(values);
      const { data: saved, error: saveError } = await saveQuery.select("id,system_code,component_name,component_reference,base_life_km,replacement_cost,updated_at").maybeSingle();
      if (saveError) return json({ error: "Não foi possível salvar os valores específicos deste veículo." }, 400);
      if (!saved) return json({ error: "O item não existe mais para este veículo. Atualize a tela e tente novamente." }, 404);
      return json({ data: saved });
    }

    const [systemsResult, rulesResult, profilesResult] = await Promise.all([
      db.from("maintenance_system_rules").select("system_code,name").eq("is_active", true),
      db.from("maintenance_category_system_rules").select("system_code,vehicle_category,base_life_km,replacement_cost,is_active").eq("vehicle_category", vehicle.vehicle_category).eq("is_active", true),
      db.from("vehicle_cpk_profiles").select("id,system_code,component_name,component_reference,base_life_km,replacement_cost,updated_at").eq("tenant_id", profile.tenant_id).eq("vehicle_id", vehicle.id),
    ]);
    if (systemsResult.error || rulesResult.error || profilesResult.error) return json({ error: "Não foi possível carregar os valores CPK deste veículo." }, 500);
    const systemNames = new Map((systemsResult.data ?? []).map((system) => [system.system_code, system.name]));
    const rules = (rulesResult.data ?? []).filter((rule) => systemNames.has(rule.system_code)).map((rule) => ({
      ...rule, name: systemNames.get(rule.system_code) ?? rule.system_code,
    }));
    const systems = applyVehicleCpkProfiles(rules, profilesResult.data ?? [], systemNames);
    return json({ data: { vehicle, systems } });
  }

  if (input.action === "summary") {
    const { data, error } = await db.rpc("get_tenant_app_summary", {
      p_tenant_id: profile.tenant_id, p_month_start: null, p_month_end: null,
    });
    if (error || !data) return json({ error: "Não foi possível calcular o painel." }, 500);
    return json({ data: { counts: data.counts, insights: data.insights } });
  }

  if (input.action === "finance_summary") {
    const month = input.month ?? new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return json({ error: "Mês inválido." }, 400);
    const [year, monthNumber] = month.split("-").map(Number);
    const { data, error } = await db.rpc("get_tenant_app_summary", {
      p_tenant_id: profile.tenant_id,
      p_month_start: new Date(Date.UTC(year, monthNumber - 1, 1)).toISOString().slice(0, 10),
      p_month_end: new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10),
    });
    if (error || !data) return json({ error: "Não foi possível calcular o resumo financeiro." }, 500);
    return json({ data: data.month_finance });
  }

  if (input.action === "maintenance_finance_indicators") {
    try {
      const [vehiclesResult, systemsResult, categoryRulesResult, questionsResult, vehicleProfilesResult] = await Promise.all([
        db.from("vehicles").select("id,model,plate,vehicle_category").eq("tenant_id", profile.tenant_id).eq("status", true),
        db.from("maintenance_system_rules").select("system_code,name,base_life_km,replacement_cost,formula_adjusted_life,formula_cpk,formula_route_cost,basis_note,is_active").eq("is_active", true),
        db.from("maintenance_category_system_rules").select("system_code,vehicle_category,base_life_km,replacement_cost,formula_adjusted_life,formula_cpk,formula_route_cost,basis_note,is_active").eq("is_active", true),
        db.from("maintenance_rule_questions").select("id,system_code,answer_key,question,answer_type,options,required,display_order,is_active").eq("is_active", true).order("display_order").order("question"),
        db.from("vehicle_cpk_profiles").select("id,vehicle_id,system_code,component_name,component_reference,base_life_km,replacement_cost").eq("tenant_id", profile.tenant_id),
      ]);
      if (vehiclesResult.error || systemsResult.error || categoryRulesResult.error || questionsResult.error || vehicleProfilesResult.error) throw new Error("Falha ao carregar indicadores.");
      const vehicles = vehiclesResult.data ?? [];
      const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
      const systemNames = new Map((systemsResult.data ?? []).map((system) => [system.system_code, system.name]));
      const categoryRules = categoryRulesResult.data ?? [];
      const questions = questionsResult.data ?? [];
      const vehicleProfiles = new Map<string, Record<string, unknown>[]>();
      for (const item of vehicleProfilesResult.data ?? []) {
        const key = String(item.vehicle_id);
        vehicleProfiles.set(key, [...(vehicleProfiles.get(key) ?? []), item]);
      }
      const routes: Record<string, unknown>[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data: page, error } = await db.from("routes")
          .select("id,vehicle_id,km_total,occurrence_count,maintenance_answers,status")
          .eq("tenant_id", profile.tenant_id).in("status", ["concluida", "em_andamento"])
          .not("vehicle_id", "is", null).order("created_at", { ascending: false }).range(offset, offset + 999);
        if (error) throw new Error("Falha ao carregar rotas.");
        routes.push(...(page ?? []));
        if ((page?.length ?? 0) < 1000) break;
      }
      const vehicleTotals = new Map<string, { vehicle_id: string; model: string; plate: string; vehicle_category: string; route_count: number; route_km: number; maintenance_cost: number; cpk: number }>();
      const systemTotals = new Map<string, { vehicle_id: string; model: string; plate: string; vehicle_category: string; profile_id: string | null; system_code: string; name: string; component_name: string; component_reference: string | null; calculated_route_count: number; route_km: number; maintenance_cost: number; cpk: number }>();
      let routeCount = 0;
      let routeKm = 0;
      let totalCost = 0;
      let systemsCalculated = 0;
      for (const route of routes) {
        const vehicle = vehicleById.get(String(route.vehicle_id));
        const occurrences = Math.max(1, Number(route.occurrence_count ?? 1));
        const distance = Number(route.km_total) * occurrences;
        if (!vehicle?.vehicle_category || !Number.isFinite(distance) || distance <= 0) continue;
        const applicableRules = categoryRules.filter((rule) => rule.vehicle_category === vehicle.vehicle_category && systemNames.has(rule.system_code));
        const applicable = applyVehicleCpkProfiles(applicableRules, vehicleProfiles.get(vehicle.id) ?? [], systemNames);
        const answers = route.maintenance_answers && typeof route.maintenance_answers === "object" ? route.maintenance_answers as Record<string, unknown> : {};
        const calculations = calculateRuleResults(applicable, questions, answers, distance)
          .filter((item) => item.cpk !== null && item.route_cost !== null);
        if (!calculations.length) continue;
        let routeCost = 0;
        for (const calculation of calculations) {
          const componentKey = calculation.profile_id ?? `default:${calculation.system_code}`;
          const systemKey = `${vehicle.id}:${componentKey}`;
          const system = systemTotals.get(systemKey) ?? { vehicle_id: vehicle.id, model: vehicle.model, plate: vehicle.plate, vehicle_category: vehicle.vehicle_category, profile_id: calculation.profile_id, system_code: calculation.system_code, name: calculation.name, component_name: calculation.component_name, component_reference: calculation.component_reference, calculated_route_count: 0, route_km: 0, maintenance_cost: 0, cpk: 0 };
          system.calculated_route_count += occurrences;
          system.route_km += distance;
          system.maintenance_cost += Number(calculation.route_cost);
          system.cpk = system.route_km > 0 ? system.maintenance_cost / system.route_km : 0;
          systemTotals.set(systemKey, system);
          routeCost += Number(calculation.route_cost);
          systemsCalculated += occurrences;
        }
        const currentVehicle = vehicleTotals.get(vehicle.id) ?? { vehicle_id: vehicle.id, model: vehicle.model, plate: vehicle.plate, vehicle_category: vehicle.vehicle_category, route_count: 0, route_km: 0, maintenance_cost: 0, cpk: 0 };
        currentVehicle.route_count += occurrences;
        currentVehicle.route_km += distance;
        currentVehicle.maintenance_cost += routeCost;
        currentVehicle.cpk = currentVehicle.route_km > 0 ? currentVehicle.maintenance_cost / currentVehicle.route_km : 0;
        vehicleTotals.set(vehicle.id, currentVehicle);
        routeCount += occurrences;
        routeKm += distance;
        totalCost += routeCost;
      }
      return json({ data: { route_count: routeCount, vehicle_count: vehicleTotals.size, route_km: routeKm, total_cost: totalCost, systems_calculated: systemsCalculated, by_vehicle: [...vehicleTotals.values()].sort((a, b) => b.maintenance_cost - a.maintenance_cost), by_system: [...systemTotals.values()].sort((a, b) => a.model.localeCompare(b.model) || a.plate.localeCompare(b.plate) || b.maintenance_cost - a.maintenance_cost) } });
    } catch {
      return json({ error: "Não foi possível calcular os indicadores de manutenção das rotas." }, 500);
    }
  }

  if (input.action === "maintenance_forecast") {
    if (!input.vehicle_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.vehicle_id)) {
      return json({ error: "Selecione um veículo válido para calcular as previsões." }, 400);
    }
    const { data: vehicle, error: vehicleError } = await db.from("vehicles")
      .select("id,brand,model,plate,year,km_aquisicao,km_atual,vehicle_category,operation_type,service_description,starts_per_day,operating_days_per_week,average_daily_km,engine_version,engine_hours_per_day,start_cycles_total,urban_highway_score,maintenance_history")
      .eq("tenant_id", profile.tenant_id).eq("id", input.vehicle_id).maybeSingle();
    if (vehicleError) return json({ error: "Não foi possível carregar o veículo." }, 500);
    if (!vehicle) return json({ error: "Veículo não encontrado." }, 404);
    if (!vehicle.vehicle_category) return json({ error: "Edite o cadastro deste veículo e selecione a categoria para calcular o CPK correto." }, 400);
    const mode = input.mode === "vehicle" ? "vehicle" : input.mode === "route" ? "route" : null;
    if (!mode) return json({ error: "Selecione se deseja calcular por rota ou veículo." }, 400);

    try {
      const [systemsResult, categoryRulesResult, questionsResult, vehicleProfilesResult] = await Promise.all([
        db.from("maintenance_system_rules").select("system_code,name,base_life_km,replacement_cost,formula_adjusted_life,formula_cpk,formula_route_cost,basis_note,is_active").eq("is_active", true).order("name"),
        db.from("maintenance_category_system_rules").select("system_code,vehicle_category,base_life_km,replacement_cost,formula_adjusted_life,formula_cpk,formula_route_cost,basis_note,is_active").eq("vehicle_category", vehicle.vehicle_category).eq("is_active", true),
        db.from("maintenance_rule_questions").select("id,system_code,answer_key,question,answer_type,options,required,display_order,is_active").eq("is_active", true).order("display_order").order("question"),
        db.from("vehicle_cpk_profiles").select("id,system_code,component_name,component_reference,base_life_km,replacement_cost").eq("tenant_id", profile.tenant_id).eq("vehicle_id", vehicle.id),
      ]);
      if (systemsResult.error || categoryRulesResult.error || questionsResult.error || vehicleProfilesResult.error) throw new Error("Falha ao carregar regras globais.");
      const systems = systemsResult.data ?? [];
      const systemNames = new Map(systems.map((system) => [system.system_code, system.name]));
      const categoryRules = (categoryRulesResult.data ?? []).map((rule) => ({
        ...rule, name: systemNames.get(rule.system_code) ?? rule.system_code,
      }));
      const questions = questionsResult.data ?? [];
      const applicableSystems = applyVehicleCpkProfiles(categoryRules.filter((rule) => systemNames.has(rule.system_code)), vehicleProfilesResult.data ?? [], systemNames);
      const allRoutes: Record<string, unknown>[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data: routePage, error: routeError } = await db.from("routes")
          .select("id,km_total,occurrence_count,maintenance_answers,status,created_at,start_time,vehicle_id,client_id")
          .eq("tenant_id", profile.tenant_id).eq("vehicle_id", vehicle.id)
          .order("created_at", { ascending: false }).range(offset, offset + 999);
        if (routeError) throw new Error("Falha ao carregar rotas.");
        allRoutes.push(...(routePage ?? []));
        if ((routePage?.length ?? 0) < 1000) break;
      }
      let selectedRoutes = allRoutes;
      if (mode === "route") {
        if (!input.route_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(input.route_id))) return json({ error: "Selecione uma rota válida." }, 400);
        selectedRoutes = allRoutes.filter((route) => route.id === input.route_id);
        if (!selectedRoutes.length) return json({ error: "Rota não encontrada para este veículo." }, 404);
      }
      if (!selectedRoutes.length) return json({ error: mode === "route" ? "Este veículo não possui rotas cadastradas." : "Cadastre rotas para calcular o CPK do veículo." }, 400);
      const routeCalculations = selectedRoutes.map((route) => {
        const routeKm = Number(route.km_total) * Math.max(1, Number(route.occurrence_count ?? 1));
        if (!Number.isFinite(routeKm) || routeKm <= 0) throw new Error("Cada rota precisa ter uma distância maior que zero.");
        const answers = route.maintenance_answers && typeof route.maintenance_answers === "object" ? route.maintenance_answers as Record<string, unknown> : {};
        return { route, routeKm, calculations: calculateRuleResults(applicableSystems, questions, answers, routeKm) };
      });
      const totalKm = routeCalculations.reduce((sum, item) => sum + item.routeKm, 0);
      const ruleCalculations = mode === "route" ? routeCalculations[0].calculations : applicableSystems.map((system) => {
        const calculations = routeCalculations.map((item) => item.calculations.find((result) => result.profile_id === (system.profile_id ?? null) && result.system_code === system.system_code)!);
        const missing = [...new Set(calculations.flatMap((result) => result.missing_questions))];
        const calculated = calculations.map((result, index) => ({ result, routeKm: routeCalculations[index].routeKm }))
          .filter(({ result }) => result.route_cost !== null && result.cpk !== null);
        const calculatedKm = calculated.reduce((sum, item) => sum + item.routeKm, 0);
        const routeCost = calculated.length ? calculated.reduce((sum, item) => sum + Number(item.result.route_cost), 0) : null;
        const cpk = routeCost !== null && calculatedKm > 0 ? routeCost / calculatedKm : null;
        const adjustedLife = calculated.length && calculated.every(({ result }) => result.adjusted_life_km !== null)
          ? calculatedKm / calculated.reduce((sum, item) => sum + item.routeKm / Number(item.result.adjusted_life_km), 0)
          : null;
        const factor = calculatedKm > 0 ? calculated.reduce((sum, item) => sum + item.result.factor_product * item.routeKm, 0) / calculatedKm : calculations[0].factor_product;
        return { ...calculations[0], factor_product: factor, adjusted_life_km: adjustedLife, cpk, route_cost: routeCost, missing_questions: calculated.length ? [] : missing, formula_error: calculated.length ? null : calculations.find((result) => result.formula_error)?.formula_error ?? null, calculated_route_count: calculated.length, total_route_count: calculations.length };
      });
      return json({ data: { vehicle, routes: selectedRoutes, route_count: selectedRoutes.reduce((sum, route) => sum + Math.max(1, Number(route.occurrence_count ?? 1)), 0), mode, maintenances: [], manual: { found: false, title: "", source_url: "", source_label: "", note: "", tasks: [] }, rules: { systems, category_rules: categoryRules, questions }, route_km: totalKm, rule_calculations: ruleCalculations } });
    } catch {
      return json({ error: "Não foi possível carregar os dados de previsão." }, 500);
    }
  }

  const table = input.table!;
  let query = db.from(table);
  if (input.action === "list" || input.action === "resource_page") {
    const listColumns: Record<string, string> = {
      vehicles: "id,tenant_id,brand,model,plate,year,color,fuel_type,fuel_efficiencies,payload_capacity_kg,km_atual,status,vehicle_category,operation_type,urban_highway_score,starts_per_day,operating_days_per_week,average_daily_km,engine_version,engine_hours_per_day,start_cycles_total,created_at",
      drivers: "id,tenant_id,name,document,pay_per_day,status,created_at",
      clients: "id,tenant_id,name,contact,status,created_at",
      routes: "id,tenant_id,km_total,fuel_cost,maintenance_cost,driver_cost,other_costs,price_charged,start_time,end_time,status,created_at,driver_id,vehicle_id,client_id,stop_count,route_periodicity,other_frequency_count,occurrence_count,payload_weight_kg,duration_minutes,fuel_type_used,fuel_unit_price,route_urban_highway_score",
      maintenances: "id,tenant_id,vehicle_id,component,service,parts,cost,local,km_at_service,start_cycles_at_service,km_agendado,date_service,next_date,created_at",
      finances: "*",
    };
    const searchColumns: Record<string, string[]> = {
      vehicles: ["brand", "model", "plate"], drivers: ["name", "document"], clients: ["name", "contact"],
      routes: ["status"], maintenances: ["service", "local"], finances: ["description", "type"],
    };
    const loadList = async (listTable: string, options: { limit: number; offset?: number; id?: string; search?: string; month?: string }) => {
      const limit = Math.min(Math.max(options.limit, 1), 200);
      const offset = Math.max(options.offset ?? 0, 0);
      let listing = db.from(listTable).select(options.id ? "*" : listColumns[listTable])
        .eq("tenant_id", profile.tenant_id).order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(offset, offset + limit);
      if (options.id) listing = listing.eq("id", options.id);
      if (options.search?.trim() && searchColumns[listTable]) {
        const term = options.search.trim().replace(/[,%().*]/g, "").slice(0, 100);
        if (term) listing = listing.or(searchColumns[listTable].map((column) => `${column}.ilike.%${term}%`).join(","));
      }
      if (listTable === "finances" && options.month) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(options.month)) throw new Error("Mês inválido.");
        const [year, month] = options.month.split("-").map(Number);
        listing = listing.gte("created_at", new Date(Date.UTC(year, month - 1, 1)).toISOString())
          .lt("created_at", new Date(Date.UTC(year, month, 1)).toISOString());
      }
      const { data, error } = await listing;
      if (error) throw error;
      const page = data ?? [];
      return { rows: page.slice(0, limit), has_more: page.length > limit };
    };
    try {
      const page = await loadList(table, {
        limit: input.limit ?? 50, offset: input.offset, id: input.id, search: input.search,
        month: table === "finances" ? input.month : undefined,
      });
      if (input.action === "list") return json({ data: page.rows, has_more: page.has_more });

      const referencesForTable: Record<string, string[]> = {
        routes: ["vehicles", "drivers", "clients"],
        maintenances: ["vehicles"],
        finances: ["vehicles", "routes", "maintenances"],
      };
      const [referenceLists, financeSummary] = await Promise.all([
        Promise.all((referencesForTable[table] ?? []).map(async (name) => [name, await loadList(name, { limit: 200 })] as const)),
        table === "finances" ? (async () => {
          const month = input.month ?? new Date().toISOString().slice(0, 7);
          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Mês inválido.");
          const [year, monthNumber] = month.split("-").map(Number);
          const { data, error } = await db.rpc("get_tenant_app_summary", {
            p_tenant_id: profile.tenant_id,
            p_month_start: new Date(Date.UTC(year, monthNumber - 1, 1)).toISOString().slice(0, 10),
            p_month_end: new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10),
          });
          if (error || !data) throw new Error("Não foi possível calcular o resumo financeiro.");
          return data.month_finance;
        })() : Promise.resolve(null),
      ]);
      return json({ data: {
        rows: page.rows,
        references: Object.fromEntries(referenceLists.map(([name, list]) => [name, list.rows])),
        month_totals: financeSummary,
      }, has_more: page.has_more });
    } catch (error) {
      return json({ error: error instanceof Error && error.message === "Mês inválido." ? error.message : "Falha ao consultar registros" }, 400);
    }
  }
  if (input.action === "create") {
    const inputData = input.data ?? {};
    const unknown = Object.keys(inputData).find((key) => !writableColumns[table].has(key));
    if (unknown) return json({ error: `Campo não permitido: ${unknown}.` }, 400);
    let payload: Record<string, unknown> = { ...inputData, tenant_id: profile.tenant_id };
    if (table === "routes" && payload.route_periodicity == null) payload.route_periodicity = "esporadica";
    const validation = validateRecord(table, payload, true);
    if (validation) return json({ error: validation }, 400);
    if (table === "routes") {
      const referenceError = await validateActiveRouteReferences(db, profile.tenant_id, payload);
      if (referenceError) return json({ error: referenceError }, 400);
      try { payload = await calculateRouteCosts(db, profile.tenant_id, payload); }
      catch (error) { return json({ error: error instanceof Error ? error.message : "Não foi possível calcular os custos da rota." }, 400); }
    }
    const { data: inserted, error } = await query.insert(payload).select().single();
    if (error) return json({ error: error.code === "23505" ? "Esse registro já existe." : error.code === "23503" ? "Confira os vínculos selecionados; eles precisam pertencer à sua empresa." : "Não foi possível salvar. Confira os campos e tente novamente." }, 400);
    return json({ data: inserted }, 201);
  }
  if (input.action === "set_active" || input.action === "deactivate") {
    if (!deactivatableTables.has(table)) return json({ error: "Ativação disponível para veículos, motoristas e clientes." }, 400);
    const active = input.action === "deactivate" ? false : input.active;
    if (typeof active !== "boolean") return json({ error: "Informe o estado ativo como verdadeiro ou falso." }, 400);
    const { data, error } = await query.update({ status: active }).eq("tenant_id", profile.tenant_id).eq("id", input.id).select().single();
    if (error) return json({ error: "Não foi possível alterar a situação do cadastro." }, 400);
    return json({ data });
  }
  if (input.action === "update") {
    const payload = { ...(input.data ?? {}) };
    const unknown = Object.keys(payload).find((key) => !writableColumns[table].has(key));
    if (unknown) return json({ error: `Campo não permitido: ${unknown}.` }, 400);
    const { data: current, error: currentError } = await query.select("*").eq("tenant_id", profile.tenant_id).eq("id", input.id).maybeSingle();
    if (currentError) return json({ error: "Não foi possível carregar o registro para edição." }, 400);
    if (!current) return json({ error: "Registro não encontrado." }, 404);
    if (table === "finances" && current.route_finance_category) return json({ error: "Este lançamento vem de uma rota. Edite a rota para ajustar os valores." }, 400);
    const validation = validateRecord(table, { ...current, ...payload }, false, Object.hasOwn(payload, "plate"));
    if (validation) return json({ error: validation }, 400);
    if (table === "routes") {
      const changedReferences = Object.fromEntries(["vehicle_id", "driver_id", "client_id"]
        .filter((key) => Object.hasOwn(payload, key) && String(payload[key] ?? "") !== String(current[key] ?? ""))
        .map((key) => [key, payload[key]]));
      const referenceError = await validateActiveRouteReferences(db, profile.tenant_id, changedReferences);
      if (referenceError) return json({ error: referenceError }, 400);
      try {
        const recalculated = await calculateRouteCosts(db, profile.tenant_id, { ...current, ...payload });
        for (const key of ["fuel_cost", "maintenance_cost", "duration_minutes", "occurrence_count"] as const) {
          if (Object.hasOwn(recalculated, key) && recalculated[key] !== current[key]) payload[key] = recalculated[key];
        }
      } catch (error) { return json({ error: error instanceof Error ? error.message : "Não foi possível recalcular os custos da rota." }, 400); }
    }
    const { data, error } = await query.update(payload).eq("tenant_id", profile.tenant_id).eq("id", input.id).select().single();
    if (error) return json({ error: error.code === "23503" ? "Confira os vínculos selecionados; eles precisam pertencer à sua empresa." : "Não foi possível atualizar. Confira os campos e tente novamente." }, 400);
    return json({ data });
  }
  if (table === "finances") {
    const { data: current, error: currentError } = await query.select("route_finance_category").eq("tenant_id", profile.tenant_id).eq("id", input.id).maybeSingle();
    if (currentError) return json({ error: "Não foi possível carregar o lançamento." }, 400);
    if (current?.route_finance_category) return json({ error: "Este lançamento vem de uma rota e não pode ser excluído separadamente." }, 400);
  }
  const { error } = await query.delete().eq("tenant_id", profile.tenant_id).eq("id", input.id);
  if (error) return json({ error: "Falha ao excluir registro" }, 400);
  return json({ success: true });
});
