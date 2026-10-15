// Idea: Counter de React Bits (reactbits.dev, MIT + Commons Clause). Reescrito; sin código copiado.
import React, { useState } from 'react';
import { cn } from '../../utils/cn';
import { fmtNumber } from '../../utils/format';
import { direccionCambio, type Direccion } from '../../utils/movimiento';

interface NumeroRodanteProps {
    /** Conteo entero o porcentaje. NUNCA dinero (diseno.md §9: prohibido animar montos). */
    value: number;
    className?: string;
}

/**
 * Cifra que dice hacia dónde cambió (diseno.md §9, Movimiento): si sube, el número
 * nuevo entra desde abajo; si baja, desde arriba (160 ms, keyframes `numero-sube` /
 * `numero-baja` en index.css). Sin count-up: nunca muestra valores intermedios, el
 * viejo desaparece y entra el real. Sin animación de salida.
 *
 * - El primer render es SIEMPRE estático (dirección 0).
 * - La dirección se ajusta durante el render al cambiar `value` (patrón de React
 *   "ajustar estado cuando cambia una prop"), no en un efecto: un efecto llega un
 *   frame tarde y rompe la regla set-state-in-effect.
 * - CSS puro + `React.memo`: los re-render de la fila padre por cada tecla no
 *   tocan nada si el número no cambió (§8.13). Por eso tampoco hay prop de formato:
 *   siempre `fmtNumber` (§5).
 * - Con `prefers-reduced-motion` los keyframes no existen y el número cambia en seco.
 * - El nodo de texto tiene siempre el valor real: no hace falta copia `sr-only`.
 */
export const NumeroRodante = React.memo(function NumeroRodante({ value, className }: NumeroRodanteProps) {
    const [previo, setPrevio] = useState(value);
    const [dir, setDir] = useState<Direccion>(0);
    // Object.is y no `!==`: con NaN, `NaN !== NaN` re-renderizaría en bucle.
    if (!Object.is(value, previo)) {
        setDir(direccionCambio(previo, value));
        setPrevio(value);
    }

    return (
        <span className={cn('inline-flex overflow-clip tabular-nums', className)}>
            {/* key={value}: cada número nuevo es un nodo nuevo, así la animación corre de cero. */}
            <span key={value} className={cn('inline-block', dir === 1 && 'numero-sube', dir === -1 && 'numero-baja')}>
                {fmtNumber(value)}
            </span>
        </span>
    );
});
