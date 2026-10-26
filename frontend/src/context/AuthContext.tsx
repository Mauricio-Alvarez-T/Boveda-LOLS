import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import type { User, AuthResponse } from '../types';
import {
    AVISOS_VER_COMO, almacenSesion, borrarSesionVerComo, guardarAvisoVerComo, guardarSesionVerComo,
    leerSesionVerComo, rutaAlSalir, sesionDesdeRespuesta, tokenVerComoGuardado, tomarAvisoVerComo,
    type FichaVerComo, type RespuestaVerComo, type SesionVerComo,
} from './verComoSesion';

interface AuthContextType {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (data: AuthResponse) => void;
    logout: () => void;
    hasPermission: (permiso: string) => boolean;
    /**
     * «Ver como esta persona» (Soporte · usuarios, solo Super Administrador): la sesión prestada en curso, o null si es
     * la cuenta propia. Mientras dura, `user`/`token`/`hasPermission` son los de la otra persona (así la app se ve tal
     * cual la ve ella) y el servidor rechaza todo lo que no sea lectura. Opcional: los sandbox de Ayuda no lo traen.
     */
    verComo?: SesionVerComo | null;
    /**
     * Entra a «ver como» con la respuesta del servidor y abre el Inicio de esa persona (recarga la app). `ficha` = lo de su
     * ficha de Soporte (nombres y origen de sus permisos), para el recuadro «Lo que puede usar…» del Inicio.
     */
    entrarVerComo?: (r: RespuestaVerComo, ficha?: FichaVerComo | null) => void;
    /** Vuelve a la cuenta propia (recarga en Soporte). `aviso`: qué decir al volver (venció, etc.). */
    salirVerComo?: (aviso?: string) => void;
}

// Exportado para overrides controlados (ej. sandbox del Centro de ayuda).
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Entrar o salir de «ver como» RECARGA la app (no solo cambia el estado): cada store en memoria, la caché de
 * consultas y las obras del selector se vuelven a pedir con el token que corresponde. Así nunca queda en pantalla un
 * dato de una cuenta con el menú de la otra.
 */
const recargarEn = (ruta: string) => { window.location.assign(ruta); };

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [verComo, setVerComo] = useState<SesionVerComo | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        try {
            // «Ver como» en esta pestaña (sessionStorage): si está vigente, la app es de la otra persona.
            const ses = almacenSesion();
            const habiaPrestada = tokenVerComoGuardado(ses) !== null;
            const prestada = leerSesionVerComo(ses);
            if (prestada) {
                setToken(prestada.token);
                setUser(prestada.user);
                setVerComo(prestada);
                return;
            }
            // Venció mientras la pestaña estaba cerrada o en segundo plano: se vuelve a la propia, avisando.
            if (habiaPrestada) guardarAvisoVerComo(ses, AVISOS_VER_COMO.vencio);

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

    // El aviso que dejó la salida de «ver como» (se dice después de recargar, con el Toaster ya montado).
    useEffect(() => {
        const aviso = tomarAvisoVerComo(almacenSesion());
        if (!aviso) return;
        const t = window.setTimeout(() => toast.info(aviso), 400);
        return () => window.clearTimeout(t);
    }, []);

    const login = useCallback((data: AuthResponse) => {
        // Una sesión nueva nunca hereda un «ver como» de esta pestaña.
        borrarSesionVerComo(almacenSesion());
        setVerComo(null);
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('sgdl_token', data.token);
        localStorage.setItem('sgdl_user', JSON.stringify(data.user));
        // Recién inició sesión: la ventana de documentos fuera de plazo (AlertaAtrasosAlEntrar) la lee y la borra.
        try { sessionStorage.setItem('sgdl_recien_ingreso', '1'); } catch { /* sin sessionStorage: no hay ventana */ }
    }, []);

    const salirVerComo = useCallback((aviso?: string) => {
        const ses = almacenSesion();
        const volverA = rutaAlSalir(ses); // la ficha de quien se estaba mirando
        borrarSesionVerComo(ses);
        if (aviso) guardarAvisoVerComo(ses, aviso);
        recargarEn(volverA);
    }, []);

    const entrarVerComo = useCallback((r: RespuestaVerComo, ficha?: FichaVerComo | null) => {
        const s = sesionDesdeRespuesta(r, ficha);
        if (!s || !guardarSesionVerComo(almacenSesion(), s)) {
            toast.error('No se pudo abrir «ver como»: este navegador no deja guardar la sesión de la pestaña.');
            return;
        }
        recargarEn('/');
    }, []);

    const logout = useCallback(() => {
        // Con «ver como», «Cerrar sesión» cierra solo la prestada y vuelve a la propia.
        if (verComo) { salirVerComo(); return; }
        setToken(null);
        setUser(null);
        localStorage.removeItem('sgdl_token');
        localStorage.removeItem('sgdl_user');
    }, [verComo, salirVerComo]);

    // Cerró su sesión propia en otra pestaña: también se cierra la prestada (no sigue mirando sin cuenta).
    useEffect(() => {
        if (!verComo) return;
        const alCambiar = (e: StorageEvent) => {
            if (e.key === 'sgdl_token' && e.newValue === null) {
                const ses = almacenSesion();
                borrarSesionVerComo(ses);
                guardarAvisoVerComo(ses, AVISOS_VER_COMO.cerroSesionPropia);
                recargarEn('/login');
            }
        };
        window.addEventListener('storage', alCambiar);
        return () => window.removeEventListener('storage', alCambiar);
    }, [verComo]);

    /**
     * VERIFICA PERMISO TIPO GRANULAR.
     * Memoizado por `user`: una identidad estable evita que los consumidores que
     * ponen `hasPermission` en deps de useEffect/useCallback se re-disparen en
     * cada render del provider (causaba refetches espurios, ej. en Asistencia).
     */
    const hasPermission = useCallback((permiso: string): boolean => {
        if (!user || !user.permisos) return false;
        return user.permisos.includes(permiso);
    }, [user]);

    // value memoizado para no romper la estabilidad de las funciones de arriba.
    const value = useMemo(() => ({
        user,
        token,
        isAuthenticated: !!token,
        isLoading,
        login,
        logout,
        hasPermission,
        verComo,
        entrarVerComo,
        salirVerComo,
    }), [user, token, isLoading, login, logout, hasPermission, verComo, entrarVerComo, salirVerComo]);

    return (
        <AuthContext.Provider value={value}>
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
