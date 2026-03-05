import { useState } from "react";
import { useNavigate } from "react-router"

interface dataButton{
    type: 'primary' | 'secondary' | 'outline' | 'logout';
    to?: string;
    children?: React.ReactNode;
    onClick?: () => void;
}

function Button({type, to, children, onClick}: dataButton){
    const navigate = useNavigate();

    const types = {
        primary: 'bg-blue-600 text-white p-2 rounded-lg rounded-xl',
        secondary: 'bg-gray-500 text-gray-200 p-2 rounded-lg rounded-xl',
        outline: 'bg-gray-50 border border-gray-300 text-gray-600 p-2 rounded-lg hover:bg-gray-100 hover:text-gray-500 hover:border-gray-100 transition-all',
        logout: 'bg-red-600 text-white p-2 rounded-lg flex items-center gap-2 hover:bg-red-700 transition-all'
    }
    
    return(
        <button 
            className={types[type] + "w-max[300px] w-full flex items-center justify-center p-2" } 
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