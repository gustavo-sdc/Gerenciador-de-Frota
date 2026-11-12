import { Pencil, Power, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../../components/Header/Header";
import Input from "../../components/Input/Input";
import Button from "../../components/Button/Button";
import { getObject, setObjectActive, deleteObject } from "../../lib/controller";
import { AuthContext } from "../../hooks/authContextValue";

interface Vehicle {
  id: string;
  brand?: string;
  model: string;
  plate: string;
  year: number;
  color: string;
  fuel_type: string;
  km_atual: number;
  status: boolean;
  operation_type?: string;
  starts_per_day?: number;
  urban_highway_score?: number;
}

function Frota() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const auth = useContext(AuthContext);
  const navigate = useNavigate();

  const tenant_id = auth.tenantId;
  const [error, setError] = useState("");
  const loadVehicles = useCallback(async (searchTerm = search, pageNumber = page) => {
    if (!tenant_id) return;
    setLoading(true);

    const result = await getObject<Vehicle>(tenant_id, "vehicles", {
      search: searchTerm,
      limit: 50,
      offset: pageNumber * 50,
    });

    if (!result.error && result.data) {
      setVehicles(result.data);
      setHasMore(Boolean(result.has_more));
      setError("");
    } else if (result.error) setError(result.error.message);
    setLoading(false);
  }, [tenant_id, search, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadVehicles(); }, search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [loadVehicles, search]);

  async function handleSearch(value: string) {
    setPage(0);
    setSearch(value);
  }

  async function handleToggleActive(id: string) {
    setLoadingId(id);
    const vehicle = vehicles.find((item) => item.id === id);
    const result = await setObjectActive("vehicles", id, vehicle?.status === false);
    if (result.error) setError(result.error.message);
    await loadVehicles(search);
    setLoadingId(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este veículo?")) return;

    setLoadingId(id);
    const result = await deleteObject("vehicles", id);
    if (result.error) setError(result.error.message);
    await loadVehicles(search);
    setLoadingId(null);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="flex min-h-[calc(100vh-68px)] flex-col px-4 pb-24 pt-6 md:ml-64 md:min-h-screen md:px-5 md:pb-10">
      <section className="mx-auto flex w-full max-w-none flex-1 flex-col">
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-sm font-medium text-blue-700">Operação</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Frota</h1><p className="mt-2 text-sm text-slate-500">Cadastre e acompanhe os veículos da operação.</p></div>
          <div className="flex flex-wrap gap-2"><Button type="primary" to="/frota/novo"><Plus className="mr-2" />Novo veículo</Button></div>
        </div>
        {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-base text-rose-800">{error}</p>}

        {/* SEARCH */}
        <div className="mb-6 w-full max-w-xl">
          <Input
            label="Pesquisar por marca, modelo ou placa"
            name="pesquisar"
            type="text"
            theme="light"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        {loading && vehicles.length === 0 && <p role="status" className="mb-3 rounded-xl bg-white p-5 text-base text-slate-700">Carregando veículos…</p>}
        <div className="min-w-0 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[720px] w-full text-left text-sm md:min-w-[1040px]">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Veículo</th>
                <th scope="col" className="px-4 py-3">Placa</th>
                <th scope="col" className="hidden px-4 py-3 md:table-cell">Ano</th>
                <th scope="col" className="hidden px-4 py-3 md:table-cell">Combustível</th>
                <th scope="col" className="px-4 py-3">KM atual</th>
                <th scope="col" className="hidden px-4 py-3 md:table-cell">Serviço</th>
                <th scope="col" className="hidden px-4 py-3 md:table-cell">Uso</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-3 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vehicles.map((vehicle) => {
                const isInactive = !vehicle.status;
                const useType = vehicle.urban_highway_score === undefined
                  ? "Misto"
                  : vehicle.urban_highway_score <= 2
                    ? "Cidade"
                    : vehicle.urban_highway_score >= 4
                      ? "Estrada"
                      : "Misto";

                return (
                  <tr key={vehicle.id} className={`align-middle hover:bg-slate-50 ${isInactive ? "text-slate-400" : "text-slate-700"}`}>
                    <th scope="row" className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{vehicle.brand ? `${vehicle.brand} ` : ""}{vehicle.model}</th>
                    <td className="whitespace-nowrap px-4 py-3">{vehicle.plate}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 md:table-cell">{vehicle.year || "—"}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 capitalize md:table-cell">{vehicle.fuel_type || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{Number(vehicle.km_atual).toLocaleString("pt-BR")} km</td>
                    <td className="hidden max-w-48 px-4 py-3 md:table-cell">{vehicle.operation_type ?? "Não informado"}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 md:table-cell">{useType} ({vehicle.urban_highway_score ?? 3}/5)</td>
                    <td className="whitespace-nowrap px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isInactive ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>{isInactive ? "Inativo" : "Ativo"}</span></td>
                    <td className="px-3 py-2"><div className="flex items-center justify-center gap-2"><button type="button" aria-label={`Editar ${vehicle.model}`} title="Editar" onClick={() => navigate(`/frota/novo/${vehicle.id}`)} className="inline-flex min-h-14 min-w-14 items-center justify-center rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100"><Pencil aria-hidden="true" size={20}/></button><button type="button" aria-label={`${isInactive ? "Ativar" : "Desativar"} ${vehicle.model}`} title={loadingId === vehicle.id ? "Processando…" : isInactive ? "Ativar" : "Desativar"} onClick={() => void handleToggleActive(vehicle.id)} disabled={loadingId === vehicle.id} className="inline-flex min-h-14 min-w-14 items-center justify-center rounded-xl border border-amber-300 text-amber-800 hover:bg-amber-50 disabled:opacity-50"><Power aria-hidden="true" size={20}/></button><button type="button" aria-label={`Excluir ${vehicle.model}`} title={loadingId === vehicle.id ? "Processando…" : "Excluir"} onClick={() => void handleDelete(vehicle.id)} disabled={loadingId === vehicle.id} className="inline-flex min-h-14 min-w-14 items-center justify-center rounded-xl border border-rose-300 text-rose-800 hover:bg-rose-50 disabled:opacity-50"><Trash2 aria-hidden="true" size={20}/></button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {vehicles.length === 0 && !loading && (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
            <p className="font-bold text-slate-900">{search ? "Nenhum veículo corresponde à busca." : "Sua frota ainda está vazia."}</p>
            <p className="mt-2 text-base text-slate-700">{search ? "Altere o texto da busca e tente novamente." : "Toque em “Novo veículo” para cadastrar o primeiro."}</p>
          </div>
        )}
        {(vehicles.length > 0 || page > 0 || hasMore) && <nav aria-label="Paginação da frota" className="mt-auto flex items-center justify-between gap-3 pt-5"><button type="button" disabled={page === 0 || loading} onClick={() => setPage(value => Math.max(0, value - 1))} className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 font-semibold text-slate-800 disabled:opacity-40">Anterior</button><p aria-live="polite" className="text-sm text-slate-600">Página {page + 1}{loading ? " • carregando" : ""}</p><button type="button" disabled={!hasMore || loading} onClick={() => setPage(value => value + 1)} className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 font-semibold text-slate-800 disabled:opacity-40">Próxima</button></nav>}
      </section>
      </main>
    </div>
  );
}

export default Frota;
