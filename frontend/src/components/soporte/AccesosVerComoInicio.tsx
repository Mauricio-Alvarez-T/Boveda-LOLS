import React, { Suspense } from 'react';
import { useAuth } from '../../context/AuthContext';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

/**
 * Lo que el Inicio monta (Dashboard.tsx): el recuadro «Lo que puede usar…» SOLO con «ver como» activo. El recuadro
 * (con el mapa de permisos de la pantalla) se baja recién entonces, así el Inicio de todos los demás no carga nada de
 * más (celulares lentos, 2026-10-21).
 */
const AccesosVerComo = lazyWithRetry(() => import('./AccesosVerComo'));

export const AccesosVerComoInicio: React.FC<{ className?: string }> = ({ className }) => {
    const { verComo } = useAuth();
    if (!verComo) return null;
    return (
        <Suspense fallback={null}>
            <AccesosVerComo className={className} />
        </Suspense>
    );
};
