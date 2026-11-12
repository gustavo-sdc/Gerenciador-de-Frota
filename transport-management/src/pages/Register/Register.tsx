import { useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../../hooks/authContextValue";
import { createTenant, registerUser } from "../../lib/user";
import { isValidCnpj, isValidCpf, normalizeDocument } from "../../lib/cnpj";

export default function Register() {
  const auth = useContext(AuthContext);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [documentType, setDocumentType] = useState<"cpf" | "cnpj">("cnpj");
  const [documentNumber, setDocumentNumber] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setupOnly = auth.isAuthenticated && !auth.tenantId;

  useEffect(() => {
    if (!auth.isLoading && auth.isAuthenticated && auth.tenantId) navigate("/dashboard", { replace: true });
  }, [auth.isAuthenticated, auth.isLoading, auth.tenantId, navigate]);

  function changeDocument(value: string) {
    setDocumentNumber(normalizeDocument(value, documentType));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const validDocument = documentType === "cpf" ? isValidCpf(documentNumber) : isValidCnpj(documentNumber);
    if (!validDocument) { setError(documentType === "cpf" ? "Informe um CPF válido com 11 números." : "Informe um CNPJ válido com 14 caracteres."); return; }
    if (!companyName.trim()) { setError("Informe o nome da empresa ou do responsável."); return; }

    setBusy(true);
    try {
      if (!auth.isAuthenticated) {
        if (password.length < 10) throw new Error("A senha precisa ter pelo menos 10 caracteres.");
        const result = await registerUser({ email, password });
        if (!result.hasSession) {
          setConfirmationSent(true);
          return;
        }
      }

      await createTenant({ document_type: documentType, document_number: documentNumber, nome_empresa: companyName });
      const access = await auth.refreshAccess();
      if (!access?.tenant_id) throw new Error("Conta criada, mas não foi possível carregar a empresa. Entre novamente.");
      navigate("/dashboard", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível concluir o cadastro.");
    } finally {
      setBusy(false);
    }
  }

  if (confirmationSent) return <main className="grid min-h-screen place-items-center bg-slate-50 p-5"><section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm">
    <h1 className="text-2xl font-semibold text-slate-900">Confirme seu e-mail</h1><p className="mt-3 text-sm leading-6 text-slate-600">Enviamos uma mensagem para <strong>{email}</strong>. Depois de confirmar, entre e conclua o vínculo da empresa com sua conta.</p><Link to="/" className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-700 font-bold text-white shadow-md">Ir para o login</Link>
  </section></main>;

  return <main className="grid min-h-screen place-items-center bg-[#f8f9fa] p-5">
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-300 bg-white p-6 shadow-xl sm:p-9">
      <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">Garagem</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{setupOnly ? "Vincular sua empresa" : "Criar sua conta"}</h1>
      <p className="mt-2 text-sm leading-5 text-slate-600">{setupOnly ? "Sua operação ficará em um espaço separado de dados." : "Crie sua conta e um espaço separado para os dados da sua operação."}</p>

      {!setupOnly && <>
        <label htmlFor="register-email" className="mt-6 block text-sm font-medium text-slate-700">E-mail</label>
        <input id="register-email" name="email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-slate-300 px-3 text-base text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
        <label htmlFor="register-password" className="mt-4 block text-sm font-medium text-slate-700">Senha <span className="font-normal text-slate-500">(mínimo 10 caracteres)</span></label>
        <input id="register-password" name="password" type="password" required minLength={10} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-slate-300 px-3 text-base text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
      </>}

      <label htmlFor="register-company" className="mt-5 block text-sm font-medium text-slate-700">Nome da empresa ou responsável</label>
      <input id="register-company" name="nome_empresa" type="text" required maxLength={160} autoComplete="organization" value={companyName} onChange={event => setCompanyName(event.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-slate-300 px-3 text-base text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
      <fieldset className="mt-4"><legend className="text-sm font-medium text-slate-700">Documento</legend><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" aria-pressed={documentType === "cnpj"} onClick={() => { setDocumentType("cnpj"); setDocumentNumber(""); }} className={`min-h-12 rounded-xl border px-4 text-base font-semibold ${documentType === "cnpj" ? "border-slate-600 bg-slate-100 text-slate-950" : "border-slate-300 bg-white text-slate-700"}`}>CNPJ</button><button type="button" aria-pressed={documentType === "cpf"} onClick={() => { setDocumentType("cpf"); setDocumentNumber(""); }} className={`min-h-12 rounded-xl border px-4 text-base font-semibold ${documentType === "cpf" ? "border-slate-600 bg-slate-100 text-slate-950" : "border-slate-300 bg-white text-slate-700"}`}>CPF</button></div></fieldset>
      <label htmlFor="register-document" className="mt-4 block text-sm font-medium text-slate-700">{documentType === "cpf" ? "CPF" : "CNPJ"}</label>
      <input id="register-document" name="document_number" type="text" required maxLength={14} inputMode={documentType === "cpf" ? "numeric" : "text"} autoComplete="off" spellCheck={false} value={documentNumber} onChange={event => changeDocument(event.target.value)} placeholder={documentType === "cpf" ? "11 números" : "14 caracteres"} className="mt-1.5 h-12 w-full rounded-xl border border-slate-300 px-3 text-base uppercase text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
      <p className="mt-1.5 text-xs text-slate-500">{documentType === "cpf" ? "Digite os 11 números do CPF." : "Aceita CNPJ numérico ou alfanumérico."}</p>

      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
      <button type="submit" disabled={busy || auth.isLoading} className="mt-5 min-h-14 w-full rounded-xl bg-blue-700 px-4 font-bold text-white shadow-md hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Salvando…" : setupOnly ? "Vincular empresa" : "Criar conta"}</button>
      <p className="mt-5 text-center text-sm text-slate-600">Já tem uma conta? <Link to="/" className="font-semibold text-blue-700 underline underline-offset-2">Entrar</Link></p>
    </form>
  </main>;
}
