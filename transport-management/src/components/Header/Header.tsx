import { AuthContext } from "../../hooks/authContext";
import Button from "../Button/Button";
import { useContext, useState } from "react";
import {
  House,
  IdCardLanyard,
  LogOut,
  MapPinned,
  Truck,
  Users,
  Wallet,
  Menu,
  X,
} from "lucide-react";

interface ItemsProps {
  items?: {
    name: string;
    type: "primary" | "secondary" | "outline";
    to: string;
    icon?: React.ReactNode;
  }[];
}

export default function Header({ items }: ItemsProps) {
  const authContext = useContext(AuthContext);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!items) {
    items = [
      { name: "Inicio", type: "outline", to: "/dashboard", icon: <House size={18} className="mr-2" /> },
      { name: "Frota", type: "outline", to: "/frota", icon: <Truck size={18} className="mr-2" /> },
      { name: "Motoristas", type: "outline", to: "/motoristas", icon: <IdCardLanyard size={18} className="mr-2" /> },
      { name: "Clientes", type: "outline", to: "/clientes", icon: <Users size={18} className="mr-2" /> },
      { name: "Rotas", type: "outline", to: "/rotas", icon: <MapPinned size={18} className="mr-2" /> },
      { name: "Financeiro", type: "outline", to: "/financeiro", icon: <Wallet size={18} className="mr-2" /> },
    ];
  }

  return (
    <header className="border-b border-gray-100 bg-white">
      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 py-3 md:px-20">
        <h1 className="flex items-center text-lg md:text-2xl">
          <Truck size={28} className="mr-2" />
          Gestor de frotas
        </h1>

        {/* MOBILE MENU BUTTON */}
        <button
          className="md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>

        {/* DESKTOP LOGOUT */}
        <div className="hidden md:block">
          <Button onClick={() => authContext.callSignOut()} type="logout">
            <LogOut />
            <p>Sair</p>
          </Button>
        </div>
      </div>

      {/* NAV */}
      <nav
        className={`
          flex items-center gap-1 px-4 pb-4 wrap-normal w-full px-20
        `}
      >
        {items.map((item) => (
          <Button
            key={item.name}
            type={item.type}
            to={item.to}
            name={item.name}
            onClick={() => setMenuOpen(false)}
          >
            {item.icon}
            <p>{item.name}</p>
          </Button>
        ))}

        {/* MOBILE LOGOUT */}
        <div className="md:hidden mt-2">
          <Button onClick={() => authContext.callSignOut()} type="logout">
            <LogOut />
            <p>Sair</p>
          </Button>
        </div>
      </nav>
    </header>
  );
}
