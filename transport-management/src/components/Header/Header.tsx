import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useContext } from "react";
import { AuthContext } from "../../hooks/authContextValue";
import { House, Truck, IdCardLanyard, Users, MapPinned, Wallet, Wrench, LogOut, Menu, X, UserRound, LifeBuoy, Settings } from "lucide-react";
import { callAdminSupport } from "../../lib/adminSupport";

const links = [
  { label: "Visão geral", to: "/dashboard", icon: House },
  { label: "Frota", to: "/frota", icon: Truck },
  { label: "Motoristas", to: "/motoristas", icon: IdCardLanyard },
  { label: "Clientes", to: "/clientes", icon: Users },
  { label: "Rotas", to: "/rotas", icon: MapPinned },
  { label: "Manutenções", to: "/manutencoes", icon: Wrench },
  { label: "Financeiro", to: "/financeiro", icon: Wallet },
  { label: "Perfil", to: "/perfil", icon: UserRound },
  { label: "Ajuda e suporte", to: "/suporte", icon: LifeBuoy },
];
const mobileLinks = links.filter(({ to }) => ["/dashboard", "/frota", "/rotas", "/financeiro"].includes(to));

export default function Header() {
  const { callSignOut, isAuthenticated, userId } = useContext(AuthContext);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);
  useEffect(() => {
    if (!isAuthenticated || import.meta.env.MODE === "android") { setIsDeveloper(false); return; }
    const cacheKey = userId ? `garagem-platform-admin:${userId}` : null;
    const cached = cacheKey ? window.sessionStorage.getItem(cacheKey) : null;
    if (cached !== null) { setIsDeveloper(cached === "true"); return; }
    void callAdminSupport<{ isDeveloper: boolean }>({ action: "status" }).then((result) => {
      if (result.data) {
        setIsDeveloper(result.data.isDeveloper);
        if (cacheKey) window.sessionStorage.setItem(cacheKey, String(result.data.isDeveloper));
      }
    });
  }, [isAuthenticated, userId]);
  const navLinks = isDeveloper && import.meta.env.MODE !== "android"
    ? [...links, { label: "Painel do administrador", to: "/admin", icon: Settings }]
    : links;
  const signOut = () => void callSignOut().catch(() => {});
  const closeMenu = () => setMenuOpen(false);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeMenu(); };
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = oldOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [menuOpen]);

  return <>
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-700 bg-slate-900 px-4 py-6 md:flex">
      <div className="mb-8 px-3"><p className="text-xl font-bold text-white">Garagem</p><p className="mt-1 text-base text-slate-200">Sua frota, em ordem</p></div>
      <nav aria-label="Navegação principal" className="flex flex-1 flex-col gap-2">
        {navLinks.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `flex min-h-14 items-center gap-3 rounded-xl px-3 py-3 text-base font-semibold transition-colors ${isActive ? "bg-[#526b7d] text-white" : "text-slate-100 hover:bg-slate-800 hover:text-white"}`}><Icon aria-hidden="true" size={22}/><span>{label}</span></NavLink>)}
      </nav>
      <button type="button" onClick={signOut} className="mt-4 flex min-h-14 items-center gap-3 rounded-xl px-3 py-3 text-base font-semibold text-white transition-colors hover:bg-slate-800"><LogOut aria-hidden="true" size={22}/>Sair da conta</button>
    </aside>

    <header className="sticky top-0 z-40 flex min-h-[68px] items-center justify-between border-b border-slate-300 bg-white px-4 md:hidden">
      <span className="text-xl font-bold text-slate-950">Garagem</span>
      <button type="button" aria-expanded={menuOpen} aria-controls="mobile-app-menu" onClick={() => setMenuOpen((open) => !open)} className="flex min-h-14 items-center gap-2 rounded-xl border border-slate-400 bg-white px-4 text-base font-semibold text-slate-900 shadow-sm transition-all duration-200 active:scale-95">
        {menuOpen ? <X aria-hidden="true" size={20}/> : <Menu aria-hidden="true" size={20}/>}<span>{menuOpen ? "Fechar menu" : "Menu"}</span>
      </button>
    </header>

    {menuOpen && <div className="fixed inset-0 z-50 bg-slate-950/45 md:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) closeMenu(); }}>
      <aside id="mobile-app-menu" role="dialog" aria-modal="true" aria-label="Menu do aplicativo" className="flex h-full w-[min(86vw,360px)] flex-col bg-white p-4 shadow-2xl">
        <div className="mb-5 flex items-center justify-between border-b border-slate-200 pb-4"><div><p className="text-xl font-bold text-slate-950">Garagem</p><p className="text-base text-slate-700">Menu principal</p></div><button type="button" autoFocus onClick={closeMenu} className="flex min-h-14 items-center gap-2 rounded-xl border border-slate-300 px-3 text-slate-900"><X aria-hidden="true" size={20}/> Fechar</button></div>
        <nav aria-label="Todas as páginas" className="flex flex-1 flex-col gap-2 overflow-y-auto">{navLinks.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} onClick={closeMenu} className={({ isActive }) => `flex min-h-14 items-center gap-3 rounded-xl px-4 text-base font-semibold ${isActive ? "bg-[#e9eef1] text-slate-950" : "text-slate-800 hover:bg-slate-100"}`}><Icon aria-hidden="true" size={22}/><span>{label}</span></NavLink>)}</nav>
        <button type="button" onClick={signOut} className="mt-4 flex min-h-14 items-center gap-3 rounded-xl border border-slate-300 px-4 text-base font-semibold text-slate-900"><LogOut aria-hidden="true" size={22}/>Sair da conta</button>
      </aside>
    </div>}

    <nav aria-label="Navegação rápida" className="fixed inset-x-0 bottom-0 z-40 grid h-[82px] grid-cols-4 gap-1 border-t border-slate-300 bg-white px-2 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1 shadow-[0_-4px_14px_rgba(15,23,42,0.08)] md:hidden">
      {mobileLinks.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-center text-base font-semibold leading-tight ${isActive ? "bg-[#e9eef1] text-slate-950" : "text-slate-700 hover:bg-slate-50"}`}><Icon aria-hidden="true" size={21}/><span>{label}</span></NavLink>)}
    </nav>
  </>;
}
