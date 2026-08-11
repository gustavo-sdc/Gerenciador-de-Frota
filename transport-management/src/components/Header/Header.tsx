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
  icons,
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
      { name: "Inicio", type: "outline", to: "/dashboard", icon: <House/> },
      { name: "Frota", type: "outline", to: "/frota", icon: <Truck/> },
      { name: "Motoristas", type: "outline", to: "/motoristas", icon: <IdCardLanyard/> },
      { name: "Clientes", type: "outline", to: "/clientes", icon: <Users/> },
      { name: "Rotas", type: "outline", to: "/rotas", icon: <MapPinned/> },
      { name: "Financeiro", type: "outline", to: "/financeiro", icon: <Wallet/> },
    ]; 
  }

  return (

    <header className="h-screen absolute">
      {!menuOpen ? (
        <div className="background bg-blue-950 w-20 align-center p-2 h-screen flex flex-col justify-between py-5">
            <button
              className="menu text-white m-auto cursor-pointer"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
    
    
          <aside className={`flex flex-col items-center gap-1 wrap-normal w-full my-5 h-full`}>
            <Button to="/dashboard" type="icon">
              <House size={25}/>
            </Button>
            <Button to="/frota" type="icon">
              <Truck size={25}/>
            </Button>
            <Button to="/motoristas" type="icon">
              <IdCardLanyard size={25}/>
            </Button>
            <Button to="/clientes" type="icon">
              <Users size={25}/>
            </Button>
            <Button to="/rotas" type="icon">
              <MapPinned size={25}/>
            </Button>
            <Button to="/financeiro" type="icon">
              <Wallet size={25}/>
            </Button>
    
          </aside>
    
            <Button onClick={() => authContext.callSignOut()} type="logout">
              <LogOut size={25} />
            </Button>
        </div>
        ) : (
        <div className="background bg-blue-950 w-50 align-center p-2 h-screen flex flex-col justify-between py-5">
            <button
              className="menu text-white m-auto cursor-pointer"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
    
    
          <aside className={`flex flex-col items-center gap-1 w-full my-5 h-full`}>
            <Button to="/dashboard" type="icon" addClasses="flex items-center justify-start pr-2 text-xl">
              <House size={25} className="pr-2"/>
              <p>Inicio</p>
            </Button>
            <Button to="/frota" type="icon" addClasses="flex items-center justify-start pr-2 text-xl">
              <Truck size={25} className="pr-2"/>
              <p>Frota</p>
            </Button>
            <Button to="/motoristas" type="icon" addClasses="flex items-center justify-start pr-2 text-xl">
              <IdCardLanyard size={25} className="pr-2"/>
              <p>Motoristas</p>
            </Button>
            <Button to="/clientes" type="icon" addClasses="flex items-center justify-start pr-2 text-xl">
              <Users size={25} className="pr-2"/>
              <p>Clientes</p>
            </Button>
            <Button to="/rotas" type="icon" addClasses="flex items-center justify-start pr-2 text-xl">
              <MapPinned size={25} className="pr-2"/>
              <p>Rotas</p>
            </Button>
            <Button to="/financeiro" type="icon" addClasses="flex items-center justify-start pr-2 text-xl">
              <Wallet size={25} className="pr-2"/>
              <p>Financeiro</p>
            </Button>
    
          </aside>
    
            <Button onClick={() => authContext.callSignOut()} type="logout">
              <LogOut size={25} />
            </Button>
        </div>
        )}
      </header>
  );
}
