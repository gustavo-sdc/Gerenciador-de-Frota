import { useContext, useState } from "react";
import { Link } from "react-router-dom";
import Header from "../../components/Header/Header";
import { AuthContext } from "../../hooks/authContextValue";
import supabase from "../../supabase/supabase";

export default function AccountDeletion() {
  const { isAuthenticated } = useContext(AuthContext);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation !== "EXCLUIR") return;
    setBusy(true);
    setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("delete-account", {
      body: { confirmation },
    });
    if (invokeError || !data?.success) {
      let message = data?.error ?? invokeError?.message ?? "Não foi possível excluir a conta.";
      try {
        const response = (invokeError as Error & { context?: Response } | null)?.context;
        const body = response ? await response.clone().json() : null;
        if (typeof body?.error === "string") message = body.error;
      } catch { /* Mantém a mensagem padrão. */ }
      setError(message);
      setBusy(false);
      return;
    }

    await supabase.auth.signOut({ scope: "local" });
    setDeleted(true);
    setBusy(false);
  }

  if (deleted) return <main className="grid min-h-screen place-items-center bg-slate-50 p-5"><section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h1 className="text-2xl font-bold text-slate-950">Conta excluída</h1><p className="mt-3 text-base text-slate-700">A exclusão foi concluída. Você saiu do Garagem.</p><Link to="/" className="mt-5 inline-flex min-h-14 items-center rounded-xl bg-slate-800 px-5 font-semibold text-white">Ir para o início</Link></section></main>;

  return <div className="min-h-screen bg-slate-50"><Header/><main className="px-4 pb-24 pt-6 md:ml-64 md:px-5 md:pb-10"><section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-base font-semibold text-slate-600">Conta e privacidade</p>
    <h1 className="mt-1 text-2xl font-bold text-slate-950">Excluir conta</h1>
    {!isAuthenticated ? <><p className="mt-4 text-base text-slate-700">Entre na conta que deseja excluir. A página continuará aberta depois do login.</p><Link to="/" state={{ from: "/excluir-conta" }} className="mt-5 inline-flex min-h-14 items-center rounded-xl bg-slate-800 px-5 font-semibold text-white">Entrar para continuar</Link></> : <>
      <p className="mt-4 text-base text-slate-700">A exclusão é permanente. Se esta conta for proprietária de uma empresa, os dados e vínculos da empresa também serão removidos. Se for membro, somente seu acesso será excluído.</p>
      <p className="mt-3 text-base text-slate-700">Para confirmar, digite <strong>EXCLUIR</strong>.</p>
      <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-3"><label htmlFor="delete-confirmation" className="block text-base font-semibold text-slate-800">Confirmação</label><input id="delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="w-full rounded-xl border border-slate-300 px-3"/><button type="submit" disabled={busy || confirmation !== "EXCLUIR"} className="rounded-xl bg-rose-800 px-5 font-bold text-white disabled:opacity-50">{busy ? "Excluindo…" : "Excluir conta e dados"}</button></form>
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-base text-rose-900">{error}</p>}
    </>}
    <p className="mt-5 border-t border-slate-200 pt-4 text-base text-slate-700">Leia também a <Link to="/privacidade" className="font-semibold underline">Política de privacidade</Link>.</p>
  </section></main></div>;
}
