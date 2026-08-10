import { Plus } from "lucide-react";
import React, { useEffect, useState, useContext } from "react";
import Header from "../../components/Header/Header";
import Input from "../../components/Input/Input";
import Button from "../../components/Button/Button";
import Card from "../../components/Card/Card";
import { getObject, deactiveObject, deleteObject } from "../../lib/controller";
import { AuthContext } from "../../hooks/authContext";

interface Vehicle {
  id: string;
  model: string;
  plate: string;
  year: number;
  color: string;
  fuel_type: string;
  km_atual: number;
  status: "active" | "inactive";
}

function Frota() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // 🔐 Tenant real vindo do contexto
  const auth = useContext(AuthContext);
  const tenant_id = auth.tenantId;

  async function loadVehicles(searchTerm = "") {
    if (!tenant_id) return;

    const { data, error } = await getObject(tenant_id, "vehicles", {
      search: searchTerm,
    });

    if (!error && data) {
      setVehicles(data);
    }
  }

  useEffect(() => {
    loadVehicles();
  }, [tenant_id]);

  async function handleSearch(value: string) {
    setSearch(value);
    loadVehicles(value);
  }

  async function handleDeactivate(id: string) {
    setLoadingId(id);
    await deactiveObject("vehicles", id);
    await loadVehicles(search);
    setLoadingId(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este veículo?")) return;

    setLoadingId(id);
    await deleteObject("vehicles", id);
    await loadVehicles(search);
    setLoadingId(null);
  }

  return (
    <main className="flex min-h-screen flex-col">
      <Header />

      <section className="w-full px-4 py-4 md:px-20">
        {/* TÍTULO + CTA */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-xl font-light">Frota</h2>

          <Button type="primary" to="/frota/novo">
            <Plus className="mr-2" />
            Novo veículo
          </Button>
        </div>

        {/* SEARCH */}
        <div className="mb-4 w-full">
          <Input
            label="Pesquisar por modelo ou placa"
            name="pesquisar"
            type="text"
            theme="light"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        {/* CARDS */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((vehicle) => {
            const isInactive = vehicle.status === "inactive";

            return (
              <Card
                key={vehicle.id}
                id={vehicle.id}
                title={`${vehicle.model} • ${vehicle.plate}`}
                className={isInactive ? "opacity-50 grayscale" : ""}
                details={[
                  { details: `Ano: ${vehicle.year}` },
                  { details: `Cor: ${vehicle.color}` },
                  { details: `Combustível: ${vehicle.fuel_type}` },
                  { details: `KM Atual: ${vehicle.km_atual}` },
                  {
                    details: `Status: ${isInactive ? "Inativo" : "Ativo"}`,
                  },
                ]}
                actions={[
                  !isInactive && {
                    label:
                      loadingId === vehicle.id
                        ? "Processando..."
                        : "Desativar",
                    onClick: () => handleDeactivate(vehicle.id),
                    disabled: loadingId === vehicle.id,
                  },
                  {
                    label:
                      loadingId === vehicle.id
                        ? "Processando..."
                        : "Excluir",
                    danger: true,
                    onClick: () => handleDelete(vehicle.id),
                    disabled: loadingId === vehicle.id,
                  },
                ].filter(Boolean)}
              />
            );
          })}
        </div>

        {vehicles.length === 0 && (
          <p className="mt-10 text-center text-gray-400">
            Nenhum veículo encontrado
          </p>
        )}
      </section>
    </main>
  );
}

export default Frota;
