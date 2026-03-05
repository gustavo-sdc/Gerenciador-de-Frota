import supabase from "../supabase/supabase";

/* ================================
   TIPOS BASE
================================ */
export interface VehicleData {
  id?: string;
  tenant_id: string; // antes: enterprise_id
  model: string;
  plate: string;
  year: number;
  color: string;
  idPlate: string; // Renavam
  gasType: string;
  buyMileage: number;
  buyDate: string;
  lastMileage: number;
  driver?: string | null;
  status: "active" | "inactive";
}

/* ================================
   GET (Listar, Buscar, Filtrar)
================================ */
export async function getObject<T>(
  tenantId: string,
  tableName: string,
  options?: {
    search?: string;
    id?: string;
    limit?: number;
    offset?: number;
  }
) {
  let query = supabase
    .from(tableName)
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId);

  if (options?.id) {
    query = query.eq("id", options.id);
  }

  if (options?.search) {
    query = query.or(
      `model.ilike.%${options.search}%,plate.ilike.%${options.search}%`
    );
  }

  if (options?.limit) {
    const from = options.offset || 0;
    const to = from + options.limit - 1;
    query = query.range(from, to);
  }

  const { data, error, count } = await query;

  if (error) {
    console.log("Error fetching:", error);
    return { error };
  }

  return { data, count };
}

/* ================================
   CREATE
================================ */
export async function addObject<T>(tableName: string, objectData: T) {
  const { data, error } = await supabase
    .from(tableName)
    .insert(objectData)
    .select()
    .single();

  if (error) {
    console.log("Error adding:", error);
    return { error };
  }

  return { data };
}

/* ================================
   UPDATE
================================ */
export async function updateObject<T>(
  tableName: string,
  objectId: string,
  objectData: Partial<T>
) {
  const { data, error } = await supabase
    .from(tableName)
    .update(objectData)
    .eq("id", objectId)
    .select()
    .single();

  if (error) {
    console.log("Error updating:", error);
    return { error };
  }

  return { data };
}

/* ================================
   DESATIVAR (Soft delete)
================================ */
export async function deactiveObject(
  tableName: string,
  objectId: string
) {
  const { data, error } = await supabase
    .from(tableName)
    .update({ status: "inactive" })
    .eq("id", objectId)
    .select()
    .single();

  if (error) {
    console.log("Error deactivating:", error);
    return { error };
  }

  return { data };
}

/* ================================
   DELETE (Hard delete - seguro)
================================ */
export async function deleteObject(
  tableName: string,
  objectId: string
) {
  const { error } = await supabase
    .from(tableName)
    .delete()
    .eq("id", objectId);

  if (error) {
    console.log("Error deleting:", error);
    return { error };
  }

  return { success: true };
}
