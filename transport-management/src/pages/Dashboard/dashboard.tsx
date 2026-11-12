import { useCallback, useContext, useEffect, useState } from "react";
import { MapPinned, Truck, Wallet, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "../../components/Header/Header";
import { AuthContext } from "../../hooks/authContextValue";
import { getDashboardSummary } from "../../lib/controller";

const indicators = [
  { key: "activeVehicles", label: "Veículos ativos", href: "/frota", icon: Truck },
  { key: "pendingRoutes", label: "Rotas pendentes", href: "/rotas", icon: MapPinned },
  { key: "dueMaintenances", label: "Manutenções próximas", href: "/manutencoes", icon: Wrench },
  { key: "financeNet", label: "Saldo financeiro", href: "/financeiro", icon: Wallet, currency: true },
] as const;

type Insights = { activeVehicles: number; pendingRoutes: number; dueMaintenances: number; financeNet: number; completedMargin: number };
const emptyInsights: Insights = { activeVehicles: 0, pendingRoutes: 0, dueMaintenances: 0, financeNet: 0, completedMargin: 0 };

export default function MainDashboard() {
  const { tenantId } = useContext(AuthContext);
  const [insights, setInsights] = useState<Insights>(emptyInsights);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!tenantId) return;
    const result = await getDashboardSummary();
    if (result.error) { setError(result.error.message); return; }
    setCounts(result.data?.counts ?? {});
    setInsights(result.data?.insights ?? emptyInsights);
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  return <div className="min-h-screen bg-slate-50"><Header/><main className="px-4 pb-24 pt-5 md:ml-64 md:px-5 md:pb-10"><div className="mx-auto max-w-none">
    <header className="mb-5"><h1 className="text-2xl font-bold tracking-tight text-slate-900">Visão geral</h1><p className="mt-1 text-base text-slate-600">Resumo da operação.</p></header>
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-base text-red-800">{error}</p>}
    <section aria-label="Indicadores principais" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {indicators.map(({ key, label, href, icon: Icon, ...format }) => {
        const value = insights[key];
        const display = "currency" in format && format.currency
          ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
          : value.toLocaleString("pt-BR");
        return <Link key={key} to={href} className="flex min-h-20 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow">
          <span className="shrink-0 rounded-lg bg-slate-100 p-2 text-slate-700"><Icon aria-hidden="true" size={18}/></span>
          <span className="min-w-0"><span className="block text-base leading-tight text-slate-600">{label}</span><strong className="mt-1 block truncate text-xl font-bold text-slate-900">{display}</strong></span>
        </Link>;
      })}
    </section>
    <section aria-label="Cadastros e resultado das rotas" className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {[["Motoristas", counts.drivers], ["Clientes", counts.clients], ["Rotas cadastradas", counts.routes], ["Lançamentos", counts.finances]].map(([label, value]) => <div key={String(label)}><p className="text-base text-slate-600">{label}</p><p className="text-lg font-bold text-slate-900">{Number(value ?? 0).toLocaleString("pt-BR")}</p></div>)}
      </div>
      <p className="mt-3 border-t border-slate-100 pt-3 text-base text-slate-700">Margem das rotas concluídas: <strong className={insights.completedMargin < 0 ? "text-rose-800" : "text-slate-900"}>{insights.completedMargin.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></p>
    </section>
  </div></main></div>;
}
