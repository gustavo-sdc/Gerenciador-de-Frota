import { useContext } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthContext } from "./authContextValue";

function PrivateRoute({ children }: { children: JSX.Element }) {
  const { isAuthenticated, isLoading, tenantId, accessStatus, accessUntil, accessError, refreshAccess, callSignOut } = useContext(AuthContext);

  if (isLoading) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Validando sua conta e empresa…</div>;
  if (!isAuthenticated) return <Navigate to="/" replace />;

  if (!tenantId) {
    return <main className="grid min-h-screen place-items-center bg-slate-50 p-5"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">Empresa não vinculada</h1>
      <p className="mt-2 text-sm text-slate-600">Conclua o cadastro da empresa para acessar os dados da frota.</p>
      {accessError && <p role="alert" className="mt-3 text-sm text-rose-700">{accessError}</p>}
      <div className="mt-5 flex flex-col gap-3"><Link to="/register" className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-medium text-white">Concluir cadastro da empresa</Link><button type="button" onClick={() => void refreshAccess().catch(() => {})} className="text-sm font-medium text-blue-700">Tentar novamente</button><button type="button" onClick={() => void callSignOut().catch(() => {})} className="text-sm text-slate-500">Sair</button></div>
    </section></main>;
  }

  const expired = Boolean(accessUntil && Date.parse(accessUntil) <= Date.now());
  if (accessStatus !== "active" || expired) {
    const message = accessStatus === "blocked"
      ? "O acesso desta empresa está bloqueado. Fale com o responsável pelo acesso."
      : accessStatus === "cancelled"
        ? "O acesso desta empresa foi cancelado. Fale com o responsável pelo acesso."
        : expired
          ? "O período de acesso desta empresa terminou. Fale com o responsável pelo acesso."
          : "Não foi possível confirmar a situação do acesso desta empresa.";
    return <main className="grid min-h-screen place-items-center bg-slate-50 p-5"><section className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">Acesso indisponível</h1><p className="mt-2 text-sm text-slate-600">{message}</p><div className="mt-5 flex flex-col gap-3"><Link to="/suporte" className="rounded-xl bg-slate-800 px-4 py-3 text-base font-semibold text-white">Falar com o suporte</Link><button type="button" onClick={() => void callSignOut().catch(() => {})} className="rounded-xl border border-slate-200 px-4 py-3 text-base font-medium text-slate-700">Sair</button></div>
    </section></main>;
  }

  return children;
}

export default PrivateRoute;
