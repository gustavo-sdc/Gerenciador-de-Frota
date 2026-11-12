import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset, signOut, updatePassword } from "../../lib/user";
import supabase from "../../supabase/supabase";

export default function Recovery() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(() => window.location.hash.includes("type=recovery") || new URLSearchParams(window.location.search).has("code") || sessionStorage.getItem("auth-password-recovery") === "true");
  const [sent, setSent] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sessionStorage.removeItem("auth-password-recovery");
    const deepLinkError = sessionStorage.getItem("auth-deep-link-error");
    if (deepLinkError) {
      setError(deepLinkError);
      sessionStorage.removeItem("auth-deep-link-error");
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível solicitar a recuperação.");
    } finally { setBusy(false); }
  }

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 10) { setError("A senha precisa ter pelo menos 10 caracteres."); return; }
    if (password !== confirmPassword) { setError("As senhas não conferem."); return; }
    setBusy(true);
    try {
      await updatePassword(password);
      await signOut();
      setUpdated(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a senha.");
    } finally { setBusy(false); }
  }

  return <main className="grid min-h-screen place-items-center bg-[#f8f9fa] p-5">
    <section className="w-full max-w-md rounded-3xl border border-slate-300 bg-white p-6 shadow-xl sm:p-9">
      <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">Garagem</p>
      {updated ? <><h1 className="mt-2 text-2xl font-semibold text-slate-900">Senha atualizada</h1><p className="mt-2 text-sm text-slate-600">Entre novamente para acessar a empresa vinculada à sua conta.</p><Link to="/" className="mt-6 flex items-center justify-center rounded-xl bg-blue-700 font-bold text-white shadow-md hover:bg-blue-800">Ir para o login</Link></> : recoveryMode ? <>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Criar nova senha</h1><p className="mt-2 text-sm text-slate-600">Use uma senha com pelo menos 10 caracteres.</p>
        <form onSubmit={submitPassword} className="mt-6"><label htmlFor="new-password" className="block text-sm font-medium text-slate-700">Nova senha</label><input id="new-password" name="new-password" type="password" required minLength={10} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-slate-300 px-3 text-base text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"/><label htmlFor="confirm-password" className="mt-4 block text-sm font-medium text-slate-700">Repita a nova senha</label><input id="confirm-password" name="confirm-password" type="password" required minLength={10} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-slate-300 px-3 text-base text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"/>{error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}<button type="submit" disabled={busy} className="mt-5 h-12 w-full rounded-xl bg-blue-700 font-semibold text-white disabled:opacity-60 hover:bg-blue-800">{busy ? "Salvando…" : "Atualizar senha"}</button></form>
      </> : <>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Recuperar senha</h1><p className="mt-2 text-sm text-slate-600">Informe o e-mail da sua conta. Se ela existir, enviaremos um link de recuperação.</p>
        {sent ? <div role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">Se houver uma conta para este e-mail, você receberá instruções para redefinir a senha. Confira também o spam.</div> : <form onSubmit={submitRequest} className="mt-6"><label htmlFor="recovery-email" className="block text-sm font-medium text-slate-700">E-mail</label><input id="recovery-email" name="email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-slate-300 px-3 text-base text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"/>{error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}<button type="submit" disabled={busy} className="mt-5 h-12 w-full rounded-xl bg-blue-700 font-semibold text-white disabled:opacity-60 hover:bg-blue-800">{busy ? "Enviando…" : "Enviar link de recuperação"}</button></form>}
      </>}
      <p className="mt-5 text-center text-sm text-slate-600"><Link to="/" className="font-semibold text-blue-700 underline underline-offset-2">Voltar para o login</Link></p>
    </section>
  </main>;
}
