import { useParams, useNavigate } from "react-router-dom";
import Header from "../../components/Header/Header";
import Input from "../../components/Input/Input";
import Button from "../../components/Button/Button";
import React, { useCallback, useEffect, useState } from "react";
import { getObject, addObject, updateObject } from "../../lib/controller";
import { AuthContext } from "../../hooks/authContextValue";
import { vehicleCategoryLabels, type VehicleCategory } from "../../lib/controller";

const operationTypes = [
  ["entrega_porta_a_porta", "Entrega porta a porta"], ["urbano", "Transporte urbano"],
  ["rodoviario", "Transporte rodoviário"], ["obras_campo", "Obras ou campo"],
  ["passageiros", "Transporte de passageiros"], ["coleta", "Coleta"], ["outro", "Outro"],
];

export default function GestaoFrota() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tenantId } = React.useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fuelEfficiencies, setFuelEfficiencies] = useState<Record<string, { city: string; highway: string }>>({});
  const [vehicle, setVehicle] = useState<Record<string, string | boolean>>({
    brand: "", model: "", plate: "", year: "", color: "", fuel_type: "", vehicle_category: "", km_aquisicao: "", km_atual: "", status: true,
    operation_type: "", service_description: "", starts_per_day: "", operating_days_per_week: "5",
    average_daily_km: "", engine_version: "", start_cycles_total: "",
    urban_highway_score: "3",
    payload_capacity_kg: "",
  });

  const isEdit = Boolean(id);
  const loadVehicle = useCallback(async () => {
    if (!tenantId || !id) return;
    const { data, error } = await getObject<Record<string, string | number | boolean>>(tenantId, "vehicles", { id });
    if (error) setError(error.message);
    else if (data?.length) {
      const v = data[0];
      setVehicle({
        brand: String(v.brand ?? ""), model: String(v.model ?? ""), plate: String(v.plate ?? ""), year: String(v.year ?? ""),
        color: String(v.color ?? ""), fuel_type: String(v.fuel_type ?? ""), vehicle_category: String(v.vehicle_category ?? ""),
        km_aquisicao: String(v.km_aquisicao ?? ""), km_atual: String(v.km_atual ?? ""),
        status: Boolean(v.status), operation_type: String(v.operation_type ?? ""),
        service_description: String(v.service_description ?? ""), starts_per_day: String(v.starts_per_day ?? ""),
        operating_days_per_week: String(v.operating_days_per_week ?? 5), average_daily_km: String(v.average_daily_km ?? ""),
        engine_version: String(v.engine_version ?? ""), start_cycles_total: String(v.start_cycles_total ?? ""),
        urban_highway_score: String(v.urban_highway_score ?? 3),
        payload_capacity_kg: String(v.payload_capacity_kg ?? ""),
      });
      setFuelEfficiencies(Object.fromEntries(Object.entries((v.fuel_efficiencies ?? {}) as unknown as Record<string, { city_km_per_unit?: number; highway_km_per_unit?: number }>).map(([fuel, values]) => [fuel, { city: String(values.city_km_per_unit ?? ""), highway: String(values.highway_km_per_unit ?? "") }])));
    }
  }, [tenantId, id]);

  useEffect(() => { if (isEdit) void loadVehicle(); }, [isEdit, loadVehicle]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setVehicle((prev) => ({ ...prev, [name]: value }));
  }

  function requiredFuelTypes() {
    return vehicle.fuel_type === "flex" ? ["gasolina", "etanol"] : vehicle.fuel_type ? [String(vehicle.fuel_type)] : [];
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!tenantId) { setError("Empresa não carregada. Entre novamente."); return; }
    if (!vehicle.operation_type) { setError("Informe qual é o serviço principal deste veículo."); return; }
    if (!vehicle.vehicle_category) { setError("Selecione a categoria do veículo para usar a regra de CPK correta."); return; }
    if (!vehicle.payload_capacity_kg || Number(vehicle.payload_capacity_kg) < 0) { setError("Informe a capacidade total de carga do veículo."); return; }
    for (const fuel of requiredFuelTypes()) {
      const consumption = fuelEfficiencies[fuel];
      if (!consumption?.city || !consumption?.highway || Number(consumption.city) <= 0 || Number(consumption.highway) <= 0) {
        setError(`Informe o consumo na cidade e na estrada para ${fuel}.`); return;
      }
    }
    if (!/^[A-Z]{3}-?\d[A-Z0-9]-?\d{2}$/i.test(String(vehicle.plate).trim())) {
      setError("Informe uma placa válida (ABC1234 ou ABC1D23)."); return;
    }
    if (Number(vehicle.km_atual) < Number(vehicle.km_aquisicao)) {
      setError("A quilometragem atual não pode ser menor que a quilometragem de aquisição."); return;
    }
    if (vehicle.year && (Number(vehicle.year) < 1900 || Number(vehicle.year) > new Date().getFullYear() + 1)) {
      setError("Informe um ano de fabricação válido."); return;
    }
    setLoading(true); setError("");
    const payload: Record<string, unknown> = {
      ...vehicle,
      year: vehicle.year ? Number(vehicle.year) : null,
      km_atual: Number(vehicle.km_atual), km_aquisicao: Number(vehicle.km_aquisicao),
      operating_days_per_week: Number(vehicle.operating_days_per_week || 5),
      starts_per_day: vehicle.starts_per_day === "" ? null : Number(vehicle.starts_per_day),
      average_daily_km: vehicle.average_daily_km === "" ? null : Number(vehicle.average_daily_km),
      start_cycles_total: vehicle.start_cycles_total === "" ? 0 : Number(vehicle.start_cycles_total),
      urban_highway_score: Number(vehicle.urban_highway_score),
      payload_capacity_kg: Number(vehicle.payload_capacity_kg),
      fuel_efficiencies: Object.fromEntries(requiredFuelTypes().map((fuel) => [fuel, { city_km_per_unit: Number(fuelEfficiencies[fuel].city), highway_km_per_unit: Number(fuelEfficiencies[fuel].highway) }])),
    };
    const result = isEdit ? await updateObject("vehicles", id!, payload) : await addObject("vehicles", payload);
    setLoading(false);
    if (result.error) setError(result.error.message); else navigate("/frota");
  }

  const labelClass = "flex flex-col gap-2 my-4 w-full text-gray-700";
  const selectClass = "rounded-sm bg-gray-100 p-2 text-gray-900";
  return <main className="flex min-h-screen flex-col"><Header />
    <section className="min-w-0 max-w-4xl px-4 py-8 pb-24 md:ml-64 md:px-12 md:pb-10">
      <h2 className="mb-2 text-xl font-bold">{isEdit ? "Editar veículo" : "Novo veículo"}</h2>
      <p className="mb-6 text-sm text-gray-500">O perfil de uso ajuda a prever desgaste e planejar inspeções.</p>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input type="text" label="Marca" name="brand" value={String(vehicle.brand)} onChange={handleChange} required />
        <Input type="text" label="Modelo" name="model" value={String(vehicle.model)} onChange={handleChange} required />
        <Input type="text" label="Placa" name="plate" value={String(vehicle.plate)} onChange={handleChange} required />
        <Input type="number" label="Ano" name="year" value={String(vehicle.year)} onChange={handleChange} />
        <Input type="text" label="Cor" name="color" value={String(vehicle.color)} onChange={handleChange} />
        <label className={labelClass}>Combustível<select name="fuel_type" value={String(vehicle.fuel_type)} onChange={handleChange} className={selectClass}><option value="">Selecione</option>{["gasolina", "diesel", "etanol", "gnv", "flex"].map(v => <option key={v} value={v}>{v}</option>)}</select></label>
        <Input type="number" label="KM de aquisição" name="km_aquisicao" value={String(vehicle.km_aquisicao)} onChange={handleChange} required />
        <Input type="number" label="KM atual" name="km_atual" value={String(vehicle.km_atual)} onChange={handleChange} required />
        <Input type="number" label="Capacidade total de carga (kg)" name="payload_capacity_kg" value={String(vehicle.payload_capacity_kg ?? "")} onChange={handleChange} required />
        {requiredFuelTypes().map((fuel) => <React.Fragment key={fuel}><div className="col-span-full border-t border-gray-200 pt-3"><h3 className="font-semibold text-gray-800">Consumo com {fuel}</h3><p className="text-sm text-gray-500">Informe quilômetros por litro{fuel === "gnv" ? " ou m³" : ""}.</p></div><Input type="number" label={`Cidade (km/${fuel === "gnv" ? "m³" : "L"})`} name={`${fuel}_city`} value={fuelEfficiencies[fuel]?.city ?? ""} onChange={(event) => setFuelEfficiencies((previous) => ({ ...previous, [fuel]: { ...previous[fuel], city: event.target.value } }))} required min="0.01" step="0.01" /><Input type="number" label={`Estrada (km/${fuel === "gnv" ? "m³" : "L"})`} name={`${fuel}_highway`} value={fuelEfficiencies[fuel]?.highway ?? ""} onChange={(event) => setFuelEfficiencies((previous) => ({ ...previous, [fuel]: { ...previous[fuel], highway: event.target.value } }))} required min="0.01" step="0.01" /></React.Fragment>)}
        <label className={labelClass}>Categoria do veículo<select required name="vehicle_category" value={String(vehicle.vehicle_category)} onChange={handleChange} className={selectClass}><option value="">Selecione a categoria</option>{(Object.entries(vehicleCategoryLabels) as [VehicleCategory,string][]).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><span className="text-xs text-gray-500">Define os custos e a vida útil usados no CPK.</span></label>

        <div className="col-span-full border-t border-gray-200 pt-4">
          <h3 className="font-medium text-gray-800">Como este veículo trabalha?</h3>
          <p className="mt-1 text-sm text-gray-500">Qual serviço ele realiza? O uso intenso em paradas frequentes muda o desgaste de partida, pneus, freios e suspensão.</p>
        </div>
        <label className={labelClass}>Serviço principal<select required name="operation_type" value={String(vehicle.operation_type)} onChange={handleChange} className={selectClass}><option value="">Selecione</option>{operationTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <Input type="text" label="Versão do motor (se souber)" name="engine_version" value={String(vehicle.engine_version)} onChange={handleChange} />
        <label className={`${labelClass} md:col-span-2`}>Descreva a rotina de trabalho<textarea name="service_description" value={String(vehicle.service_description)} onChange={handleChange} rows={3} placeholder="Ex.: entrega porta a porta, cerca de 35 paradas por dia" className="rounded-sm bg-gray-100 p-3 text-gray-900" /></label>
        <label className="my-4 flex w-full flex-col gap-3 text-gray-700 md:col-span-2">Onde o veículo trabalha com mais frequência?
          <div className="flex items-center justify-between text-sm"><span>Cidade</span><span className="font-semibold text-blue-700">{vehicle.urban_highway_score}</span><span>Estrada</span></div>
          <input aria-label="Predominância entre cidade e estrada, de 1 a 5" type="range" name="urban_highway_score" min="1" max="5" step="1" required value={String(vehicle.urban_highway_score)} onChange={handleChange} className="w-full accent-blue-700" />
          <div className="flex justify-between px-1 text-xs text-gray-500"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
          <p className="text-xs text-gray-500">1 = quase sempre na cidade · 3 = uso misto · 5 = quase sempre na estrada</p>
        </label>
        <Input type="number" label="Partidas por dia (estimativa)" name="starts_per_day" value={String(vehicle.starts_per_day)} onChange={handleChange} />
        <Input type="number" label="Dias de operação por semana" name="operating_days_per_week" value={String(vehicle.operating_days_per_week)} onChange={handleChange} required />
        <Input type="number" label="KM médio por dia (opcional)" name="average_daily_km" value={String(vehicle.average_daily_km)} onChange={handleChange} />
        <Input type="number" label="Ciclos de partida acumulados (se souber)" name="start_cycles_total" value={String(vehicle.start_cycles_total)} onChange={handleChange} />
        {vehicle.status === false && <p className="mt-4 text-sm text-red-500">Este veículo está inativo e não pode ser editado.</p>}
        <div className="mt-6 flex justify-end gap-3 md:col-span-2"><Button type="secondary" htmlType="button" onClick={() => navigate("/frota")}>Cancelar</Button><Button type="primary" htmlType="submit" disabled={loading || vehicle.status === false}>{loading ? "Salvando..." : isEdit ? "Atualizar" : "Cadastrar"}</Button></div>
      </form>
    </section>
  </main>;
}
