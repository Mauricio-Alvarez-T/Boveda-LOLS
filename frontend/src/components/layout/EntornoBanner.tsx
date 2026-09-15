/**
 * Franja de entorno (2026-09-15). Staging y producción se veían idénticos: la misma pantalla, el
 * mismo menú, los mismos nombres. Esta franja deja claro cuándo NO estás en producción, para que
 * nadie trabaje de verdad sobre datos ficticios ni asuma que lo de staging es real.
 *
 * Se activa con `VITE_ENTORNO=staging` en el build (lo pone el workflow de staging). En producción
 * la variable no existe y el componente no renderiza nada — cero peso visual y cero riesgo de que
 * aparezca donde no debe.
 */
import React from 'react';
import { FlaskConical } from 'lucide-react';

export const EntornoBanner: React.FC = () => {
    if (import.meta.env.VITE_ENTORNO !== 'staging') return null;

    return (
        <div role="status"
            className="shrink-0 flex items-center justify-center gap-2 bg-amber-500 px-3 py-1 text-center text-caption font-semibold text-white">
            <FlaskConical aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span>Entorno de pruebas · los datos son ficticios, no uses esto como registro oficial</span>
        </div>
    );
};
