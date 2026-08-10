import { useParams, useNavigate } from "react-router-dom";
import Header from "../../components/Header/Header";
import Input from "../../components/Input/Input";
import Button from "../../components/Button/Button";
import React, { useEffect, useState } from "react";
import { getObject, addObject, updateObject } from "../../lib/controller";
import { AuthContext } from "../../hooks/authContext";

export default function GestaoFrota() {
  const { id } = useParams();
  const navigate = useNavigate();

  const userId = React.useContext(AuthContext);
  const tenantId = userId?.tenantId;

  console.log("🚀 ~ GestaoFrota ~ userId:", userId)
  console.log("User ID do contexto:", userId.tenantId);

  console.log("ID do veículo:", id);


  const [loading, setLoading] = useState(false);
  const [vehicle, setVehicle] = useState({
    model: "",
    plate: "",
    year: "",
    color: "",
    fuel_type: "",
    km_aquisicao: "",
    km_atual: "",
    status: true,
  });

  const isEdit = Boolean(id);

  useEffect(() => {
    if (isEdit) {
      loadVehicle();
    }
  }, [id]);

  async function loadVehicle() {
    const { data, error } = await getObject(tenantId!, "vehicles", {
      id,
    });

    if (!error && data?.length) {
      const v = data[0];

      setVehicle({
        model: v.model,
        plate: v.plate,
        year: v.year,
        color: v.color,
        fuel_type: v.fuel_type,
        km_aquisicao: v.km_aquisicao,
        km_atual: v.km_atual,
        status: v.status,
      });
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setVehicle((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit() {
    setLoading(true);

    const payload = {
      ...vehicle,
      year: Number(vehicle.year),
      km_atual: Number(vehicle.km_atual),
      km_aquisicao: Number(vehicle.km_aquisicao),
      tenant_id: tenantId!,
    };

    if (isEdit) {
      await updateObject("vehicles", id!, payload);
    } else {
      await addObject("vehicles", payload); // Correct argument order
    }

    setLoading(false);
    // navigate("/frota");
  }

  return (
    <main className="flex min-h-screen flex-col">
      <Header />

      <section className="w-full px-4 py-8 md:px-20 max-w-4xl mx-auto">
        <h2 className="text-xl font-light mb-6">
          {isEdit ? "Editar veículo" : "Novo veículo"}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input type="text" label="Modelo" name="model" value={vehicle.model} onChange={handleChange} />
          <Input type="text" label="Placa" name="plate" value={vehicle.plate} onChange={handleChange} />
          <Input type="number" label="Ano" name="year" value={vehicle.year} onChange={handleChange} />
          <Input type="text" label="Cor" name="color" value={vehicle.color} onChange={handleChange} />
          <Input type="text" label="Combustível" name="fuel_type" value={vehicle.fuel_type} onChange={handleChange} />
          <Input type="number" label="KM de Aquisição" name="km_aquisicao" value={vehicle.km_aquisicao} onChange={handleChange} />
          <Input type="number" label="KM Atual" name="km_atual" value={vehicle.km_atual} onChange={handleChange} />
        </div>

        {vehicle.status === false && (
          <p className="mt-4 text-sm text-red-500">
            Este veículo está inativo e não pode ser editado.
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button type="secondary" onClick={() => navigate("/frota")}>
            Cancelar
          </Button>

          <Button
            type="primary"
            disabled={loading || vehicle.status === false}
            onClick={handleSubmit}
          >
            {loading ? "Salvando..." : isEdit ? "Atualizar" : "Cadastrar"}
          </Button>
        </div>
      </section>
    </main>
  );
}
