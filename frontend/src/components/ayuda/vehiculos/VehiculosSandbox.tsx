import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../services/api';
import { AuthContext } from '../../../context/AuthContext';
import { userDemo } from './vehiculosMockData';
import { installVehiculosMock } from './vehiculosMock';

/**
 * Sandbox para montar la pantalla REAL de Vehículos en el Centro de ayuda sin tocar
 * producción:
 *  - Intercepta el axios `api` con axios-mock-adapter SOLO para los endpoints de
 *    vehículos (datos en memoria); todo lo demás pasa al backend real (passthrough).
 *    Se restaura al desmontar (crítico).
 *  - Override de AuthContext (permisos all-true) para que la pantalla real funcione
 *    para cualquier usuario. Vehículos NO usa ObraContext (la flota es global).
 * Renderiza children SOLO tras montar el mock (la pantalla fetchea al montar).
 */
export const VehiculosSandbox: React.FC<{ onAccion?: (tipo: string) => void; children: React.ReactNode }> = ({ onAccion, children }) => {
    const [ready, setReady] = useState(false);
    const cbRef = useRef(onAccion);
    cbRef.current = onAccion;

    useEffect(() => {
        const mock = installVehiculosMock(api, { onAccion: (tipo) => cbRef.current?.(tipo) });
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
