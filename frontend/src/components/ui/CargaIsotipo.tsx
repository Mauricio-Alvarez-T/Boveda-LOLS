import React from 'react';
import { cn } from '../../utils/cn';

interface CargaIsotipoProps {
    /** Frases bajo el logo. Avanzan cada ~1 s y se quedan en la última (no dan vueltas, §9.2). */
    mensajes?: string[];
    className?: string;
}

const MENSAJES = ['Abriendo Bóveda…', 'Revisando tu sesión…', 'Preparando tu obra…'];

/**
 * Pantalla de carga: el isotipo de LOLS se arma pieza por pieza al centro (diseno.md §9.18).
 * Se ve al abrir Bóveda (mientras revisa la sesión) y al iniciar sesión; dentro de cada apartado
 * siguen las siluetas (§9.17).
 * El dibujo es el mismo de `Logo` (viewBox 220×240); el loop es CSS (`.isotipo-carga` de
 * index.css) para que corra en el compositor. Con «reducir movimiento» el isotipo aparece
 * completo y quieto, y las frases cambian sin fundido.
 */
export const CargaIsotipo: React.FC<CargaIsotipoProps> = ({ mensajes = MENSAJES, className }) => {
    const [indice, setIndice] = React.useState(0);

    React.useEffect(() => {
        if (indice >= mensajes.length - 1) return;
        const t = window.setTimeout(() => setIndice((n) => n + 1), 1100);
        return () => window.clearTimeout(t);
    }, [indice, mensajes.length]);

    return (
        <div
            role="status"
            aria-live="polite"
            className={cn('flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background pb-16', className)}
        >
            <svg viewBox="0 0 220 240" className="isotipo-carga h-[132px] w-[121px] text-brand-primary" aria-hidden="true">
                <rect className="pieza losa-baja" x="20" y="208" width="180" height="12" fill="currentColor" />
                <rect className="pieza muro" x="20" y="48" width="75" height="144" fill="currentColor" />
                <rect className="pieza bloque" x="115" y="152" width="85" height="40" fill="currentColor" />
                <rect className="ventana-1" x="119" y="52" width="77" height="32" fill="none" stroke="currentColor" strokeWidth="8" />
                <rect className="ventana-2" x="119" y="104" width="77" height="32" fill="none" stroke="currentColor" strokeWidth="8" />
                <rect className="pieza losa-alta" x="20" y="20" width="180" height="12" fill="currentColor" />
            </svg>
            <p className="text-title font-semibold tracking-tight text-foreground">Bóveda</p>
            <p key={indice} className="mensaje-carga text-ui text-muted-foreground">
                {mensajes[indice]}
            </p>
        </div>
    );
};
