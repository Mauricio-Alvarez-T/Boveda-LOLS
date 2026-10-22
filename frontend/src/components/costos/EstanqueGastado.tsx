// Idea: Slosh Gauge de React Bits (reactbits.dev, MIT + Commons Clause). Reescrito; sin código copiado.
import React, { useId, useState } from 'react';
import { cn } from '../../utils/cn';
import type { Semaforo } from './costosConfig';

/**
 * Estanque del «Gastado» en el Resumen de Presupuestos (2026-10-20, detalle para gerencia): el líquido
 * llega hasta el % del presupuesto que ya se gastó, en el color del semáforo (verde bajo 85 %, ámbar
 * 85–100 %, rojo pasado). Al cambiar el %, el líquido sube o baja en 250 ms y su superficie se inclina
 * hacia donde se movió y se asienta (diseno.md §9.2: el movimiento dice hacia dónde cambió algo). Solo
 * el porcentaje: el dinero nunca se anima (§9.4). Sobre 100 % queda lleno con una marca de rebalse.
 * Con «reducir movimiento» cambia en seco (las clases `motion-safe:`).
 */

const COLOR: Record<Semaforo, string> = {
    ok: 'text-brand-primary',
    cerca: 'text-warning',
    pasado: 'text-destructive',
    sin: 'text-muted-foreground/40',
};

interface Props {
    /** % gastado del presupuesto (puede pasar de 100); null = sin presupuesto. */
    pct: number | null;
    semaforo: Semaforo;
    className?: string;
}

export const EstanqueGastado: React.FC<Props> = ({ pct, semaforo, className }) => {
    const nivel = pct === null ? 0 : Math.max(0, Math.min(100, pct));
    const rebalse = pct !== null && pct > 100;
    // Dirección del último cambio, ajustada durante el render (diseno.md §9.9), y una «ola» por cambio.
    const [previo, setPrevio] = useState(nivel);
    const [ola, setOla] = useState<{ n: number; dir: 1 | -1 }>({ n: 0, dir: 1 });
    if (!Object.is(nivel, previo)) {
        setPrevio(nivel);
        setOla(o => ({ n: o.n + 1, dir: nivel > previo ? 1 : -1 }));
    }
    const y = 64 - (nivel / 100) * 56; // tanque interior de 8 a 64 (viewBox 48×72)
    const recorte = `estanque-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

    return (
        <svg viewBox="0 0 48 72" className={cn('h-14 w-10 shrink-0', COLOR[semaforo], className)} role="img"
            aria-label={pct === null ? 'Sin presupuesto' : `Gastado ${Math.round(pct)} % del presupuesto`}>
            <defs>
                <clipPath id={recorte}>
                    <rect x="6" y="8" width="36" height="56" rx="7" />
                </clipPath>
            </defs>
            {/* Líquido: sube/baja con transform (compositor); la superficie se mece una vez por cambio. */}
            <g clipPath={`url(#${recorte})`}>
                <g className="motion-safe:transition-transform motion-safe:duration-[250ms] motion-safe:ease-out" style={{ transform: `translateY(${y - 8}px)` }}>
                    <g key={ola.n} className={cn(ola.n > 0 && 'motion-safe:animate-[estanque-ola_250ms_ease-out]')}
                        style={{ transformOrigin: '24px 8px', ['--ola-dir' as string]: String(ola.dir) }}>
                        <path d="M-6 8 Q 6 4 18 8 T 42 8 T 66 8 V 80 H -6 Z" fill="currentColor" opacity="0.88" />
                    </g>
                </g>
            </g>
            {/* Tanque: contorno y marcas de 25/50/75 %. */}
            <rect x="6" y="8" width="36" height="56" rx="7" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="2" />
            {[25, 50, 75].map(m => (
                <line key={m} x1="36" x2="42" y1={64 - (m / 100) * 56} y2={64 - (m / 100) * 56} stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
            ))}
            {rebalse && <path d="M12 6 Q 24 -1 36 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />}
        </svg>
    );
};

export default EstanqueGastado;
