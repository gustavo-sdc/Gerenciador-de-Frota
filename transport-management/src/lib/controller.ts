import supabase from "../supabase/supabase";

export interface VehicleData {
  id?: string;
  tenant_id: string;
  model: string;
  plate: string;
  year: number;
  color: string;
  id_plate: number;
  fuel_type: string;
  vehicle_category: VehicleCategory;
  km_aquisicao: number;
  km_atual: number;
  status: boolean;
}

type ApiResult<T> = { data?: T; count?: number; has_more?: boolean; success?: boolean; error?: Error };

async function callApi<T>(body: Record<string, unknown>): Promise<ApiResult<T>> {
  const { data, error } = await supabase.functions.invoke("api", { body });
  if (error) {
    let message = error.message;
    const context = (error as Error & { context?: Response }).context;
    if (context) {
      try {
        const responseBody = await context.clone().json();
        if (typeof responseBody?.error === "string") message = responseBody.error;
      } catch { /* Mantém a mensagem do Supabase se a resposta não for JSON. */ }
    }
    return { error: new Error(message) };
  }
  if (data?.error) return { error: new Error(data.error) };
  return data as ApiResult<T>;
}

export async function getObject<T = Record<string, unknown>>(
  _tenantId: string,
  tableName: string,
  options?: { search?: string; id?: string; limit?: number; offset?: number; month?: string }
) {
  return callApi<T[]>({ table: tableName, action: "list", ...options });
}

export async function getResourcePage<T = Record<string, unknown>>(
  tableName: string,
  options?: { search?: string; limit?: number; offset?: number; month?: string }
) {
  return callApi<{ rows: T[]; references: Record<string, Record<string, unknown>[]>; month_totals?: { income: number; expense: number } | null }>({
    table: tableName, action: "resource_page", ...options,
  });
}

export async function addObject(tableName: string, objectData: Record<string, unknown>) {
  return callApi({ table: tableName, action: "create", data: objectData });
}

export async function updateObject(tableName: string, objectId: string, objectData: Record<string, unknown>) {
  return callApi({ table: tableName, action: "update", id: objectId, data: objectData });
}

export async function deactiveObject(tableName: string, objectId: string) {
  return setObjectActive(tableName, objectId, false);
}

export async function setObjectActive(tableName: string, objectId: string, active: boolean) {
  return callApi({ table: tableName, action: "set_active", id: objectId, active });
}

export async function deleteObject(tableName: string, objectId: string) {
  return callApi({ table: tableName, action: "delete", id: objectId });
}

export async function getDashboardSummary() {
  return callApi<{counts: Record<string, number>; insights: {activeVehicles:number; pendingRoutes:number; dueMaintenances:number; financeNet:number; completedMargin:number}}>({ action: "summary" });
}

export async function getFinanceSummary(month: string) {
  return callApi<{income:number;expense:number}>({ action: "finance_summary", month });
}

export interface MaintenanceForecastData {
  vehicle: Record<string, unknown>;
  routes: Record<string, unknown>[];
  maintenances: Record<string, unknown>[];
  route_km: number;
  route_count?: number;
  mode?: "route" | "vehicle";
  rules: { systems: MaintenanceSystemRule[]; category_rules: (MaintenanceCategorySystemRule & { component_reference?: string | null })[]; questions: MaintenanceRuleQuestion[] };
  rule_calculations: MaintenanceRuleCalculation[];
  manual: {
    found: boolean;
    title: string;
    source_url: string;
    source_label: string;
    note: string;
    severe_use?: boolean;
    recommended_oil?: string;
    tasks: {id:string;description:string;interval_km?:number;interval_hours?:number;interval_months?:number;interval_years?:number;low_km_only?:boolean;component:string;applicability?:string;source_url?:string}[];
    sources?: {title:string;url:string;excerpt:string;official:boolean}[];
  };
}

export interface MaintenanceFinanceIndicators {
  route_count: number;
  vehicle_count: number;
  route_km: number;
  total_cost: number;
  systems_calculated: number;
  by_vehicle: { vehicle_id: string; model: string; plate: string; vehicle_category: VehicleCategory; route_count: number; route_km: number; maintenance_cost: number; cpk: number }[];
  by_system: { vehicle_id: string; model: string; plate: string; vehicle_category: VehicleCategory; profile_id: string | null; system_code: string; name: string; component_name: string; component_reference?: string | null; calculated_route_count: number; route_km: number; maintenance_cost: number; cpk: number }[];
}

export interface MaintenanceSystemRule {
  system_code: string; name: string; base_life_km: number | null; replacement_cost: number | null;
  formula_adjusted_life: string; formula_cpk: string; formula_route_cost: string; basis_note?: string | null; is_active: boolean;
}
export type VehicleCategory = "moto" | "carro_passeio" | "utilitario_medio" | "utilitario_grande" | "caminhao";
export const vehicleCategoryLabels: Record<VehicleCategory, string> = {
  moto: "Moto", carro_passeio: "Carro de passeio", utilitario_medio: "Utilitário médio",
  utilitario_grande: "Utilitário grande", caminhao: "Caminhão",
};
export interface MaintenanceCategorySystemRule extends Omit<MaintenanceSystemRule, "system_code" | "name"> {
  system_code: string; vehicle_category: VehicleCategory; name?: string;
}
export interface MaintenanceRuleQuestion {
  id: string; system_code: string; answer_key: string; question: string; answer_type: "select" | "number";
  options: { value?: string; label: string; multiplier: number; min?: number; max?: number }[];
  required: boolean; display_order: number; is_active: boolean;
}
export interface MaintenanceRuleCalculation {
  system_code: string; profile_id: string | null; component_name: string; name: string; vehicle_category: VehicleCategory; base_life_km: number | null; replacement_cost: number | null;
  component_reference?: string | null;
  factor_product: number; adjusted_life_km: number | null; cpk: number | null; route_cost: number | null;
  missing_questions: string[]; formula_error: string | null; basis_note?: string | null;
  calculated_route_count?: number; total_route_count?: number;
}

export interface VehicleCpkProfile {
  id: string | null; system_code: string; name: string; vehicle_category: VehicleCategory; component_name: string; component_reference: string | null;
  is_default?: boolean;
  base_life_km: number | null; replacement_cost: number | null; updated_at: string | null;
}

export async function getMaintenanceRules() {
  return callApi<{ systems: MaintenanceSystemRule[]; category_rules: MaintenanceCategorySystemRule[]; questions: MaintenanceRuleQuestion[] }>({ action: "maintenance_rules" });
}

export async function getMaintenanceForecast(vehicleId: string, mode: "route" | "vehicle", routeId?: string) {
  return callApi<MaintenanceForecastData>({ action: "maintenance_forecast", vehicle_id: vehicleId, mode, route_id: routeId });
}

export async function getVehicleCpkProfiles(vehicleId: string) {
  return callApi<{ vehicle: Record<string, unknown>; systems: VehicleCpkProfile[] }>({ action: "vehicle_cpk_profiles", vehicle_id: vehicleId });
}

export async function saveVehicleCpkProfile(vehicleId: string, profileId: string | null, systemCode: string, data: Pick<VehicleCpkProfile, "component_name" | "component_reference" | "base_life_km" | "replacement_cost">) {
  return callApi<Pick<VehicleCpkProfile, "id" | "system_code" | "component_name" | "component_reference" | "base_life_km" | "replacement_cost" | "updated_at">>({ action: "save_vehicle_cpk_profile", vehicle_id: vehicleId, profile_id: profileId, system_code: systemCode, data });
}

export async function deleteVehicleCpkProfile(vehicleId: string, profileId: string) {
  return callApi<{ deleted: boolean }>({ action: "delete_vehicle_cpk_profile", vehicle_id: vehicleId, profile_id: profileId });
}

export async function getMaintenanceFinanceIndicators() {
  return callApi<MaintenanceFinanceIndicators>({ action: "maintenance_finance_indicators" });
}
