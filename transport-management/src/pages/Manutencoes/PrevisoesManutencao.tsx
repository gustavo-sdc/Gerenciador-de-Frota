import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Settings2 } from "lucide-react";
import Header from "../../components/Header/Header";
import { MaintenanceForecast } from "../../components/ResourceManager";
import { AuthContext } from "../../hooks/authContextValue";
import { getObject } from "../../lib/controller";
import { getDeveloperStatus } from "../../lib/maintenanceRules";

type Row = Record<string, unknown>;

export default function PrevisoesManutencao() {
  const { tenantId } = useContext(AuthContext);
  const [vehicles, setVehicles] = useState<Row[]>([]);
  const [routes, setRoutes] = useState<Row[]>([]);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!tenantId) { setLoading(false); return; }
    void Promise.all([getObject<Row>(tenantId, "vehicles", { limit: 200 }), getObject<Row>(tenantId, "routes", { limit: 200 })]).then(([vehicleResult, routeResult]) => {
      if (!active) return;
      if (vehicleResult.error) setError(vehicleResult.error.message);
      else setVehicles(vehicleResult.data ?? []);
      if (routeResult.error) setError(routeResult.error.message);
      else setRoutes(routeResult.data ?? []);
      setLoading(false);
    });
    void getDeveloperStatus().then((value) => { if (active) setIsDeveloper(value); });
    return () => { active = false; };
  }, [tenantId]);

  return <div className="min-h-screen bg-slate-50"><Header/><main className="px-4 pb-24 pt-6 md:ml-64 md:px-5 md:pb-10"><div className="mx-auto max-w-none">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><Link to="/manutencoes" className="inline-flex items-center gap-2 text-sm font-medium text-blue-700"><ArrowLeft size={16}/> Manutenções</Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Cálculo de CPK</h1><p className="mt-2 text-sm text-slate-600">Calcule o custo de manutenção por quilômetro. A previsão financeira fica no módulo Financeiro.</p></div>{isDeveloper&&<Link to="/manutencoes/regras" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"><Settings2 size={16}/> Regras globais</Link>}</div>
    {error&&<p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {loading?<p className="rounded-xl bg-white p-5 text-sm text-slate-600">Carregando dados…</p>:vehicles.length?<MaintenanceForecast vehicles={vehicles} routes={routes} standalone/>:<p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">Cadastre um veículo antes de calcular previsões.</p>}
  </div></main></div>;
}
