import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Download, Pencil, Plus, Power, Save, Search, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { AuthContext } from "../hooks/authContextValue";
import { addObject, deleteObject, deleteVehicleCpkProfile, getMaintenanceFinanceIndicators, getMaintenanceForecast, getMaintenanceRules, getObject, getResourcePage, getVehicleCpkProfiles, saveVehicleCpkProfile, setObjectActive, updateObject, vehicleCategoryLabels, type MaintenanceFinanceIndicators, type MaintenanceForecastData, type VehicleCpkProfile, type VehicleCategory } from "../lib/controller";
import { getDeveloperStatus } from "../lib/maintenanceRules";
import Button from "./Button/Button";
import Header from "./Header/Header";

type Row = Record<string, unknown>;
type Field = { key: string; label: string; type?: string; required?: boolean; reference?: "vehicles" | "drivers" | "clients" | "routes" | "maintenances"; options?: string[] };
type ResourceConfig = { table: string; title: string; description: string; fields: Field[]; display: string[]; searchKeys: string[] };

const configs: Record<string, ResourceConfig> = {
  drivers: { table: "drivers", title: "Motoristas", description: "Cadastre e acompanhe os condutores da operação.", fields: [{key:"name",label:"Nome",required:true},{key:"document",label:"CPF ou documento"},{key:"pay_per_day",label:"Diária (R$)",type:"number"}], display:["document","pay_per_day","status"], searchKeys:["name","document"] },
  clients: { table: "clients", title: "Clientes", description: "Mantenha os contatos e dados dos clientes em um só lugar.", fields: [{key:"name",label:"Nome",required:true},{key:"contact",label:"Contato"}], display:["contact","status"], searchKeys:["name","contact"] },
  routes: { table: "routes", title: "Rotas", description: "Registre a rota e o período em que ela se repete.", fields: [{key:"vehicle_id",label:"Veículo",reference:"vehicles",required:true},{key:"driver_id",label:"Motorista",reference:"drivers"},{key:"client_id",label:"Cliente",reference:"clients"},{key:"route_periodicity",label:"Periodicidade",type:"select",required:true,options:["diaria","semanal","quinzenal","mensal","esporadica","outros"]},{key:"other_frequency_count",label:"Quantas execuções no período",type:"number"},{key:"payload_weight_kg",label:"Peso transportado por execução (kg)",type:"number",required:true},{key:"km_total",label:"Distância por execução (km)",type:"number",required:true},{key:"duration_minutes",label:"Duração de cada execução (minutos)",type:"number",required:true},{key:"stop_count",label:"Paradas/partidas por execução",type:"number",required:true},{key:"start_time",label:"Início do período",type:"date"},{key:"end_time",label:"Fim do período",type:"date"},{key:"fuel_type_used",label:"Combustível utilizado",type:"select",options:[]},{key:"fuel_unit_price",label:"Preço do combustível por litro / m³ (R$)",type:"decimal"},{key:"route_urban_highway_score",label:"Uso da rota: cidade (1) a estrada (5)",type:"range"},{key:"fuel_cost",label:"Combustível por execução (R$; cálculo automático ou informe)",type:"number"},{key:"driver_cost",label:"Custo do motorista por execução (R$)",type:"number"},{key:"other_costs",label:"Outros custos por execução (R$)",type:"number"},{key:"price_charged",label:"Valor recebido por execução (R$)",type:"number"},{key:"status",label:"Status",type:"select",required:true,options:["pendente","em_andamento","concluida"]}], display:["vehicle_id","driver_id","route_periodicity","occurrence_count","payload_weight_kg","km_total","period_km_total","duration_minutes","price_charged","fuel_cost","maintenance_cost","driver_cost","other_costs","status"], searchKeys:["status"] },
  finances: { table: "finances", title: "Financeiro", description: "Acompanhe a cronologia, o balanço mensal e os custos previstos de manutenção.", fields: [{key:"type",label:"Movimento",type:"select",options:["entrada","saida"],required:true},{key:"description",label:"Descrição",required:true},{key:"amount",label:"Valor (R$)",type:"number",required:true},{key:"related_maintenance_id",label:"Manutenção relacionada",reference:"maintenances"}], display:["type","created_at","description","amount"], searchKeys:["description","type"] },
  maintenances: { table: "maintenances", title: "Manutenções", description: "Acompanhe serviços, custos e previsões por uso e histórico.", fields: [{key:"vehicle_id",label:"Veículo",reference:"vehicles",required:true},{key:"component",label:"Componente",type:"select",required:true,options:["oleo_filtros","pneus","partida_eletrica","bateria","alternador","injecao_bicos","suspensao","freios","outro"]},{key:"service",label:"Serviço",required:true},{key:"parts",label:"Peças"},{key:"cost",label:"Custo (R$)",type:"number",required:true},{key:"local",label:"Oficina"},{key:"km_at_service",label:"KM no serviço",type:"number"},{key:"start_cycles_at_service",label:"Ciclos de partida no serviço",type:"number"},{key:"km_agendado",label:"Próxima manutenção (KM)",type:"number"},{key:"date_service",label:"Data do serviço",type:"date",required:true},{key:"next_date",label:"Próxima data",type:"date"}], display:["component","service","cost","date_service"], searchKeys:["service","local"] },
};

const labels: Record<string,string> = { document:"Documento",pay_per_day:"Diária",contact:"Contato",vehicle_id:"Veículo",driver_id:"Motorista",route_periodicity:"Periodicidade",occurrence_count:"Execuções no período",other_frequency_count:"Frequência informada",payload_weight_kg:"Carga por execução (kg)",km_total:"Distância por execução (km)",period_km_total:"Distância total do período",duration_minutes:"Duração por execução (min)",stop_count:"Paradas/partidas",fuel_cost:"Combustível no período",maintenance_cost:"Manutenção no período",driver_cost:"Motorista no período",other_costs:"Outros custos no período",price_charged:"Receita no período",status:"Status",type:"Tipo",description:"Descrição",amount:"Valor",created_at:"Data",component:"Componente",service:"Serviço",cost:"Custo",date_service:"Data" };
const optionLabels: Record<string,string> = { diaria:"Diária",semanal:"Semanal",quinzenal:"Quinzenal",mensal:"Mensal",esporadica:"Esporádica",outros:"Outros",gasolina:"Gasolina",diesel:"Diesel",etanol:"Etanol",gnv:"GNV",oleo_filtros:"Óleo e filtros",pneus:"Pneus (troca)",partida_eletrica:"Sistema de partida",bateria:"Bateria",alternador:"Alternador",injecao_bicos:"Injeção / bicos",suspensao:"Suspensão",freios:"Freios",outro:"Outro",entrada:"Entrada",saida:"Saída",pendente:"Pendente",em_andamento:"Em andamento",concluida:"Concluída" };
const money = (value: unknown) => value === null || value === undefined || value === "" ? "—" : Number(value).toLocaleString("pt-BR", {style:"currency",currency:"BRL"});
const currentMonth = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`; };

function CpkResults({ data }: { data: MaintenanceForecastData }) {
  const rows = data.rule_calculations;
  const calculatedCount = rows.filter((row) => row.cpk !== null).length;
  const calculatedRows = rows.filter((row) => row.cpk !== null);
  const totalCpk = calculatedRows.reduce((sum, row) => sum + Number(row.cpk), 0);

  const category = vehicleCategoryLabels[String(data.vehicle.vehicle_category) as VehicleCategory] ?? "Não informada";

  function exportCpkCsv() {
    const csvRows = [
      ["Veículo", "Placa", "Categoria", "Sistema", "Item", "Peça / modelo", "Vida base (km)", "Custo de troca (R$)", "Fator total", "Vida ajustada (km)", "CPK (R$/km)", "Situação"],
      ...rows.map((row) => [data.vehicle.model ?? "", data.vehicle.plate ?? "", category, row.name, row.component_name, row.component_reference ?? "", row.base_life_km ?? "", row.replacement_cost ?? "", row.factor_product, row.adjusted_life_km ?? "", row.cpk ?? "", row.formula_error ?? (row.missing_questions.length ? `Pendente: ${row.missing_questions.join(", ")}` : row.calculated_route_count != null && row.total_route_count != null && row.calculated_route_count < row.total_route_count ? `Calculado em ${row.calculated_route_count}/${row.total_route_count} rotas` : row.replacement_cost == null ? "Informe custo de troca" : "Calculado")]),
    ];
    const csv = csvRows.map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `cpk-${String(data.vehicle.plate ?? "veiculo")}.csv`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="mt-4">
    <p className="mb-1 text-base font-semibold text-slate-900">{String(data.vehicle.model ?? "Veículo")} • {String(data.vehicle.plate ?? "Sem placa")}</p><p className="mb-3 text-sm text-slate-600">Categoria: {category} • KM atual: <strong>{Number(data.vehicle.km_atual).toLocaleString("pt-BR")} km</strong> • {data.mode === "vehicle" ? `${data.route_count ?? 0} rotas` : "Rota"}: <strong>{Number(data.route_km).toLocaleString("pt-BR")} km</strong></p>
    <section className="mb-6"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-slate-900">CPK {data.mode === "vehicle" ? "do veículo por sistema" : "da rota por sistema"}</h3><p className="mt-1 text-xs text-slate-500">{data.mode === "vehicle" ? "CPK médio ponderado pelas distâncias das rotas." : "Custo técnico de manutenção por quilômetro."}</p></div><button type="button" onClick={exportCpkCsv} disabled={!rows.length} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 disabled:opacity-40"><Download size={16}/> Exportar CPK</button></div>
      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><article className="rounded-xl border border-blue-100 bg-blue-50 p-4"><p className="text-sm text-slate-600">CPK total</p><p className="mt-1 text-xl font-semibold text-blue-800">{money(totalCpk)}</p><p className="mt-1 text-xs text-slate-500">Soma dos sistemas calculados</p></article><article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm text-slate-600">KM atual do veículo</p><p className="mt-1 text-xl font-semibold text-slate-900">{Number(data.vehicle.km_atual).toLocaleString("pt-BR")} km</p></article><article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm text-slate-600">Distância considerada</p><p className="mt-1 text-xl font-semibold text-slate-900">{Number(data.route_km).toLocaleString("pt-BR")} km</p></article><article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm text-slate-600">Sistemas calculados</p><p className="mt-1 text-xl font-semibold text-slate-900">{calculatedCount} / {rows.length}</p></article></div>
      {rows.length ? <><div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block"><table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Sistema</th><th className="px-3 py-3">Peça / modelo</th><th className="px-3 py-3">Vida base</th><th className="px-3 py-3">Fator</th><th className="px-3 py-3">Vida ajustada</th><th className="px-3 py-3">Custo de troca</th><th className="px-3 py-3">CPK</th><th className="px-3 py-3">Situação</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.profile_id??row.system_code} className="align-top"><td className="px-3 py-3 font-medium">{row.name}<div className="text-slate-700">{row.component_name}</div>{row.basis_note&&<div className="mt-1 max-w-sm text-xs font-normal text-slate-500">{row.basis_note}</div>}</td><td className="px-3 py-3">{row.component_reference || "—"}</td><td className="px-3 py-3">{row.base_life_km==null?"—":`${Number(row.base_life_km).toLocaleString("pt-BR")} km`}</td><td className="px-3 py-3">×{row.factor_product.toLocaleString("pt-BR",{maximumFractionDigits:3})}</td><td className="px-3 py-3">{row.adjusted_life_km==null?"—":`${Math.round(row.adjusted_life_km).toLocaleString("pt-BR")} km`}</td><td className="px-3 py-3">{money(row.replacement_cost)}</td><td className="px-3 py-3">{money(row.cpk)}</td><td className="px-3 py-3 text-xs text-slate-600">{row.formula_error??(row.missing_questions.length?`Responda: ${row.missing_questions.join(", ")}`:row.calculated_route_count!=null&&row.total_route_count!=null&&row.calculated_route_count<row.total_route_count?`Calculado em ${row.calculated_route_count}/${row.total_route_count} rotas`:row.base_life_km==null?"Informe a vida base":row.replacement_cost==null?"Informe o custo de troca":"Calculado")}</td></tr>)}</tbody></table></div><div className="grid gap-3 md:hidden">{rows.map(row=><article key={row.profile_id??row.system_code} className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm"><h4 className="text-lg font-bold text-slate-950">{row.component_name}</h4><p className="text-base text-slate-700">{row.name}</p>{row.basis_note&&<p className="mt-1 text-base text-slate-700">{row.basis_note}</p>}<div className="mt-3 grid grid-cols-2 gap-3"><div className="rounded-xl bg-blue-50 p-3"><p className="font-semibold text-slate-800">CPK</p><p className="mt-1 font-bold text-blue-900">{money(row.cpk)}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="font-semibold text-slate-800">Vida ajustada</p><p className="mt-1 font-bold text-slate-900">{row.adjusted_life_km==null?"—":`${Math.round(row.adjusted_life_km).toLocaleString("pt-BR")} km`}</p></div></div><dl className="mt-3 divide-y divide-slate-200">{[["Peça / modelo",row.component_reference||"—"],["Vida base",row.base_life_km==null?"—":`${Number(row.base_life_km).toLocaleString("pt-BR")} km`],["Fator",`×${row.factor_product.toLocaleString("pt-BR",{maximumFractionDigits:3})}`],["Vida ajustada",row.adjusted_life_km==null?"—":`${Math.round(row.adjusted_life_km).toLocaleString("pt-BR")} km`],["Custo de troca",money(row.replacement_cost)]].map(([label,value])=><div key={label} className="flex justify-between gap-3 py-2 text-base"><dt className="font-semibold text-slate-800">{label}</dt><dd className="text-right text-slate-900">{value}</dd></div>)}</dl><p className="mt-3 text-base text-slate-700">{row.formula_error??(row.missing_questions.length?`Responda: ${row.missing_questions.join(", ")}`:row.calculated_route_count!=null&&row.total_route_count!=null&&row.calculated_route_count<row.total_route_count?`Calculado em ${row.calculated_route_count}/${row.total_route_count} rotas`:row.base_life_km==null?"Informe a vida base":row.replacement_cost==null?"Informe o custo de troca":"Calculado")}</p></article>)}</div></> : <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">Nenhum sistema ativo foi configurado para esta categoria.</p>}
    </section>
  </div>;
}

export function MaintenanceForecast({ vehicles, routes = [], standalone = false }: { vehicles: Row[]; routes?: Row[]; standalone?: boolean }) {
  const [open, setOpen] = useState(standalone);
  const [mode, setMode] = useState<"route" | "vehicle">("route");
  const [vehicleId, setVehicleId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [data, setData] = useState<MaintenanceForecastData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [vehicleProfiles, setVehicleProfiles] = useState<(VehicleCpkProfile & { draft_key?: string; is_default?: boolean })[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [savingSystem, setSavingSystem] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState("");
  const [newItemSystemCode, setNewItemSystemCode] = useState("");
  const selectedVehicle = vehicles.find((vehicle) => String(vehicle.id) === vehicleId);
  const vehicleRoutes = routes.filter((route) => String(route.vehicle_id) === vehicleId);
  const profileSystems = [...new Map(vehicleProfiles.map((item) => [item.system_code, { system_code: item.system_code, name: item.name }])).values()];

  useEffect(() => {
    let active = true;
    setVehicleProfiles([]); setProfileNotice("");
    if (!vehicleId) { setProfilesLoading(false); return () => { active = false; }; }
    setProfilesLoading(true);
    void getVehicleCpkProfiles(vehicleId).then((result) => {
      if (!active) return;
      if (result.error) setError(result.error.message);
      else {
        setVehicleProfiles(result.data?.systems ?? []);
        setNewItemSystemCode((current) => result.data?.systems.some((item) => item.system_code === current) ? current : result.data?.systems[0]?.system_code || "");
      }
      setProfilesLoading(false);
    });
    return () => { active = false; };
  }, [vehicleId]);

  const vehicleProfileKey = (item: VehicleCpkProfile & { draft_key?: string }) => item.draft_key ?? item.id ?? `default-${item.system_code}`;

  function updateVehicleProfile(profileKey: string, key: "system_code" | "component_name" | "component_reference" | "base_life_km" | "replacement_cost", value: string) {
    setVehicleProfiles((current) => current.map((item) => {
      if (vehicleProfileKey(item) !== profileKey) return item;
      if (key === "system_code") {
        const system = current.find((candidate) => candidate.system_code === value);
        return { ...item, system_code: value, name: system?.name ?? value };
      }
      return { ...item, [key]: key === "base_life_km" || key === "replacement_cost" ? value === "" ? null : Number(value) : value };
    }));
    setData(null); setProfileNotice("");
  }

  function addVehicleProfile() {
    const system = vehicleProfiles.find((item) => item.system_code === newItemSystemCode);
    if (!system) return;
    setVehicleProfiles((current) => [...current, {
      ...system, id: null, draft_key: `draft-${crypto.randomUUID()}`, is_default: false,
      component_name: "", component_reference: "", updated_at: null,
    }]);
    setData(null); setProfileNotice("");
  }

  async function saveVehicleProfile(profile: VehicleCpkProfile & { draft_key?: string }) {
    const key = vehicleProfileKey(profile);
    setSavingSystem(key); setError(""); setProfileNotice("");
    const result = await saveVehicleCpkProfile(vehicleId, profile.id, profile.system_code, {
      component_name: profile.component_name,
      component_reference: profile.component_reference || null,
      base_life_km: profile.base_life_km,
      replacement_cost: profile.replacement_cost,
    });
    if (result.error) setError(result.error.message);
    else {
      setVehicleProfiles((current) => current.map((item) => vehicleProfileKey(item) === key ? { ...item, ...result.data, draft_key: undefined, is_default: false } : item));
      setProfileNotice(`${profile.component_name} salvo em ${profile.name}.`);
      setData(null);
    }
    setSavingSystem(null);
  }

  async function removeVehicleProfile(profile: VehicleCpkProfile & { draft_key?: string }) {
    const key = vehicleProfileKey(profile);
    if (!profile.id) {
      setVehicleProfiles((current) => current.filter((item) => vehicleProfileKey(item) !== key));
      setData(null); setProfileNotice("Item removido da lista.");
      return;
    }
    setSavingSystem(`delete-${key}`); setError(""); setProfileNotice("");
    const result = await deleteVehicleCpkProfile(vehicleId, profile.id);
    if (result.error) setError(result.error.message);
    else {
      const refreshed = await getVehicleCpkProfiles(vehicleId);
      if (refreshed.error) setError(refreshed.error.message);
      else setVehicleProfiles(refreshed.data?.systems ?? []);
      setProfileNotice(`${profile.component_name} removido.`); setData(null);
    }
    setSavingSystem(null);
  }

  async function calculate(event: React.FormEvent) {
    event.preventDefault();
    if (!vehicleId) { setError("Selecione um veículo."); return; }
    if (mode === "route" && !routeId) { setError("Selecione uma rota."); return; }
    setLoading(true); setError(""); setData(null);
    const result = await getMaintenanceForecast(vehicleId, mode, mode === "route" ? routeId : undefined);
    setLoading(false);
    if (result.error) setError(result.error.message); else setData(result.data ?? null);
  }

  return <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${standalone ? "" : "mb-7"}`}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold text-slate-900">Cálculo de CPK</h2><p className="mt-1 text-sm text-slate-500">Use as respostas informadas no cadastro de cada rota.</p></div>{!standalone && <button type="button" onClick={() => { setOpen((value) => !value); setError(""); }} className="h-10 rounded-xl bg-blue-700 px-4 text-sm font-medium text-white">{open ? "Ocultar cálculo" : "Calcular CPK"}</button>}</div>
    {open && <form onSubmit={(event) => void calculate(event)} className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">Calcular por<select value={mode} onChange={(event) => { setMode(event.target.value as "route" | "vehicle"); setData(null); setError(""); }} className="h-11 rounded-xl border border-slate-200 bg-white px-3"><option value="route">Uma rota</option><option value="vehicle">Veículo (soma das rotas)</option></select></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">Veículo<select value={vehicleId} onChange={(event) => { setVehicleId(event.target.value); setRouteId(""); setData(null); setError(""); }} className="h-11 rounded-xl border border-slate-200 bg-white px-3"><option value="">Selecione</option>{vehicles.map((vehicle) => <option key={String(vehicle.id)} value={String(vehicle.id)}>{String(vehicle.model ?? "Veículo")} • {String(vehicle.plate ?? "")}</option>)}</select></label>
        {mode === "route" && <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">Rota<select value={routeId} onChange={(event) => { setRouteId(event.target.value); setData(null); }} className="h-11 rounded-xl border border-slate-200 bg-white px-3"><option value="">Selecione</option>{vehicleRoutes.map((route) => { const date = route.start_time ?? route.created_at; return <option key={String(route.id)} value={String(route.id)}>{date ? new Date(String(date)).toLocaleDateString("pt-BR") : "Rota"} • {Number(route.km_total ?? 0).toLocaleString("pt-BR")} km • {String(route.status ?? "pendente")} • {Number(route.occurrence_count ?? 1)} execuções</option>; })}</select></label>}
      </div>
      {selectedVehicle && !selectedVehicle.vehicle_category && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Defina a categoria do veículo no cadastro para aplicar as regras CPK. <Link className="font-semibold underline" to={`/frota/novo/${String(selectedVehicle.id)}`}>Editar veículo</Link></p>}
      {mode === "vehicle" && vehicleId && <p className="text-sm text-slate-600">Serão somadas {vehicleRoutes.length} rotas cadastradas deste veículo.</p>}
      <button disabled={loading || !vehicleId || (mode === "route" && !routeId)} className="h-11 rounded-xl bg-slate-900 px-5 text-sm font-medium text-white disabled:opacity-50">{loading ? "Calculando…" : "Calcular CPK"}</button>
    </form>}
    {Boolean(selectedVehicle?.vehicle_category) && <section aria-label="Valores de CPK do veículo" className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-lg font-bold text-slate-950">Itens deste veículo</h3><p className="mt-1 text-base text-slate-700">Cada item tem vida útil e custo próprios. Escolha o sistema que o componente integra.</p></div><div className="flex gap-2"><label className="sr-only" htmlFor="new-cpk-item-system">Sistema do novo item</label><select id="new-cpk-item-system" value={newItemSystemCode} onChange={event=>setNewItemSystemCode(event.target.value)} disabled={!profileSystems.length} className="min-h-14 min-w-40 rounded-xl border border-slate-300 bg-white px-3 text-base">{profileSystems.map(system=><option key={system.system_code} value={system.system_code}>{system.name}</option>)}</select><button type="button" onClick={addVehicleProfile} disabled={!profileSystems.length||profilesLoading} className="min-h-14 rounded-xl bg-slate-800 px-4 font-semibold text-white disabled:opacity-50"><Plus aria-hidden="true" size={18} className="mr-2 inline"/>Adicionar item</button></div></div>
      {profilesLoading ? <p role="status" className="rounded-lg bg-white p-4 text-base text-slate-700">Carregando itens…</p> : vehicleProfiles.length ? <>
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block"><table className="min-w-[1120px] w-full text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="px-3 py-3">Sistema</th><th className="px-3 py-3">Item</th><th className="px-3 py-3">Peça / modelo</th><th className="px-3 py-3">Vida útil (km)</th><th className="px-3 py-3">Custo de troca (R$)</th><th className="px-3 py-3">Ação</th></tr></thead><tbody className="divide-y divide-slate-200">{vehicleProfiles.map(item=>{const key=vehicleProfileKey(item);return <tr key={key}><td className="px-3 py-2">{item.is_default?<span className="font-semibold text-slate-900">{item.name}</span>:<select aria-label={`Sistema de ${item.component_name||"novo item"}`} value={item.system_code} onChange={event=>updateVehicleProfile(key,"system_code",event.target.value)} className="min-h-14 min-w-40 rounded-lg border border-slate-300 bg-white px-3 text-base">{profileSystems.map(system=><option key={system.system_code} value={system.system_code}>{system.name}</option>)}</select>}</td><td className="px-3 py-2"><input aria-label="Nome do item" value={item.component_name} maxLength={120} onChange={event=>updateVehicleProfile(key,"component_name",event.target.value)} placeholder="Ex.: pneus dianteiros" className="min-h-14 w-full min-w-48 rounded-lg border border-slate-300 px-3 text-base"/></td><td className="px-3 py-2"><input aria-label={`Marca ou modelo de ${item.component_name||item.name}`} value={item.component_reference??""} maxLength={120} onChange={event=>updateVehicleProfile(key,"component_reference",event.target.value)} placeholder="Marca, modelo ou medida" className="min-h-14 w-full min-w-48 rounded-lg border border-slate-300 px-3 text-base"/></td><td className="px-3 py-2"><input aria-label={`Vida útil de ${item.component_name||item.name}`} type="number" min="1" step="1" value={item.base_life_km??""} onChange={event=>updateVehicleProfile(key,"base_life_km",event.target.value)} className="min-h-14 w-36 rounded-lg border border-slate-300 px-3 text-base"/></td><td className="px-3 py-2"><input aria-label={`Custo de troca de ${item.component_name||item.name}`} type="number" min="0.01" step="0.01" value={item.replacement_cost??""} onChange={event=>updateVehicleProfile(key,"replacement_cost",event.target.value)} className="min-h-14 w-40 rounded-lg border border-slate-300 px-3 text-base"/></td><td className="px-3 py-2"><div className="flex gap-2"><button type="button" onClick={()=>void saveVehicleProfile(item)} disabled={savingSystem===key||savingSystem===`delete-${key}`} aria-label={`Salvar ${item.component_name||"item"}`} className="inline-flex min-h-14 items-center gap-2 rounded-xl bg-slate-800 px-4 font-semibold text-white disabled:opacity-50"><Save aria-hidden="true" size={18}/>{savingSystem===key?"Salvando…":"Salvar"}</button>{(item.id||item.draft_key)&&<button type="button" onClick={()=>void removeVehicleProfile(item)} disabled={savingSystem===`delete-${key}`} aria-label={`Excluir ${item.component_name}`} title="Excluir item" className="inline-flex min-h-14 min-w-14 items-center justify-center rounded-xl border border-rose-300 text-rose-800 disabled:opacity-50"><Trash2 aria-hidden="true" size={18}/></button>}</div></td></tr>})}</tbody></table></div>
        <div className="grid gap-3 md:hidden">{vehicleProfiles.map(item=>{const key=vehicleProfileKey(item);return <article key={key} className="rounded-xl border border-slate-200 bg-white p-3"><h4 className="text-base font-bold text-slate-950">{item.component_name||"Novo item"}</h4><div className="mt-3 grid gap-3"><label className="flex flex-col gap-1 text-base font-semibold text-slate-800">Sistema<select value={item.system_code} disabled={item.is_default} onChange={event=>updateVehicleProfile(key,"system_code",event.target.value)} className="min-h-14 rounded-lg border border-slate-300 bg-white px-3 font-normal">{profileSystems.map(system=><option key={system.system_code} value={system.system_code}>{system.name}</option>)}</select></label><label className="flex flex-col gap-1 text-base font-semibold text-slate-800">Nome do item<input value={item.component_name} maxLength={120} onChange={event=>updateVehicleProfile(key,"component_name",event.target.value)} placeholder="Ex.: pneus dianteiros" className="min-h-14 rounded-lg border border-slate-300 px-3 font-normal"/></label><label className="flex flex-col gap-1 text-base font-semibold text-slate-800">Peça / modelo<input value={item.component_reference??""} maxLength={120} onChange={event=>updateVehicleProfile(key,"component_reference",event.target.value)} placeholder="Marca, modelo ou medida" className="min-h-14 rounded-lg border border-slate-300 px-3 font-normal"/></label><label className="flex flex-col gap-1 text-base font-semibold text-slate-800">Vida útil (km)<input type="number" min="1" step="1" value={item.base_life_km??""} onChange={event=>updateVehicleProfile(key,"base_life_km",event.target.value)} className="min-h-14 rounded-lg border border-slate-300 px-3 font-normal"/></label><label className="flex flex-col gap-1 text-base font-semibold text-slate-800">Custo de troca (R$)<input type="number" min="0.01" step="0.01" value={item.replacement_cost??""} onChange={event=>updateVehicleProfile(key,"replacement_cost",event.target.value)} className="min-h-14 rounded-lg border border-slate-300 px-3 font-normal"/></label><div className="flex gap-2"><button type="button" onClick={()=>void saveVehicleProfile(item)} disabled={savingSystem===key||savingSystem===`delete-${key}`} className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 font-semibold text-white disabled:opacity-50"><Save aria-hidden="true" size={18}/>{savingSystem===key?"Salvando…":"Salvar item"}</button>{(item.id||item.draft_key)&&<button type="button" onClick={()=>void removeVehicleProfile(item)} disabled={savingSystem===`delete-${key}`} aria-label={`Excluir ${item.component_name}`} className="inline-flex min-h-14 min-w-14 items-center justify-center rounded-xl border border-rose-300 text-rose-800 disabled:opacity-50"><Trash2 aria-hidden="true" size={18}/></button>}</div></div></article>})}</div>
      </> : <p className="rounded-lg bg-white p-4 text-base text-slate-700">Nenhum sistema ativo configurado para esta categoria.</p>}
      {profileNotice&&<p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-base text-emerald-900">{profileNotice}</p>}
    </section>}
    {error && <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
    {data && <CpkResults data={data}/>}
  </section>;
}

function FinanceProjection({ vehicles, routes }: { vehicles: Row[]; routes: Row[] }) {
  const [mode, setMode] = useState<"route" | "vehicle">("route");
  const [vehicleId, setVehicleId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [data, setData] = useState<MaintenanceForecastData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedVehicle = vehicles.find((vehicle) => String(vehicle.id) === vehicleId);
  const vehicleRoutes = routes.filter((route) => String(route.vehicle_id) === vehicleId);
  const calculatedRows = data?.rule_calculations.filter((row) => row.cpk !== null && row.route_cost !== null) ?? [];
  const totalCost = calculatedRows.reduce((sum, row) => sum + Number(row.route_cost), 0);

  async function calculate(event: React.FormEvent) {
    event.preventDefault();
    if (!vehicleId) { setError("Selecione um veículo."); return; }
    if (mode === "route" && !routeId) { setError("Selecione uma rota."); return; }
    setBusy(true); setError(""); setData(null);
    const result = await getMaintenanceForecast(vehicleId, mode, mode === "route" ? routeId : undefined);
    setBusy(false);
    if (result.error) setError(result.error.message); else setData(result.data ?? null);
  }

  return <section className="mb-6 rounded-xl border border-blue-200 bg-white p-3 shadow-sm sm:p-4">
    <div><h2 className="text-xl font-bold text-slate-950">Previsão de custos de manutenção</h2><p className="mt-1 text-base text-slate-700">Projeta a reserva de manutenção usando o CPK calculado e as distâncias registradas.</p></div>
    <form onSubmit={(event) => void calculate(event)} className="mt-4 grid gap-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-base font-semibold text-slate-800">Projetar por<select value={mode} onChange={(event) => { setMode(event.target.value as "route" | "vehicle"); setData(null); setError(""); }} className="rounded-xl border border-slate-300 bg-white px-3"><option value="route">Uma rota</option><option value="vehicle">Todas as rotas do veículo</option></select></label>
      <label className="flex flex-col gap-1 text-base font-semibold text-slate-800">Veículo<select value={vehicleId} onChange={(event) => { setVehicleId(event.target.value); setRouteId(""); setData(null); }} className="rounded-xl border border-slate-300 bg-white px-3"><option value="">Selecione</option>{vehicles.map((vehicle) => <option key={String(vehicle.id)} value={String(vehicle.id)}>{String(vehicle.model ?? "Veículo")} • {String(vehicle.plate ?? "")}</option>)}</select></label>
      {mode === "route" && <label className="flex flex-col gap-1 text-base font-semibold text-slate-800">Rota<select value={routeId} onChange={(event) => { setRouteId(event.target.value); setData(null); }} className="rounded-xl border border-slate-300 bg-white px-3"><option value="">Selecione</option>{vehicleRoutes.map((route) => { const date = route.start_time ?? route.created_at; return <option key={String(route.id)} value={String(route.id)}>{date ? new Date(String(date)).toLocaleDateString("pt-BR") : "Rota"} • {Number(route.km_total ?? 0).toLocaleString("pt-BR")} km</option>; })}</select></label>}
      <button disabled={busy || !vehicleId || (mode === "route" && !routeId)} className="min-h-14 self-end rounded-xl bg-blue-700 px-5 font-bold text-white shadow-md hover:bg-blue-800 disabled:opacity-50">{busy ? "Calculando…" : "Calcular custo previsto"}</button>
    </form>
    {selectedVehicle && !selectedVehicle.vehicle_category && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-base text-amber-900">Cadastre a categoria do veículo para calcular o CPK.</p>}
    {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-base text-rose-900">{error}</p>}
    {data && <div className="mt-5"><div className="grid gap-3 sm:grid-cols-3"><article className="rounded-lg border border-blue-200 bg-blue-50 p-3"><p className="font-semibold text-slate-800">Reserva de manutenção prevista</p><p className="mt-1 text-2xl font-bold text-blue-900">{money(totalCost)}</p></article><article className="rounded-lg border border-slate-300 bg-slate-50 p-3"><p className="font-semibold text-slate-800">Distância calculada</p><p className="mt-1 text-xl font-bold text-slate-950">{Number(data.route_km).toLocaleString("pt-BR")} km</p></article><article className="rounded-lg border border-slate-300 bg-slate-50 p-3"><p className="font-semibold text-slate-800">Sistemas considerados</p><p className="mt-1 text-xl font-bold text-slate-950">{calculatedRows.length} / {data.rule_calculations.length}</p></article></div><p className="mt-3 text-base text-slate-700">A soma inclui apenas sistemas e rotas com cálculo válido.</p>{calculatedRows.length > 0 && <div className="mt-4 overflow-x-auto rounded-xl border border-slate-300"><table className="min-w-[520px] w-full text-left text-base"><thead className="bg-slate-100"><tr><th className="px-3 py-3">Sistema</th><th className="px-3 py-3">CPK</th><th className="px-3 py-3">Custo previsto</th></tr></thead><tbody className="divide-y divide-slate-200">{calculatedRows.map((row) => <tr key={row.system_code}><th className="px-3 py-3 font-semibold">{row.name}</th><td className="px-3 py-3">{money(row.cpk)} / km</td><td className="px-3 py-3 font-semibold">{money(row.route_cost)}</td></tr>)}</tbody></table></div>}</div>}
  </section>;
}

export default function ResourceManager({ resource }: { resource: string }) {
  const config = configs[resource];
  const { tenantId } = useContext(AuthContext);
  const [rows, setRows] = useState<Row[]>([]);
  const [references, setReferences] = useState<Record<string, Row[]>>({});
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string,string>>({});
  const [routeAnswers, setRouteAnswers] = useState<Record<string,string>>({});
  const [routeRuleCatalog, setRouteRuleCatalog] = useState<NonNullable<Awaited<ReturnType<typeof getMaintenanceRules>>["data"]> | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [financeMonth, setFinanceMonth] = useState(currentMonth);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [monthTotals, setMonthTotals] = useState({ income: 0, expense: 0 });
  const [exporting, setExporting] = useState(false);
  const loadSequence = useRef(0);
  const [maintenanceIndicators, setMaintenanceIndicators] = useState<MaintenanceFinanceIndicators | null>(null);
  const [maintenanceIndicatorsBusy, setMaintenanceIndicatorsBusy] = useState(false);
  const [maintenanceIndicatorsError, setMaintenanceIndicatorsError] = useState("");
  const [isDeveloper, setIsDeveloper] = useState(false);

  useEffect(() => {
    if (resource !== "maintenances") { setIsDeveloper(false); return; }
    let active = true;
    void getDeveloperStatus().then((value) => { if (active) setIsDeveloper(value); });
    return () => { active = false; };
  }, [resource]);

  useEffect(() => {
    if (resource !== "finances") { setMaintenanceIndicators(null); return; }
    let active = true;
    setMaintenanceIndicatorsBusy(true); setMaintenanceIndicatorsError("");
    void getMaintenanceFinanceIndicators().then((result) => {
      if (!active) return;
      if (result.error) setMaintenanceIndicatorsError(result.error.message);
      else setMaintenanceIndicators(result.data ?? null);
      setMaintenanceIndicatorsBusy(false);
    });
    return () => { active = false; };
  }, [resource, tenantId]);

  useEffect(() => {
    if (resource !== "routes") { setRouteRuleCatalog(null); return; }
    void getMaintenanceRules().then((result) => {
      if (result.data) setRouteRuleCatalog(result.data);
      else if (result.error) setError(result.error.message);
    });
  }, [resource]);

  const load = useCallback(async () => {
    if (!tenantId) return;
    const sequence = ++loadSequence.current;
    setLoadingRows(true);
    const result = await getResourcePage<Row>(config.table, {
      limit: 50, offset: page * 50, search: query, month: resource === "finances" ? financeMonth : undefined,
    });
    if (sequence !== loadSequence.current) return;
    if (result.error) setError(result.error.message);
    else {
      setRows(result.data?.rows ?? []);
      setHasMore(Boolean(result.has_more));
      setReferences(result.data?.references ?? {});
      if (result.data?.month_totals) setMonthTotals(result.data.month_totals);
      setError("");
    }
    setLoadingRows(false);
  }, [tenantId, config, resource, page, query, financeMonth]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return rows.filter(row => (resource !== "finances" || String(row.created_at ?? "").slice(0,7) === financeMonth) && (!term || config.searchKeys.some(key => String(row[key] ?? "").toLocaleLowerCase().includes(term))));
  }, [rows, query, config, resource, financeMonth]);

  const financeMonths = useMemo(() => Array.from({ length: 36 }, (_, index) => {
    const [year, month] = currentMonth().split("-").map(Number);
    const date = new Date(year, month - 1 - index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }), []);
  const monthIncome = monthTotals.income;
  const monthExpense = monthTotals.expense;
  const canToggleActive = ["vehicles", "drivers", "clients"].includes(resource);

  async function exportFinanceCsv(all = false) {
    if (!tenantId) return;
    setExporting(true);
    const entries: Row[] = [];
    try {
      for (let offset = 0; ; offset += 200) {
        const result = await getObject<Row>(tenantId, "finances", { limit: 200, offset, month: all ? undefined : financeMonth });
        if (result.error) throw result.error;
        entries.push(...(result.data ?? []));
        if (!result.has_more) break;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível exportar o financeiro.");
      setExporting(false);
      return;
    }
    const csvRows = [["Data", "Movimento", "Descrição", "Valor (R$)"], ...entries.map(row => [row.created_at ? new Date(String(row.created_at)).toLocaleDateString("pt-BR") : "", row.type === "entrada" ? "Entrada" : "Saída", row.description ?? "", row.amount ?? 0])];
    const csv = csvRows.map(line=>line.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"}));
    const link = document.createElement("a"); link.href=url; link.download=all?"financeiro-completo.csv":`financeiro-${financeMonth}.csv`; link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    setExporting(false);
  }

  const titleFor = (row: Row) => {
    if (resource === "routes") {
      const client = references.clients?.find(item => item.id === row.client_id);
      const when = row.start_time ?? row.created_at;
      const date = when ? new Date(String(when)).toLocaleDateString("pt-BR") : "";
      return `Rota${client?.name ? ` • ${String(client.name)}` : ""}${date ? ` • ${date}` : ""}`;
    }
    if (resource === "finances") return `Lançamento${row.created_at ? ` • ${new Date(String(row.created_at)).toLocaleDateString("pt-BR")}` : ""}`;
    return String(row.name ?? row.model ?? row.service ?? row.description ?? row.plate ?? "Registro");
  };
  const referenceTitle = (reference: Field["reference"], row: Row) => {
    if (reference === "vehicles") return `${String(row.brand ?? "")} ${String(row.model ?? "Veículo")}`.trim();
    if (reference === "drivers" || reference === "clients") return String(row.name ?? "Cadastro sem nome");
    if (reference === "maintenances") return String(row.service ?? "Manutenção");
    return titleFor(row);
  };
  const refLabel = (field: Field, value: unknown) => {
    if (!value) return "";
    const row = references[field.reference ?? ""]?.find(item => item.id === value);
    return row ? `${referenceTitle(field.reference, row)}${row.plate ? ` • ${String(row.plate)}` : ""}${row.status === false ? " (inativo)" : ""}` : "";
  };
  const routeVehicle = references.vehicles?.find((vehicle) => String(vehicle.id) === form.vehicle_id);
  const vehicleFuelOptions = routeVehicle?.fuel_type === "flex" ? ["gasolina", "etanol"] : routeVehicle?.fuel_type ? [String(routeVehicle.fuel_type)] : [];
  const activeRouteSystems = new Set(routeRuleCatalog?.category_rules.filter((rule) => rule.is_active && rule.vehicle_category === routeVehicle?.vehicle_category).map((rule) => rule.system_code) ?? []);
  const routeQuestions = routeRuleCatalog?.questions.filter((question) => question.is_active && activeRouteSystems.has(question.system_code)) ?? [];
  const detailText = (key: string, value: unknown, row?: Row) => {
    if (key === "created_at") return value ? new Date(String(value)).toLocaleString("pt-BR") : "—";
    if (resource === "routes" && key === "period_km_total" && row) return `${(Number(row.km_total ?? 0) * Number(row.occurrence_count ?? 1)).toLocaleString("pt-BR")} km`;
    if (resource === "routes" && row && ["fuel_cost", "maintenance_cost", "driver_cost", "other_costs", "price_charged"].includes(key)) return money(Number(value ?? 0) * Number(row.occurrence_count ?? 1));
    if (key.includes("cost") || key === "amount" || key === "price_charged" || key === "pay_per_day") return money(value);
    if (key === "component") return optionLabels[String(value)] ?? String(value ?? "—");
    if (key === "status" && typeof value === "boolean") return value ? "Ativo" : "Inativo";
    if (key === "status") return ({pendente:"Pendente",em_andamento:"Em andamento",concluida:"Concluída"} as Record<string,string>)[String(value)] ?? String(value ?? "—");
    return String(value ?? "—");
  };
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const badNumber = config.fields.find(field => field.type === "number" && form[field.key] !== undefined &&
      (!Number.isFinite(Number(form[field.key])) || Number(form[field.key]) < (field.key === "amount" || field.key === "fuel_unit_price" ? 0.01 : 0)));
    if (badNumber) { setError(`${badNumber.label} precisa ser ${badNumber.key === "amount" ? "maior que zero" : "igual ou maior que zero"}.`); setBusy(false); return; }
    if (form.start_time && form.end_time && new Date(form.end_time) < new Date(form.start_time)) {
      setError("O fim da rota deve ocorrer depois do início."); setBusy(false); return;
    }
    if (resource === "routes" && !form.duration_minutes && (!form.start_time || !form.end_time)) { setError("Informe a duração da rota ou os horários de início e fim."); setBusy(false); return; }
    if (form.next_date && form.date_service && form.next_date < form.date_service) {
      setError("A próxima revisão não pode anteceder o serviço atual."); setBusy(false); return;
    }
    if (resource === "routes" && form.status !== "pendente" && (!form.vehicle_id || !form.driver_id)) {
      setError("Para iniciar ou concluir uma rota, selecione o veículo e o motorista."); setBusy(false); return;
    }
    if (resource === "routes" && form.status === "concluida" && form.price_charged === undefined) {
      setError("Informe o valor recebido antes de concluir a rota."); setBusy(false); return;
    }
    if (resource === "routes") {
      if (form.route_periodicity !== "esporadica" && (!form.start_time || !form.end_time)) { setError("Informe o início e o fim do período da rota."); setBusy(false); return; }
      if (form.route_periodicity === "outros" && (!Number.isInteger(Number(form.other_frequency_count)) || Number(form.other_frequency_count) < 1)) { setError("Informe um número inteiro de ocorrências para a periodicidade outros."); setBusy(false); return; }
      if (form.route_periodicity === "outros" && form.start_time && form.end_time && Number(form.other_frequency_count) > Math.floor((Date.parse(`${form.end_time}T00:00:00Z`) - Date.parse(`${form.start_time}T00:00:00Z`)) / 86400000) + 1) { setError("O número de execuções não pode superar os dias do período."); setBusy(false); return; }
      if (form.payload_weight_kg && routeVehicle?.payload_capacity_kg != null && Number(form.payload_weight_kg) > Number(routeVehicle.payload_capacity_kg)) { setError("A carga supera a capacidade cadastrada deste veículo."); setBusy(false); return; }
      const missing = routeQuestions.find((question) => question.required && !routeAnswers[question.id]);
      if (missing) { setError(`Responda: ${missing.question}`); setBusy(false); return; }
    }
    const payload: Row = {};
    for (const field of config.fields) {
      const value = form[field.key]?.trim();
      if (value === undefined || value === "") continue;
      payload[field.key] = field.type === "number" || field.type === "range" ? Number(value) : field.type === "datetime-local" ? new Date(value).toISOString() : field.type === "date" ? `${value}T00:00:00.000Z` : value;
    }
    if (resource === "routes" && form.route_periodicity !== "outros") payload.other_frequency_count = null;
    if (resource === "routes") payload.maintenance_answers = routeAnswers;
    const result = editingId ? await updateObject(config.table, editingId, payload) : await addObject(config.table, payload);
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setForm({}); setEditingId(null); setFormOpen(false); await load();
  }

  async function edit(row: Row) {
    if (resource === "routes" && tenantId) {
      const details = await getObject<Row>(tenantId, "routes", { id: String(row.id) });
      if (details.error || !details.data?.[0]) { setError(details.error?.message ?? "Não foi possível abrir esta rota."); return; }
      row = details.data[0];
    }
    const values: Record<string,string> = {};
    for (const field of config.fields) {
      const value = row[field.key];
      if (value === null || value === undefined) continue;
      if (field.type === "date") values[field.key] = String(value).slice(0, 10);
      else if (field.type === "datetime-local") {
        const date = new Date(String(value));
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        values[field.key] = date.toISOString().slice(0,16);
      } else values[field.key] = String(value);
    }
    if (resource === "routes") {
      const vehicle = references.vehicles?.find((item) => String(item.id) === String(row.vehicle_id));
      const fuels = vehicle?.fuel_type === "flex" ? ["gasolina", "etanol"] : vehicle?.fuel_type ? [String(vehicle.fuel_type)] : [];
      if (!values.fuel_type_used) values.fuel_type_used = fuels[0] ?? "";
      if (!values.route_urban_highway_score) values.route_urban_highway_score = String(vehicle?.urban_highway_score ?? 3);
    }
    setForm(values); setRouteAnswers(row.maintenance_answers && typeof row.maintenance_answers === "object" ? Object.fromEntries(Object.entries(row.maintenance_answers as Record<string,unknown>).map(([key,value])=>[key,String(value)])) : {}); setEditingId(String(row.id)); setFormOpen(true);
  }

  function changeReference(fieldKey: string, value: string) {
    if (resource === "routes" && fieldKey === "vehicle_id" && form.vehicle_id !== value) setRouteAnswers({});
    setForm(previous => {
      const next = {...previous, [fieldKey]:value};
      if (resource === "routes" && fieldKey === "vehicle_id") {
        const vehicle = references.vehicles?.find(item => String(item.id) === value);
        const fuels = vehicle?.fuel_type === "flex" ? ["gasolina", "etanol"] : vehicle?.fuel_type ? [String(vehicle.fuel_type)] : [];
        next.fuel_type_used = fuels.includes(previous.fuel_type_used) ? previous.fuel_type_used : fuels[0] ?? "";
        next.route_urban_highway_score = String(vehicle?.urban_highway_score ?? 3);
      }
      if (resource === "routes" && fieldKey === "driver_id" && !previous.driver_cost) {
        const driver = references.drivers?.find(item => String(item.id) === value);
        if (driver?.pay_per_day != null) next.driver_cost = String(driver.pay_per_day);
      }
      return next;
    });
  }

  async function remove(id: string) {
    if (!window.confirm("Excluir este registro?")) return;
    const result = await deleteObject(config.table,id);
    if (result.error) setError(result.error.message); else await load();
  }

  async function toggleActive(row: Row) {
    const id = String(row.id);
    const active = row.status === false;
    setActionBusyId(id); setError("");
    const result = await setObjectActive(config.table, id, active);
    if (result.error) setError(result.error.message);
    else await load();
    setActionBusyId(null);
  }

  return <div className="min-h-screen bg-slate-50"><Header/><main className="flex min-h-[calc(100vh-68px)] flex-col px-4 pb-24 pt-6 md:ml-64 md:min-h-screen md:px-5 md:pb-10">
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-blue-700">Operação</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{resource === "finances" ? "Financeiro" : config.title}</h1><p className="mt-2 text-sm text-slate-500">{config.description}</p></div><div className="flex flex-wrap gap-2">{resource==="maintenances"&&<><Link to="/manutencoes/previsoes" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 font-medium text-blue-700 shadow-sm"><ArrowUpRight size={17}/> Calcular CPK</Link>{isDeveloper&&<Link to="/manutencoes/regras" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-medium text-slate-700 shadow-sm">Regras globais</Link>}</>}<button onClick={()=>{setForm(resource==="routes"?{status:"pendente",route_periodicity:"esporadica"}:{});setRouteAnswers({});setEditingId(null);setFormOpen(true)}} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 font-medium text-white shadow-sm hover:bg-blue-800"><Plus size={18}/> Novo cadastro</button></div></div>
      <label className="mb-6 flex h-12 max-w-xl items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-slate-400 shadow-sm"><Search size={18}/><input value={query} onChange={e=>{setPage(0);setQuery(e.target.value)}} placeholder={`Buscar ${config.title.toLocaleLowerCase()}...`} className="w-full bg-transparent text-sm text-slate-800 outline-none"/></label>
      {resource === "finances" && <>
        <section aria-label="Balanço mensal" className="mb-4 rounded-xl border border-slate-300 bg-white p-3 shadow-sm sm:p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-bold text-slate-950">Balanço mensal</h2><label className="mt-2 flex items-center gap-2 text-base font-semibold text-slate-800">Mês<select value={financeMonth} onChange={event=>{setPage(0);setFinanceMonth(event.target.value)}} className="w-full rounded-xl border border-slate-300 bg-white px-3 sm:w-64">{financeMonths.map(month=><option key={month} value={month}>{new Date(`${month}-02T12:00:00`).toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}</option>)}</select></label></div><div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={()=>void exportFinanceCsv()} disabled={exporting} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-400 px-3 text-slate-900 disabled:opacity-50"><Download size={18}/> {exporting?"Exportando…":"Exportar mês"}</button><button type="button" onClick={()=>void exportFinanceCsv(true)} disabled={exporting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-white disabled:opacity-50"><Download size={18}/> {exporting?"Exportando…":"Exportar tudo"}</button></div></div><div className="mt-3 grid grid-cols-3 gap-2"><article className="rounded-lg bg-emerald-50 p-3"><p className="font-semibold text-slate-800">Entradas</p><p className="mt-1 text-lg font-bold text-emerald-900">{money(monthIncome)}</p></article><article className="rounded-lg bg-rose-50 p-3"><p className="font-semibold text-slate-800">Saídas</p><p className="mt-1 text-lg font-bold text-rose-900">{money(monthExpense)}</p></article><article className="rounded-lg bg-blue-50 p-3"><p className="font-semibold text-slate-800">Saldo</p><p className={`mt-1 text-lg font-bold ${monthIncome-monthExpense<0?"text-rose-900":"text-blue-900"}`}>{money(monthIncome-monthExpense)}</p></article></div></section>
        <section aria-label="Indicadores de manutenção" className="mb-4 rounded-xl border border-amber-200 bg-white p-3 shadow-sm sm:p-4"><details><summary className="flex cursor-pointer list-none items-center justify-between gap-3"><span><strong className="block text-lg text-slate-950">Manutenção prevista</strong><span className="block text-base text-slate-600">Estimativa das rotas com CPK calculável</span></span>{maintenanceIndicators&&!maintenanceIndicatorsBusy&&maintenanceIndicators.route_count>0&&<strong className="text-lg text-slate-900">{money(maintenanceIndicators.total_cost)}</strong>}</summary>{maintenanceIndicatorsBusy&&<p className="mt-3 rounded-lg bg-slate-50 p-3 text-base text-slate-700">Calculando…</p>}{maintenanceIndicatorsError&&<p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-base text-rose-900">{maintenanceIndicatorsError}</p>}{maintenanceIndicators&&!maintenanceIndicatorsBusy&&(maintenanceIndicators.route_count>0?<div className="mt-3"><p className="text-base text-slate-700">{maintenanceIndicators.route_count} rotas • {maintenanceIndicators.vehicle_count} veículos • {Number(maintenanceIndicators.route_km).toLocaleString("pt-BR")} km</p><p className="mt-1 text-base text-slate-600">Estimativa de reserva; não é lançamento financeiro.</p><details className="mt-3 rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer font-semibold text-slate-800">Ver por veículo</summary><div className="mt-2 overflow-x-auto"><table className="min-w-full text-left text-base"><thead className="bg-slate-100"><tr><th className="px-3 py-2">Veículo</th><th className="px-3 py-2">Categoria</th><th className="px-3 py-2">Rotas</th><th className="px-3 py-2">KM</th><th className="px-3 py-2">CPK</th><th className="px-3 py-2">Previsão</th></tr></thead><tbody className="divide-y divide-slate-200">{maintenanceIndicators.by_vehicle.map(vehicle=><tr key={vehicle.vehicle_id}><th className="px-3 py-2 font-semibold">{vehicle.model} • {vehicle.plate}</th><td className="px-3 py-2">{vehicleCategoryLabels[vehicle.vehicle_category] ?? vehicle.vehicle_category}</td><td className="px-3 py-2">{vehicle.route_count}</td><td className="px-3 py-2">{Number(vehicle.route_km).toLocaleString("pt-BR")}</td><td className="px-3 py-2">{money(vehicle.cpk)} / km</td><td className="px-3 py-2 font-semibold">{money(vehicle.maintenance_cost)}</td></tr>)}</tbody></table></div></details><details className="mt-2 rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer font-semibold text-slate-800">Ver por sistema e item</summary><ul className="mt-2 divide-y divide-slate-200">{maintenanceIndicators.by_system.map(system=><li key={`${system.vehicle_id}-${system.profile_id??system.system_code}`} className="flex flex-wrap justify-between gap-3 py-2"><span>{system.model} • {system.plate} — {system.name}: <strong>{system.component_name}</strong> ({vehicleCategoryLabels[system.vehicle_category] ?? system.vehicle_category}){system.component_reference&&<small className="block text-slate-600">Peça: {system.component_reference}</small>}</span><span className="text-right"><strong>{money(system.cpk)} / km</strong><small className="block text-slate-600">{money(system.maintenance_cost)} previsto</small></span></li>)}</ul></details></div>:<p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-base text-slate-700">Sem rotas com CPK calculável.</p>)}</details></section>
        <FinanceProjection vehicles={references.vehicles ?? []} routes={references.routes ?? []}/>
        <h2 className="mb-3 text-xl font-bold text-slate-950">Lançamentos de {new Date(`${financeMonth}-02T12:00:00`).toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}</h2>
      </>}
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {loadingRows && rows.length === 0 ? <p role="status" className="rounded-xl bg-white p-5 text-base text-slate-700">Carregando registros…</p> : visible.length ? <><div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block"><table className="min-w-full w-max text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th scope="col" className="whitespace-nowrap px-4 py-3">Registro</th>{config.display.map(key=>{const field=config.fields.find(item=>item.key===key);return <th key={key} scope="col" className="whitespace-nowrap px-4 py-3">{labels[key]??field?.label??key}</th>})}{resource==="routes"&&<th scope="col" className="whitespace-nowrap px-4 py-3">Resultado da rota</th>}<th scope="col" className="whitespace-nowrap px-3 py-3 text-center">Ações</th></tr></thead><tbody className="divide-y divide-slate-100">{visible.map(row=>{const generatedRouteFinance=resource==="finances"&&Boolean(row.route_finance_category);const routeMargin=Number(row.occurrence_count??1)*(Number(row.price_charged??0)-Number(row.fuel_cost??0)-Number(row.maintenance_cost??0)-Number(row.driver_cost??0)-Number(row.other_costs??0));return <tr key={String(row.id)} className="align-top hover:bg-slate-50/70"><th scope="row" className="max-w-64 px-4 py-3 font-medium text-slate-900">{titleFor(row)}</th>{config.display.map(key=>{const field=config.fields.find(item=>item.key===key);const value=field?.reference?refLabel(field,row[key]):detailText(key,row[key],row);return <td key={key} className="max-w-72 px-4 py-3 text-slate-600">{value}</td>})}{resource==="routes"&&<td className={`whitespace-nowrap px-4 py-3 font-semibold ${routeMargin<0?"text-rose-700":"text-emerald-700"}`}>{money(routeMargin)}</td>}<td className="px-3 py-2"><div className="flex items-center justify-center gap-2">{!generatedRouteFinance&&<><button type="button" aria-label="Editar registro" title="Editar" onClick={()=>void edit(row)} className="inline-flex min-h-14 min-w-14 items-center justify-center rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100"><Pencil aria-hidden="true" size={18}/></button>{canToggleActive&&<button type="button" aria-label={row.status === false ? "Ativar cadastro" : "Desativar cadastro"} title={row.status === false ? "Ativar" : "Desativar"} disabled={actionBusyId===String(row.id)} onClick={()=>void toggleActive(row)} className="inline-flex min-h-14 min-w-14 items-center justify-center rounded-xl border border-amber-300 text-amber-800 hover:bg-amber-50 disabled:opacity-50"><Power aria-hidden="true" size={18}/></button>}<button type="button" aria-label="Excluir registro" title="Excluir" onClick={()=>void remove(String(row.id))} className="inline-flex min-h-14 min-w-14 items-center justify-center rounded-xl border border-rose-300 text-rose-800 hover:bg-rose-50"><Trash2 aria-hidden="true" size={18}/></button></>}</div></td></tr>})}</tbody></table></div><div className="grid gap-3 md:hidden">{visible.map(row=>{const generatedRouteFinance=resource==="finances"&&Boolean(row.route_finance_category);const routeMargin=Number(row.occurrence_count??1)*(Number(row.price_charged??0)-Number(row.fuel_cost??0)-Number(row.maintenance_cost??0)-Number(row.driver_cost??0)-Number(row.other_costs??0));return <article key={String(row.id)} className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm"><h2 className="break-words text-lg font-bold text-slate-950">{titleFor(row)}</h2><dl className="mt-3 divide-y divide-slate-200">{config.display.map(key=>{const field=config.fields.find(item=>item.key===key);const value=field?.reference?refLabel(field,row[key]):detailText(key,row[key],row);return <div key={key} className="flex flex-wrap justify-between gap-2 py-2 text-base"><dt className="font-semibold text-slate-800">{labels[key]??field?.label??key}</dt><dd className="max-w-[60%] break-words text-right text-slate-900">{value}</dd></div>})}</dl>{resource==="routes"&&<p className={`mt-3 text-base font-bold ${routeMargin<0?"text-rose-800":"text-emerald-800"}`}>Resultado da rota: {money(routeMargin)}</p>}{!generatedRouteFinance&&<div className="mt-4 flex gap-3"><button type="button" aria-label="Editar registro" title="Editar" onClick={()=>void edit(row)} className="inline-flex min-h-14 min-w-14 items-center justify-center rounded-xl border border-slate-400 text-slate-900"><Pencil aria-hidden="true" size={20}/></button>{canToggleActive&&<button type="button" aria-label={row.status === false ? "Ativar cadastro" : "Desativar cadastro"} title={row.status === false ? "Ativar" : "Desativar"} disabled={actionBusyId===String(row.id)} onClick={()=>void toggleActive(row)} className="inline-flex min-h-14 min-w-14 items-center justify-center rounded-xl border border-amber-300 text-amber-800 disabled:opacity-50"><Power aria-hidden="true" size={20}/></button>}<button type="button" aria-label="Excluir registro" title="Excluir" onClick={()=>void remove(String(row.id))} className="inline-flex min-h-14 min-w-14 items-center justify-center rounded-xl border border-rose-300 text-rose-800"><Trash2 aria-hidden="true" size={20}/></button></div>}</article>})}</div></> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><p className="font-medium text-slate-700">{resource==="finances"?"Nenhum lançamento neste mês.":"Nenhum registro encontrado"}</p><p className="mt-1 text-sm text-slate-500">{resource==="finances"?"Escolha outro mês ou toque em Novo cadastro para incluir um lançamento.":"Cadastre o primeiro item ou ajuste a busca."}</p></div>}
      {rows.length > 0 && <nav aria-label="Paginação da tabela" className="mt-auto flex items-center justify-between gap-3 pt-5"><button type="button" disabled={page === 0 || loadingRows} onClick={() => setPage(value => Math.max(0, value - 1))} className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 font-semibold text-slate-800 disabled:opacity-40">Anterior</button><p aria-live="polite" className="text-sm text-slate-600">Página {page + 1}{loadingRows ? " • carregando" : ""}</p><button type="button" disabled={!hasMore || loadingRows} onClick={() => setPage(value => value + 1)} className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 font-semibold text-slate-800 disabled:opacity-40">Próxima</button></nav>}
    </div>
  </main>
  {formOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setFormOpen(false)}}><section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"><div className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-semibold text-slate-900">{editingId?"Editar cadastro":"Novo cadastro"}</h2><p className="mt-1 text-sm text-slate-500">{config.title}</p></div><button type="button" onClick={()=>setFormOpen(false)} aria-label="Fechar" className="flex min-h-14 items-center gap-2 rounded-lg border border-slate-300 px-3 text-slate-900 hover:bg-slate-100"><X aria-hidden="true" size={20}/> Fechar</button></div>
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">{config.fields.filter(field=>field.key!=="other_frequency_count"||form.route_periodicity==="outros").map(field=><label key={field.key} className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">{field.label}{field.reference?<select required={field.required} value={form[field.key]??""} onChange={e=>changeReference(field.key,e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3"><option value="">Selecione</option>{(references[field.reference]??[]).filter(ref=>resource!=="routes"||ref.status!==false||String(form[field.key]??"")===String(ref.id)).map(ref=><option key={String(ref.id)} value={String(ref.id)} disabled={resource==="routes"&&ref.status===false&&String(form[field.key]??"")!==String(ref.id)}>{referenceTitle(field.reference,ref)}{ref.plate?` • ${ref.plate}`:""}{ref.status===false?" (inativo)":""}</option>)}</select>:field.type==="select"?<select required={field.required} value={form[field.key]??""} onChange={e=>changeReference(field.key,e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3"><option value="">Selecione</option>{(field.key==="fuel_type_used"?vehicleFuelOptions:field.options??[]).map(option=><option key={option} value={option}>{optionLabels[option]??option}</option>)}</select>:<input required={field.required} type={field.type==="range"?"range":field.type??"text"} min={field.type==="range"?"1":field.type==="number"?(field.key==="amount"?"0.01":"0"):undefined} max={field.type==="range"?"5":undefined} step={field.type==="range"?"1":field.type==="number"?(field.key==="amount"||field.key.includes("cost")||field.key==="price_charged"||field.key==="pay_per_day"?"0.01":"1"):undefined} value={form[field.key]??""} onChange={e=>changeReference(field.key,e.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/>}</label>)}
      {resource === "routes" && form.vehicle_id && <fieldset className="col-span-full rounded-xl border border-blue-100 bg-blue-50/40 p-4"><legend className="px-2 font-semibold text-slate-900">Condições de uso para o CPK</legend><p className="mb-4 text-sm text-slate-600">As respostas ficam salvas nesta rota e serão usadas no cálculo do CPK. {routeVehicle?.vehicle_category ? `Categoria: ${vehicleCategoryLabels[String(routeVehicle.vehicle_category) as VehicleCategory] ?? routeVehicle.vehicle_category}.` : "Defina a categoria do veículo para carregar as perguntas correspondentes."}</p>{routeQuestions.length ? <div className="grid gap-4 sm:grid-cols-2">{routeQuestions.map((question) => <label key={question.id} className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">{question.question}{question.answer_type === "number" ? <><input required={question.required} type="number" value={routeAnswers[question.id] ?? ""} onChange={(event) => setRouteAnswers((answers) => ({ ...answers, [question.id]: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3"/><span className="text-xs font-normal text-slate-500">{question.options.map((option) => `${option.min}–${option.max}: ${option.label} (×${option.multiplier})`).join(" • ")}</span></> : <select required={question.required} value={routeAnswers[question.id] ?? ""} onChange={(event) => setRouteAnswers((answers) => ({ ...answers, [question.id]: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3"><option value="">Selecione</option>{question.options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label} (×{option.multiplier})</option>)}</select>}<span className="text-xs font-normal text-slate-400">{routeRuleCatalog?.systems.find((system) => system.system_code === question.system_code)?.name}</span></label>)}</div> : <p className="text-sm text-slate-500">Nenhuma pergunta ativa configurada para esta categoria.</p>}</fieldset>}
      <div className="col-span-full mt-3 flex justify-end gap-3 border-t border-slate-100 pt-4"><Button type="outline" onClick={()=>setFormOpen(false)}>Cancelar</Button><button disabled={busy} className="rounded-xl bg-blue-700 px-5 py-2.5 font-medium text-white disabled:opacity-50">{busy?"Salvando…":"Salvar"}</button></div></form>
  </section></div>}
  </div>;
}

