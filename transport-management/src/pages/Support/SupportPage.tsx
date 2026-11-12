import { useCallback, useContext, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { LifeBuoy, Send } from "lucide-react";
import Header from "../../components/Header/Header";
import { AuthContext } from "../../hooks/authContextValue";
import { callAdminSupport, type SupportTicket } from "../../lib/adminSupport";

const statusLabel: Record<string, string> = { open: "Aberto", in_progress: "Em atendimento", waiting_user: "Aguardando você", resolved: "Resolvido", closed: "Encerrado" };
const categoryLabel: Record<string, string> = { bug: "Erro no aplicativo", question: "Dúvida", access: "Acesso", billing: "Pagamento", other: "Outro assunto" };
const dateTime = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default function SupportPage() {
  const { isAuthenticated, isLoading } = useContext(AuthContext);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("bug");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadTickets = useCallback(async () => {
    setLoading(true);
    const result = await callAdminSupport<SupportTicket[]>({ action: "my_tickets" });
    if (result.error) setError(result.error.message); else setTickets(result.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { if (isAuthenticated) void loadTickets(); }, [isAuthenticated, loadTickets]);
  if (isLoading) return <div className="grid min-h-screen place-items-center text-base text-slate-700">Carregando sua conta…</div>;
  if (!isAuthenticated) return <Navigate to="/" replace />;

  async function submitTicket(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const result = await callAdminSupport({ action: "create_ticket", subject, description, category });
    if (result.error) setError(result.error.message);
    else { setSubject(""); setDescription(""); setNotice("Chamado enviado. Acompanhe as respostas nesta página."); await loadTickets(); }
    setSaving(false);
  }

  async function sendReply(ticketId: string) {
    const body = replies[ticketId]?.trim(); if (!body) return;
    setSaving(true); setError("");
    const result = await callAdminSupport({ action: "reply_ticket", ticket_id: ticketId, body });
    if (result.error) setError(result.error.message);
    else { setReplies((current) => ({ ...current, [ticketId]: "" })); await loadTickets(); }
    setSaving(false);
  }

  return <main className="min-h-screen bg-[#f7f8f7] text-slate-900"><Header /><section className="mx-auto max-w-6xl px-4 py-6 pb-28 md:ml-64 md:px-8 md:py-9">
    <div className="mb-6 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8edeb] text-slate-800"><LifeBuoy size={25}/></span><div><p className="text-sm font-medium text-slate-600">Central de ajuda</p><h1 className="text-2xl font-bold">Ajuda e suporte</h1></div></div>
    {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-base text-rose-900">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-base text-emerald-900">{notice}</p>}
    <div className="grid gap-6 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
      <form onSubmit={submitTicket} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-xl font-bold">Abrir chamado</h2><p className="mt-1 text-base text-slate-600">Descreva o que aconteceu. Não inclua senhas ou dados de pagamento.</p>
        <label className="mt-5 flex flex-col gap-2 text-base font-semibold">Assunto<input required minLength={4} maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} className="min-h-14 rounded-xl border border-slate-300 bg-white px-4 font-normal outline-none focus:border-slate-500" placeholder="Ex.: Não consigo salvar uma rota"/></label>
        <label className="mt-4 flex flex-col gap-2 text-base font-semibold">Tipo<select value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-14 rounded-xl border border-slate-300 bg-white px-4 font-normal"><option value="bug">Erro no aplicativo</option><option value="question">Dúvida</option><option value="access">Acesso</option><option value="billing">Pagamento</option><option value="other">Outro assunto</option></select></label>
        <label className="mt-4 flex flex-col gap-2 text-base font-semibold">O que aconteceu?<textarea required minLength={10} maxLength={5000} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} className="rounded-xl border border-slate-300 bg-white p-4 font-normal outline-none focus:border-slate-500" placeholder="Conte os passos e o que você esperava que acontecesse."/></label>
        <button disabled={saving} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#263a46] px-5 text-base font-bold text-white shadow-sm transition active:scale-[.99] disabled:opacity-60"><Send size={18}/>Enviar chamado</button>
      </form>
      <section><div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Seus chamados</h2><p className="text-base text-slate-600">Acompanhe o andamento e as respostas.</p></div><button type="button" onClick={() => void loadTickets()} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold">Atualizar</button></div>
        {loading ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-base text-slate-700">Carregando chamados…</p> : tickets.length ? <div className="space-y-4">{tickets.map((ticket) => <article key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{statusLabel[ticket.status] ?? ticket.status}</span><h3 className="mt-3 text-lg font-bold">{ticket.subject}</h3><p className="mt-1 text-sm text-slate-600">{categoryLabel[ticket.category] ?? ticket.category} · aberto {dateTime(ticket.created_at)}</p></div></div><p className="mt-4 whitespace-pre-wrap text-base text-slate-800">{ticket.description}</p>
          {ticket.messages.length > 0 && <div className="mt-4 space-y-3 border-l-2 border-slate-200 pl-4">{ticket.messages.map((message) => <div key={message.id} className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-bold text-slate-700">{message.author_type === "developer" ? "Equipe Garagem" : "Você"} · {dateTime(message.created_at)}</p><p className="mt-1 whitespace-pre-wrap text-base">{message.body}</p></div>)}</div>}
          {!['closed'].includes(ticket.status) && <div className="mt-4 flex flex-col gap-2 sm:flex-row"><textarea aria-label="Responder ao chamado" rows={2} maxLength={5000} value={replies[ticket.id] ?? ""} onChange={(event) => setReplies((current) => ({ ...current, [ticket.id]: event.target.value }))} placeholder="Escreva uma mensagem" className="min-h-14 flex-1 rounded-xl border border-slate-300 p-3 text-base"/><button disabled={saving || !replies[ticket.id]?.trim()} onClick={() => void sendReply(ticket.id)} className="min-h-14 rounded-xl bg-slate-800 px-5 text-base font-semibold text-white disabled:opacity-50">Responder</button></div>}
        </article>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-base text-slate-700">Você ainda não abriu chamados. Use o formulário para falar com a equipe.</div>}
      </section>
    </div>
  </section></main>;
}
