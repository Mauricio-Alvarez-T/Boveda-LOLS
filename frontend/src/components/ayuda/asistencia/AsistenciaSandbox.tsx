import React, { useEffect, useMemo, useRef, useState } from 'react';
import MockAdapter from 'axios-mock-adapter';
import api from '../../../services/api';
import { AuthContext } from '../../../context/AuthContext';
import { ObraContext } from '../../../context/ObraContext';
import { obraDemo, userDemo, estadosDemo, trabajadoresDemo, horariosDemo } from './asistenciaMockData';

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
        const mock = new MockAdapter(api, { onNoMatch: 'passthrough', delayResponse: 150 });
        mock.onGet('/asistencias/estados').reply(200, { data: estadosDemo });
        mock.onGet(/\/trabajadores(\?|$)/).reply(200, { data: trabajadoresDemo });
        mock.onGet(/\/asistencias\/obra\//).reply(200, { data: { registros: [], feriado: null } });
        mock.onGet(/\/config-horarios\/obra\//).reply(200, { data: horariosDemo });
        mock.onGet(/\/asistencias\/periodos/).reply(200, { data: [] });
        mock.onGet(/\/asistencias\/alertas\//).reply(200, { data: [] });
        mock.onPost(/\/asistencias\/bulk\//).reply(() => {
            cbRef.current?.();
            return [200, { data: { message: 'Asistencia guardada' } }];
        });
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
