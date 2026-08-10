import React, { createContext, useState, useEffect } from 'react';
import { getSession } from '../lib/session';
import { signOut } from '../lib/user';

interface AuthContextType {
    isAuthenticated: boolean;
    userId: string | null;
    tenantId: string | null;
    toggleAuth: () => void;
    setUserId: (id: string | null) => void;
    callSignOut: () => void;
    setTenantId: (id: string | null) => void;
}
        
interface AuthContextProviderProps {
    children?: React.ReactNode;
}

export const AuthContext = createContext<AuthContextType>({
    isAuthenticated: false,
    userId: null,
    tenantId: null,
    toggleAuth: () => {},
    setUserId: () => {},
    callSignOut: () => {},
    setTenantId: () => {}
});

export function AuthContextProvider({ children }: AuthContextProviderProps) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [tenantId, setTenantId] = useState<string | null>(null);

    const toggleAuth = () => setIsAuthenticated(prev => !prev);

    const callSignOut = () => {
        setIsAuthenticated(false);
        setUserId(null);
        setTenantId(null);
        fetchSignOut();
    }
    
    useEffect(() => {
        fetchSession();
    }, []);

    const fetchSignOut = async () => {
        const response = await signOut();
        console.log("Sign-out successful:", response);
        
    }
    
    const fetchSession = async () => {
        const session = await getSession();
        console.log("Session:", session);

        if (session?.session?.user) {
            setUserId(session.session.user.id);
            setIsAuthenticated(true);
        } else {
            setUserId(null);
            setIsAuthenticated(false);
        }
    };


    return (
        <AuthContext.Provider value={{ isAuthenticated, userId, toggleAuth, setUserId, callSignOut, setTenantId, tenantId }}>
            {children}
        </AuthContext.Provider>
    );
}