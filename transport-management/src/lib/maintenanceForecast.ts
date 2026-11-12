import type { MaintenanceForecastData } from "./controller";

export type ForecastRow = {
  component: string;
  title: string;
  status: "previsto" | "vencido" | "dados insuficientes" | "inspeção";
  basis: string;
  nextKm: number | null;
  nextDate: string;
  remainingKm: number | null;
};

const components = [
  ["oleo_filtros", "Óleo e filtros"], ["pneus", "Pneus"], ["partida_eletrica", "Sistema de partida"],
  ["bateria", "Bateria"], ["alternador", "Alternador"], ["injecao_bicos", "Injeção e bicos"],
  ["suspensao", "Suspensão"], ["freios", "Freios"],
] as const;
const pt = (n: number) => Math.round(n).toLocaleString("pt-BR");

export function buildMaintenanceForecast(data: MaintenanceForecastData): ForecastRow[] {
  const vehicle = data.vehicle;
  const currentKm = Number(vehicle.km_atual ?? 0);
  const profile = (vehicle.maintenance_history ?? {}) as Record<string, Record<string, unknown>>;
  const routeDays = new Map<string, number>();
  data.routes.forEach(route => {
    const date = String(route.start_time ?? route.created_at ?? "").slice(0, 10);
    if (date) routeDays.set(date, (routeDays.get(date) ?? 0) + Number(route.km_total ?? 0));
  });
  const days = [...routeDays.values()].filter(km => km > 0);
  const observedKmPerOperatingDay = days.length ? days.reduce((sum, km) => sum + km, 0) / days.length : Number(vehicle.average_daily_km ?? 0);
  const kmPerCalendarDay = observedKmPerOperatingDay * Number(vehicle.operating_days_per_week ?? 5) / 7;
  const rows: ForecastRow[] = [];

  for (const [component, title] of components) {
    const saved = profile[component] ?? {};
    const records = data.maintenances.filter(item => item.component === component)
      .sort((a, b) => String(b.date_service ?? "").localeCompare(String(a.date_service ?? "")));
    const last = records[0];
    const lastKm = last?.km_at_service == null ? saved.km_at_service : last.km_at_service;
    const lastDate = last?.date_service || saved.date_service;
    let nextKm: number | null = null;
    let nextDate = "";
    let basis = "";
    let status: ForecastRow["status"] = "dados insuficientes";

    if (component === "pneus") {
      const installKm = Number(saved.km_at_service);
      const measuredKm = Number(saved.tread_measurement_km);
      const newTread = Number(saved.tread_new_mm);
      const currentTread = Number(saved.tread_current_mm);
      const rate = (newTread - currentTread) / (measuredKm - installKm);
      const legalLimitMm = 1.6;
      if (Number.isFinite(rate) && rate > 0 && measuredKm >= installKm && currentTread >= legalLimitMm) {
        nextKm = Math.ceil(measuredKm + (currentTread - legalLimitMm) / rate);
        const remaining = Math.max(nextKm - currentKm, 0);
        if (kmPerCalendarDay > 0) nextDate = new Date(Date.now() + remaining / kmPerCalendarDay * 86400000).toLocaleDateString("pt-BR");
        basis = `Desgaste medido: ${rate.toFixed(5)} mm/km; sulco atual ${currentTread} mm; limite legal 1,6 mm.`;
        status = nextKm <= currentKm ? "vencido" : "previsto";
      } else {
        basis = "Registre KM da instalação, sulco do pneu novo, sulco atual e KM da medição para calcular o desgaste real.";
      }
    } else {
      const task = data.manual.tasks.find(item => item.component === component && (item.interval_km || item.interval_months || item.interval_years));
      const intervalKm = Number(task?.interval_km ?? 0);
      const months = Number(task?.interval_months ?? (task?.interval_years ? task.interval_years * 12 : 0));
      const hasKnownService = saved.status === "known" && (saved.km_at_service != null || saved.date_service);
      const reportedNotDone = saved.status === "not_done";
      const baseKm = lastKm != null ? Number(lastKm) : reportedNotDone ? Number(vehicle.km_aquisicao ?? 0) : null;
      if (task && intervalKm > 0 && baseKm != null && (hasKnownService || last?.km_at_service != null || reportedNotDone)) {
        const dueKm = baseKm + intervalKm;
        const remaining = Math.max(dueKm - currentKm, 0);
        const mileageDate = kmPerCalendarDay > 0 ? new Date(Date.now() + remaining / kmPerCalendarDay * 86400000) : null;
        let calendarDate: Date | null = null;
        if (months > 0 && lastDate) {
          calendarDate = new Date(`${String(lastDate)}T12:00:00`);
          calendarDate.setMonth(calendarDate.getMonth() + months);
        }
        nextKm = dueKm;
        const dueByCalendar = Boolean(calendarDate && (!mileageDate || calendarDate < mileageDate));
        const dueDate = dueByCalendar ? calendarDate : mileageDate ?? calendarDate;
        if (dueDate) nextDate = dueDate.toLocaleDateString("pt-BR");
        basis = `${task.description} • intervalo oficial: ${pt(intervalKm)} km${months ? ` ou ${months} mês(es), o que ocorrer primeiro` : ""}${saved.oil_spec ? ` • óleo informado: ${saved.oil_spec}` : ""}${reportedNotDone ? " • desde a aquisição" : " • última execução registrada"}.`;
        status = dueKm <= currentKm || Boolean(calendarDate && calendarDate.getTime() <= Date.now()) ? "vencido" : "previsto";
      } else if (task && months > 0 && lastDate) {
        const due = new Date(`${String(lastDate)}T12:00:00`);
        due.setMonth(due.getMonth() + months);
        nextDate = due.toLocaleDateString("pt-BR");
        basis = `${task.description} • intervalo oficial: ${months} mês(es) após a última execução.`;
        status = due.getTime() < Date.now() ? "vencido" : "previsto";
      } else if (task) {
        basis = `${task.description} • manual encontrado, mas falta confirmar o KM/data da última execução.`;
      } else if (lastKm != null || lastDate) {
        basis = "Há histórico registrado, mas o manual consultado não trouxe intervalo específico confiável para este sistema.";
        status = "inspeção";
      } else {
        basis = "Sem vida útil universal confiável. Use o plano do fabricante e registre inspeções/medições deste veículo.";
        status = "inspeção";
      }
    }
    rows.push({ component, title, status, basis, nextKm, nextDate, remainingKm: nextKm == null ? null : nextKm - currentKm });
  }
  return rows;
}

export function exportForecastCsv(rows: ForecastRow[], vehicle: Record<string, unknown>) {
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const content = [
    ["Veículo", "Sistema", "Situação", "Próximo KM", "KM restantes", "Data estimada", "Base do cálculo"],
    ...rows.map(row => [`${vehicle.brand ?? ""} ${vehicle.model ?? ""} ${vehicle.plate ?? ""}`.trim(), row.title, row.status,
      row.nextKm ?? "", row.remainingKm ?? "", row.nextDate, row.basis]),
  ].map(line => line.map(escape).join(";")).join("\r\n");
  const blob = new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `previsao-manutencao-${String(vehicle.plate ?? "veiculo")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
