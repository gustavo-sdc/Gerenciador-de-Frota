import supabase from "../supabase/supabase";
import type { MaintenanceCategorySystemRule, MaintenanceRuleQuestion, MaintenanceSystemRule } from "./controller";

type RuleResult<T> = { data?: T; error?: Error };

async function callDeveloperRules<T>(body: Record<string, unknown>): Promise<RuleResult<T>> {
  const { data, error } = await supabase.functions.invoke("developer-rules", { body });
  if (error) {
    let message = error.message;
    const context = (error as Error & { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json();
        if (typeof payload?.error === "string") message = payload.error;
      } catch { /* Usa a mensagem padrão do cliente Supabase. */ }
    }
    return { error: new Error(message) };
  }
  if (data?.error) return { error: new Error(String(data.error)) };
  return data as RuleResult<T>;
}

export async function getDeveloperStatus() {
  const result = await callDeveloperRules<{ isDeveloper: boolean }>({ action: "status" });
  return result.data?.isDeveloper === true;
}

export async function getDeveloperRules() {
  return callDeveloperRules<{ systems: MaintenanceSystemRule[]; category_rules: MaintenanceCategorySystemRule[]; questions: MaintenanceRuleQuestion[] }>({ action: "list" });
}

export async function saveMaintenanceSystem(record: Partial<MaintenanceSystemRule>) {
  return callDeveloperRules<MaintenanceSystemRule>({ action: "save_system", record });
}

export async function saveMaintenanceCategoryRule(record: Partial<MaintenanceCategorySystemRule>) {
  return callDeveloperRules<MaintenanceCategorySystemRule>({ action: "save_category_rule", record });
}

export async function importMaintenanceCategoryRules(records: Partial<MaintenanceCategorySystemRule>[]) {
  return callDeveloperRules<{ count: number }>({ action: "save_category_rules", records });
}

export async function saveMaintenanceQuestion(record: Partial<MaintenanceRuleQuestion>) {
  return callDeveloperRules<MaintenanceRuleQuestion>({ action: "save_question", record });
}

export async function deleteMaintenanceQuestion(id: string) {
  return callDeveloperRules<{ success: boolean }>({ action: "delete_question", id });
}

export async function deleteMaintenanceSystem(system_code: string) {
  return callDeveloperRules<{ success: boolean }>({ action: "delete_system", system_code });
}
