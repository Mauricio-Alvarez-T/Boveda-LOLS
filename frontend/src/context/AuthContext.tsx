import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, AuthResponse } from '../types';

interface AuthContextType {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (data: AuthResponse) => void;
    logout: () => void;
    hasPermission: (permiso: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        try {
            const savedToken = localStorage.getItem('sgdl_token');
            const savedUser = localStorage.getItem('sgdl_user');

            if (savedToken && savedUser && savedUser !== 'undefined') {
                setToken(savedToken);
                setUser(JSON.parse(savedUser));
            }
        } catch (error) {
            console.error('Error loading auth state:', error);
            localStorage.removeItem('sgdl_token');
            localStorage.removeItem('sgdl_user');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const login = (data: AuthResponse) => {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('sgdl_token', data.token);
        localStorage.setItem('sgdl_user', JSON.stringify(data.user));
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('sgdl_token');
        localStorage.removeItem('sgdl_user');
    };

    /** VERIFICA PERMISO TIPO GRANULAR */
    const hasPermission = (permiso: string): boolean => {
        if (!user || !user.permisos) return false;
        return user.permisos.includes(permiso);
    };

    return (
        <AuthContext.Provider value={{
            user,
            token,
            isAuthenticated: !!token,
            isLoading,
            login,
            logout,
            hasPermission
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
