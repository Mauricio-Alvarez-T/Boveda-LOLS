import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../services/api';
import { AuthContext } from '../../../context/AuthContext';
import { ObraContext } from '../../../context/ObraContext';
import { obraDemo, userDemo } from './asistenciaMockData';
import { installAsistenciaMock } from './asistenciaMock';

/**
 * Sandbox para montar las pantallas REALES de Asistencia en el Centro de ayuda sin
 * tocar producción:
 *  - Intercepta el axios `api` con axios-mock-adapter SOLO para los endpoints de
 *    asistencia (datos en memoria); todo lo demás pasa al backend real (passthrough).
 *    Se restaura al desmontar (crítico).
 *  - Override de AuthContext (permisos all-true) y ObraContext (obra demo) para que
 *    la pantalla real funcione para cualquier usuario.
 * Renderiza children SOLO tras montar el mock (la pantalla fetchea al montar).
 */
export const AsistenciaSandbox: React.FC<{ onGuardado?: () => void; children: React.ReactNode }> = ({ onGuardado, children }) => {
    const [ready, setReady] = useState(false);
    const cbRef = useRef(onGuardado);
    cbRef.current = onGuardado;

    useEffect(() => {
        const mock = installAsistenciaMock(api, () => cbRef.current?.());
        setReady(true);
        return () => { mock.restore(); };
    }, []);

    const authValue = useMemo(() => ({
        user: userDemo, token: 'demo', isAuthenticated: true, isLoading: false,
        login: () => { /* no-op en demo */ }, logout: () => { /* no-op */ }, hasPermission: () => true,
    }), []);
    const obraValue = useMemo(() => ({
        obras: [obraDemo], selectedObra: obraDemo, setSelectedObra: () => { /* no-op */ }, isLoading: false, refreshObras: () => { /* no-op */ },
    }), []);

    if (!ready) return null;

    return (
        <AuthContext.Provider value={authValue}>
            <ObraContext.Provider value={obraValue}>
                {children}
            </ObraContext.Provider>
        </AuthContext.Provider>
    );
};
