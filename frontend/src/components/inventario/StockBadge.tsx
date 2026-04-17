import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export type StockEstado = 'ok' | 'justo' | 'insuficiente' | 'vacio';

export interface StockUbicacion {
    type: string;
    id: number;
    nombre: string;
    cantidad: number;
}

interface Props {
    disponible: number;
    solicitado?: number;
    ubicaciones?: StockUbicacion[];
    unidad?: string;
    className?: string;
}

/**
 * Chip con indicador visual de stock disponible vs solicitado.
 * Verde: holgura. Ámbar: justo. Rojo: insuficiente o vacío.
 * Hover: tooltip con desglose por ubicación.
 */
export const StockBadge: React.FC<Props> = ({ disponible, solicitado, ubicaciones = [], unidad = 'u', className = '' }) => {
    const [hover, setHover] = useState(false);
    const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
    const chipRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (hover && chipRef.current) {
            const rect = chipRef.current.getBoundingClientRect();
            setCoords({ top: rect.bottom + 6, left: rect.left });
        }
    }, [hover]);

    let estado: StockEstado = 'ok';
    let label = `${disponible} disp`;

    if (disponible === 0) {
        estado = 'vacio';
        label = 'Sin stock';
    } else if (solicitado != null && solicitado > 0) {
        if (solicitado > disponible) {
            estado = 'insuficiente';
            label = `Solo ${disponible} disp`;
        } else if (solicitado === disponible) {
            estado = 'justo';
            label = `Justo ${disponible}`;
        } else {
            estado = 'ok';
            label = `${disponible} disp`;
        }
    }

    const colors: Record<StockEstado, string> = {
        ok: 'bg-green-50 text-green-700 border-green-200',
        justo: 'bg-amber-50 text-amber-700 border-amber-200',
        insuficiente: 'bg-red-50 text-red-700 border-red-200',
        vacio: 'bg-red-50 text-red-700 border-red-200',
    };

    const hasBreakdown = ubicaciones.length > 0 && disponible > 0;

    return (
        <>
            <span
                ref={chipRef}
                onMouseEnter={() => hasBreakdown && setHover(true)}
                onMouseLeave={() => setHover(false)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold border rounded-full ${colors[estado]} ${hasBreakdown ? 'cursor-help' : ''} ${className}`}
            >
                {label}
            </span>

            {hover && hasBreakdown && coords && createPortal(
                <div
                    style={{ top: coords.top, left: coords.left, position: 'fixed', zIndex: 9999 }}
                    className="bg-white border border-[#E8E8ED] rounded-xl shadow-lg px-3 py-2 text-[11px] min-w-[180px] pointer-events-none"
                >
                    <div className="font-bold text-brand-dark mb-1.5">Stock por ubicación</div>
                    <div className="space-y-0.5">
                        {ubicaciones.map((u, i) => (
                            <div key={`${u.type}-${u.id}-${i}`} className="flex justify-between gap-3 text-muted-foreground">
                                <span className="truncate">{u.nombre}</span>
                                <span className="font-mono font-semibold text-brand-dark">{u.cantidad} {unidad}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-1.5 pt-1.5 border-t border-[#E8E8ED] flex justify-between font-bold">
                        <span>Total</span>
                        <span className="font-mono">{disponible} {unidad}</span>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default StockBadge;
