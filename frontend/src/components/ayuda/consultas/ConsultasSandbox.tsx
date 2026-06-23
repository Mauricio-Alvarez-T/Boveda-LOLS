import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../services/api';
import { AuthContext } from '../../../context/AuthContext';
import { userDemo } from './consultasMockData';
import { installConsultasMock } from './consultasMock';

/**
 * Sandbox para montar la pantalla REAL de Consultas en el Centro de ayuda sin tocar
 * producción:
 *  - Intercepta el axios `api` con axios-mock-adapter SOLO para los endpoints de
 *    consultas/trabajadores (datos en memoria); el resto pasa al backend real.
 *    Se restaura al desmontar (crítico).
 *  - Override de AuthContext (permisos all-true) para que la pantalla funcione a
 *    cualquier usuario. No se overridea ObraContext (el mock ignora el filtro de obra).
 * Renderiza children SOLO tras montar el mock (la pantalla fetchea al montar).
 */
export const ConsultasSandbox: React.FC<{ onAccion?: (tipo: string) => void; children: React.ReactNode }> = ({ onAccion, children }) => {
    const [ready, setReady] = useState(false);
    const cbRef = useRef(onAccion);
    cbRef.current = onAccion;

    useEffect(() => {
        const mock = installConsultasMock(api, { onAccion: (tipo) => cbRef.current?.(tipo) });
        setReady(true);
        return () => { mock.restore(); };
    }, []);

    const authValue = useMemo(() => ({
        user: userDemo, token: 'demo', isAuthenticated: true, isLoading: false,
        login: () => { /* no-op en demo */ }, logout: () => { /* no-op */ }, hasPermission: () => true,
    }), []);

    if (!ready) return null;

    return (
        <AuthContext.Provider value={authValue}>
            {children}
        </AuthContext.Provider>
    );
};
