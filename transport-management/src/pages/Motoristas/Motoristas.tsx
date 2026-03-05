import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import Button from "../../components/Button/Button";
import Header from "../../components/Header/Header";
import Input from "../../components/Input/Input";
import Card from "../../components/Card/Card";
import supabase from "../../supabase/supabase";

interface Driver {
  id: number;
  name: string;
  document: string | null;
  pay_per_day: number | null;
}

export default function Motoristas() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchDrivers() {
    setLoading(true);

    // usuário logado
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
      .from("drivers")
      .select("id, name, document, pay_per_day")
      .eq("tenant_id", user.user_metadata.tenant_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
    } else {
      setDrivers(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    fetchDrivers();
  }, []);

  return (
    <main className="flex min-h-screen flex-col">
      <Header />

      <section className="w-full px-4 py-4 md:px-20">
        {/* HEADER */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-xl font-light">Motoristas</h2>

          <Button type="primary" to="/motoristas/novo">
            <Plus className="mr-2" />
            Novo motorista
          </Button>
        </div>

        {/* SEARCH (visual por enquanto) */}
        <div className="mb-4 w-full">
          <Input label="Pesquisar..." name="pesquisar" type="text" theme="light" />
        </div>

        {/* CONTENT */}
        {loading ? (
          <p className="text-sm text-gray-500">Carregando motoristas...</p>
        ) : drivers.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nenhum motorista cadastrado.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {drivers.map((driver) => (
              <Card
                key={driver.id}
                id={driver.id.toString()}
                title={driver.name}
                details={[
                  {
                    details: (
                      <div className="flex flex-col gap-1 text-sm font-light">
                        {driver.document && (
                          <p>
                            Documento:{" "}
                            <span className="font-bold">
                              {driver.document}
                            </span>
                          </p>
                        )}

                        {driver.pay_per_day && (
                          <p>
                            Diária:{" "}
                            <span className="font-bold">
                              R$ {driver.pay_per_day}
                            </span>
                          </p>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
