import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Header from "../../components/Header/Header";
import { AuthContext } from "../../hooks/authContextValue";
import supabase from "../../supabase/supabase";

type ProfileDetails = {
  name: string;
  email: string;
  createdAt: string | null;
  companyName: string | null;
  documentType: string | null;
  documentNumber: string | null;
};

const roleNames: Record<string, string> = { admin: "Administrador", gestor: "Gestor", motorista: "Motorista" };
const accessNames: Record<string, string> = { active: "Ativo", blocked: "Bloqueado", cancelled: "Cancelado" };
const blockReasons: Record<string, string> = { nonpayment: "Pagamento pendente", administrative: "Bloqueio administrativo", security: "Bloqueio de segurança" };

export default function Profile() {
  const auth = useContext(AuthContext);
  const [details, setDetails] = useState<ProfileDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    if (!auth.userId) { setLoading(false); return; }

    void (async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!current) return;
      if (error || !user) { setDetails(null); setLoading(false); return; }

      let companyName: string | null = null;
      let documentType: string | null = null;
      let documentNumber: string | null = null;
      if (auth.tenantId) {
        const { data } = await supabase.from("tenants").select("name,document_type,document_number,cnpj").eq("id", auth.tenantId).maybeSingle();
        companyName = data?.name ?? null;
        documentType = data?.document_type ?? "cnpj";
        documentNumber = data?.document_number ?? data?.cnpj ?? null;
      }

      if (!current) return;
      const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
      setDetails({
        name: typeof metadataName === "string" && metadataName.trim() ? metadataName.trim() : "Nome não informado",
        email: user.email ?? "E-mail indisponível",
        createdAt: user.created_at ?? null,
        companyName,
        documentType,
        documentNumber,
      });
      setLoading(false);
    })();

    return () => { current = false; };
  }, [auth.userId, auth.tenantId]);

  if (auth.isLoading) return <main role="status" className="grid min-h-screen place-items-center bg-slate-50 p-5 text-base font-semibold text-slate-700">Carregando perfil…</main>;
  if (!auth.isAuthenticated) return <main className="grid min-h-screen place-items-center bg-slate-50 p-5"><section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h1 className="text-2xl font-bold text-slate-950">Perfil</h1><p className="mt-3 text-base text-slate-700">Entre na sua conta para consultar os dados do perfil.</p><Link to="/" state={{ from: "/perfil" }} className="mt-5 inline-flex min-h-14 items-center rounded-xl bg-slate-800 px-5 font-semibold text-white">Entrar</Link></section></main>;

  return <div className="min-h-screen bg-slate-50"><Header/><main className="px-4 pb-24 pt-6 md:ml-64 md:px-5 md:pb-10"><div className="mx-auto max-w-3xl">
    <header className="mb-5"><p className="text-base font-semibold text-slate-600">Conta</p><h1 className="mt-1 text-2xl font-bold text-slate-950">Perfil</h1><p className="mt-1 text-base text-slate-700">Seus dados, acesso e privacidade.</p></header>

    <section aria-labelledby="profile-data" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 id="profile-data" className="text-lg font-bold text-slate-950">Dados do usuário</h2>
      {loading ? <p role="status" className="mt-3 text-base text-slate-600">Carregando perfil…</p> : details ? <dl className="mt-3 divide-y divide-slate-200">
        {[["Nome", details.name], ["E-mail", details.email], ["Empresa ou responsável", details.companyName ?? (auth.tenantId ? "Cadastro vinculado" : "Sem cadastro vinculado")], [details.documentType?.toUpperCase() ?? "Documento", details.documentNumber ?? "—"], ["Perfil de acesso", roleNames[auth.role ?? ""] ?? "—"], ["Situação", accessNames[auth.accessStatus ?? ""] ?? "Não vinculada"], ...(auth.blockReason ? [["Motivo do bloqueio", blockReasons[auth.blockReason] ?? "Administrativo"]] : []), ...(auth.accessUntil ? [["Acesso até", new Date(auth.accessUntil).toLocaleDateString("pt-BR")] ] : []), ["Conta criada", details.createdAt ? new Date(details.createdAt).toLocaleDateString("pt-BR") : "—"]].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 py-3 text-base"><dt className="font-semibold text-slate-700">{label}</dt><dd className="max-w-[65%] break-words text-right text-slate-950">{value}</dd></div>)}
      </dl> : <p role="alert" className="mt-3 text-base text-slate-700">Não foi possível carregar os dados do perfil. Saia e entre novamente.</p>}
    </section>

    <section aria-labelledby="profile-privacy" className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 id="profile-privacy" className="text-lg font-bold text-slate-950">Privacidade e conta</h2>
      <p className="mt-1 text-base text-slate-700">Consulte como os dados são tratados ou solicite a exclusão da conta.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Link to="/privacidade" className="flex min-h-14 items-center justify-center rounded-xl border border-slate-300 px-4 text-center font-semibold text-slate-900">Política de privacidade</Link>
        <Link to="/excluir-conta" className="flex min-h-14 items-center justify-center rounded-xl border border-rose-300 px-4 text-center font-semibold text-rose-900">Excluir conta</Link>
      </div>
    </section>
  </div></main></div>;
}
