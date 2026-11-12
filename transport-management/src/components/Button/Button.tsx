import { useNavigate } from "react-router"

interface dataButton{
    type: 'primary' | 'secondary' | 'outline' | 'logout'| 'icon' ;
    to?: string;
    children?: React.ReactNode;
    addClasses?: string;
    onClick?: () => void;
    disabled?: boolean;
    htmlType?: "button" | "submit";
}

function Button({type, to, children, addClasses = "", onClick, disabled, htmlType}: dataButton){
    const navigate = useNavigate();

    const types = {
        primary: 'bg-blue-700 text-white rounded-sm shadow-sm hover:bg-blue-800',
        secondary: 'bg-slate-800 text-white rounded-sm shadow-sm hover:bg-slate-900',
        outline: 'bg-white border border-slate-400 text-slate-900 rounded-sm hover:bg-slate-100 transition-colors',
        logout: 'bg-red-700 text-white rounded-sm shadow-sm hover:bg-red-800',
        icon: 'bg-transparent text-slate-900 rounded-sm hover:bg-slate-100'
    }
    
    return(
        <button 
            className={
                types[type] + " w-full min-h-14 flex items-center justify-center gap-2 px-5 py-3 text-base font-semibold transition-all duration-200 active:scale-95 active:bg-opacity-80 focus-visible:outline focus-visible:outline-3 focus-visible:outline-blue-700 " + addClasses
            }
            disabled={disabled}
            type={htmlType ?? "button"}
            onClick={() => {
                if (to) {
                    navigate(to);
                } else if (onClick) {
                    onClick();
                }
            }}
        >
            {children}
        </button>
    )
}

export default Button
