import { Link } from "react-router-dom";

const privacyContact = import.meta.env.VITE_PRIVACY_CONTACT_EMAIL?.trim();

export default function PrivacyPolicy() {
  return <main className="min-h-screen bg-slate-50 px-4 py-6"><article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
    <Link to="/" className="inline-flex min-h-14 items-center font-semibold text-slate-700">Voltar</Link>
    <h1 className="mt-2 text-3xl font-bold text-slate-950">Política de privacidade do Garagem</h1>
    <p className="mt-2 text-base text-slate-600">Atualizada em 10 de novembro de 2026.</p>
    <p className="mt-5 text-base text-slate-800">Esta política explica como o aplicativo Garagem trata dados usados para administrar empresas, frotas, rotas, manutenções e finanças.</p>

    <h2 className="mt-6 text-xl font-bold">Dados tratados</h2>
    <p className="mt-2 text-base text-slate-800">Dados de conta, como e-mail; dados da empresa, como nome e CNPJ; dados operacionais, como veículos, motoristas e documentos informados, clientes, rotas, horários, custos, lançamentos financeiros e histórico de manutenção.</p>

    <h2 className="mt-6 text-xl font-bold">Como usamos os dados</h2>
    <p className="mt-2 text-base text-slate-800">Usamos esses dados para autenticar o usuário, vincular o acesso à empresa, executar os recursos de gestão solicitados e proteger o serviço. O acesso é separado por empresa e controlado por função.</p>

    <h2 className="mt-6 text-xl font-bold">Armazenamento e compartilhamento</h2>
    <p className="mt-2 text-base text-slate-800">Os dados são armazenados no Supabase, que fornece banco de dados, autenticação e infraestrutura de Edge Functions. Não há cobrança dentro do aplicativo nesta versão. Não vendemos os dados pessoais cadastrados na plataforma.</p>

    <h2 className="mt-6 text-xl font-bold">Retenção e exclusão</h2>
    <p className="mt-2 text-base text-slate-800">Mantemos os dados enquanto a conta ou empresa estiver ativa. O usuário pode solicitar a exclusão em <Link to="/excluir-conta" className="font-semibold underline">Excluir conta</Link>. A exclusão da conta proprietária remove os registros e vínculos da empresa; a exclusão de uma conta membro remove seu vínculo e acesso.</p>

    <h2 className="mt-6 text-xl font-bold">Contato sobre privacidade</h2>
    {privacyContact ? <p className="mt-2 text-base text-slate-800">Envie sua solicitação para <a className="font-semibold underline" href={`mailto:${privacyContact}`}>{privacyContact}</a>.</p> : <p className="mt-2 rounded-xl bg-amber-50 p-3 text-base text-amber-950">Contato de privacidade ainda não configurado. Antes da publicação, configure VITE_PRIVACY_CONTACT_EMAIL com o e-mail oficial de atendimento.</p>}
    <p className="mt-5 text-base text-slate-600">Esta página precisa permanecer disponível por uma URL pública HTTPS e ser atualizada quando as práticas do serviço mudarem.</p>
  </article></main>;
}
