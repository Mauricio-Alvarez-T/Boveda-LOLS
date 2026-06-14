import React from 'react';
import { Info } from 'lucide-react';
import { cn } from '../../../utils/cn';

/**
 * Banner educativo de Segregación de Funciones (SoD): explica por qué el usuario
 * actual no puede avanzar la TRF según su rol previo. Antes estaba duplicado en
 * los 2 layouts del detalle (catálogo / materiales); extraído en Fase 1 para
 * tener una sola fuente. Retorna null si no aplica ningún caso.
 */
export const SodBanner: React.FC<{
    solicitante: boolean;
    aprobador: boolean;
    transportista: boolean;
    /** Clases extra del wrapper (ej. "shrink-0 mb-3" en el layout de catálogo). */
    className?: string;
}> = ({ solicitante, aprobador, transportista, className }) => {
    if (!solicitante && !aprobador && !transportista) return null;
    return (
        <div className={cn("bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900 rounded-xl p-3 flex items-start gap-2.5 text-sm", className)}>
            <Info className="h-4 w-4 text-amber-700 dark:text-amber-300 mt-0.5 shrink-0" />
            <div>
                <strong className="text-amber-900 dark:text-amber-300">SoD activo:</strong>
                <span className="text-amber-800 dark:text-amber-300">
                    {solicitante && ' tú creaste esta solicitud — otro usuario con permiso "Aprobar Transferencia" debe revisarla. '}
                    {aprobador && ' tú aprobaste esta transferencia — otro usuario debe despacharla o recibirla. '}
                    {transportista && ' tú despachaste esta transferencia — otro usuario debe confirmar la recepción. '}
                    Si no hay otra persona disponible, contacta al admin para que conceda el permiso "Bypass SoD".
                </span>
            </div>
        </div>
    );
};
