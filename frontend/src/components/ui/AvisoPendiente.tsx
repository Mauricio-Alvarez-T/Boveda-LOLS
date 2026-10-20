// Idea: Star Border de React Bits (reactbits.dev, MIT + Commons Clause). Reescrito; sin código copiado.
import React, { useState } from 'react';

/**
 * «Falta guardar» sobre un botón (2026-10-20, Guardar de asistencia): una luz ámbar recorre el borde del
 * botón DOS vueltas y se apaga, y queda un punto ámbar en la esquina mientras siga pendiente. Ámbar =
 * pendiente (regla 4 del DS). Las vueltas se repiten solo cuando el estado pasa de «al día» a
 * «pendiente» (no a cada cambio: molestaría mientras se edita). Con «reducir movimiento», solo el punto.
 *
 * Va DENTRO de un contenedor `relative` que envuelve al botón. `radio` = el redondeo del botón en px.
 */
export const AvisoPendiente: React.FC<{ activo: boolean; radio?: number }> = ({ activo, radio = 12 }) => {
    // Una vuelta nueva cada vez que pasa a pendiente (ajuste durante el render, diseno.md §9.9).
    const [previo, setPrevio] = useState(activo);
    const [vuelta, setVuelta] = useState(activo ? 1 : 0);
    if (activo !== previo) {
        setPrevio(activo);
        if (activo) setVuelta(v => v + 1);
    }
    if (!activo) return null;
    return (
        <>
            <svg aria-hidden className="pointer-events-none absolute -inset-[3px] h-[calc(100%+6px)] w-[calc(100%+6px)] overflow-visible text-warning">
                <rect key={vuelta} x="1.5" y="1.5" rx={radio + 2} pathLength={100} fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" className="luz-pendiente"
                    style={{ width: 'calc(100% - 3px)', height: 'calc(100% - 3px)' }} />
            </svg>
            <span aria-hidden className="pointer-events-none absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-warning ring-2 ring-background" />
        </>
    );
};

export default AvisoPendiente;
