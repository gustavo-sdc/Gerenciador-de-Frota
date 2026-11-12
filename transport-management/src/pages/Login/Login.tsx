import { useContext, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../../hooks/authContextValue";
import { login } from "../../lib/user";

export default function Login() {
  const auth = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const requestedPath = (location.state as { from?: unknown } | null)?.from;
  const returnPath = typeof requestedPath === "string" && requestedPath.startsWith("/") && !requestedPath.startsWith("//")
    ? requestedPath : "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth.isLoading && auth.isAuthenticated) {
      navigate(auth.tenantId ? returnPath : "/register", { replace: true });
    }
  }, [auth.isAuthenticated, auth.isLoading, auth.tenantId, navigate, returnPath]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login({ email, password });
      const access = await auth.refreshAccess();
      navigate(access?.tenant_id ? returnPath : "/register", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-[#f8f9fa] p-5">
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-300 bg-white p-6 shadow-xl sm:p-9">
      <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">Garagem</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Acesse sua empresa</h1>
      <p className="mt-2 text-sm text-slate-600">Entre com sua conta para acessar os dados vinculados ao seu tenant.</p>

      <label htmlFor="login-email" className="mt-6 block text-sm font-medium text-slate-700">E-mail</label>
      <input id="login-email" name="email" type="email" required autoComplete="username" inputMode="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-slate-300 px-3 text-base text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
      <label htmlFor="login-password" className="mt-4 block text-sm font-medium text-slate-700">Senha</label>
      <input id="login-password" name="password" type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-slate-300 px-3 text-base text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />

      <div className="mt-3 text-right"><Link to="/recovery" className="text-sm font-medium text-blue-700 underline underline-offset-2">Esqueci minha senha</Link></div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
      <button type="submit" disabled={busy || auth.isLoading} className="mt-5 min-h-14 w-full rounded-xl bg-blue-700 px-4 font-bold text-white shadow-md hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Entrando…" : "Entrar"}</button>
      <p className="mt-5 text-center text-sm text-slate-600">Ainda não tem uma empresa cadastrada? <Link to="/register" className="font-semibold text-blue-700 underline underline-offset-2">Criar conta</Link></p>
      <p className="mt-4 text-center text-base text-slate-600"><Link to="/privacidade" className="underline">Privacidade</Link><span aria-hidden="true"> · </span><Link to="/excluir-conta" className="underline">Excluir conta</Link></p>
    </form>
  </main>;
}
