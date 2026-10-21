import React, { useEffect, useState } from 'react';
import { History } from 'lucide-react';

import api from '../../services/api';
import { cn } from '../../utils/cn';
import { movimientoTipoConfig, type MovimientoTipo } from '../../utils/statusConfig';

interface Movimiento {
    id: number;
    tipo: MovimientoTipo;
    delta: number | string | null;
    cantidad_anterior: number | string | null;
    cantidad_nueva: number | string | null;
    referencia_tipo: string | null;
    referencia_id: number | null;
    motivo: string | null;
    created_at: string;
    obra_nombre: string | null;
    bodega_nombre: string | null;
    usuario_nombre: string | null;
}

const LIMITE = 50;

const fecha = (iso: string) => {
    const d = new Date(String(iso).replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' });
};

const referencia = (m: Movimiento) => {
    if (!m.referencia_tipo || !m.referencia_id) return null;
    if (m.referencia_tipo === 'transferencia') return `Solicitud #${m.referencia_id}`;
    if (m.referencia_tipo === 'discrepancia') return `Diferencia #${m.referencia_id}`;
    if (m.referencia_tipo === 'factura') return `Factura #${m.referencia_id}`;
    return `${m.referencia_tipo} #${m.referencia_id}`;
};

/**
 * Movimientos (kardex) de UN ítem, al lado de sus ubicaciones en el detalle del ítem (dueño 2026-10-21):
 * qué entró y salió, dónde, cuándo, quién y por qué. Los últimos 50; gate inventario.movimientos.ver lo
 * pone el padre.
 */
export const MovimientosItem: React.FC<{ itemId: number; unidad?: string | null }> = ({ itemId, unidad }) => {
    const [movs, setMovs] = useState<Movimiento[] | null>(null);
    const [total, setTotal] = useState(0);
    const [error, setError] = useState(false);

    useEffect(() => {
        // Un ítem por montaje: el padre usa key={itemId}, así que no hay estado que limpiar acá.
        let vivo = true;
        api.get<{ data: Movimiento[]; pagination?: { total?: number } }>('/inventario/movimientos', { params: { item_id: itemId, limit: LIMITE } })
            .then(res => { if (vivo) { setMovs(res.data.data ?? []); setTotal(Number(res.data.pagination?.total) || 0); } })
            .catch(() => { if (vivo) setError(true); });
        return () => { vivo = false; };
    }, [itemId]);

    return (
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border bg-muted px-3 py-2">
                <span className="text-caption font-black uppercase tracking-wider text-brand-dark">Movimientos</span>
                {movs && <span className="text-caption font-bold text-muted-foreground">{total > LIMITE ? `Últimos ${LIMITE} de ${total}` : `${movs.length}`}</span>}
            </div>
            {error ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">No se pudieron cargar los movimientos.</p>
            ) : !movs ? (
                <div className="space-y-2 p-3">
                    {[0, 1, 2].map(i => <div key={i} className="h-8 animate-pulse rounded-lg bg-muted/40" />)}
                </div>
            ) : movs.length === 0 ? (
                <div className="py-6 text-center">
                    <History className="mx-auto mb-2 h-8 w-8 text-muted-foreground/15" />
                    <p className="text-xs text-muted-foreground">Sin movimientos registrados</p>
                </div>
            ) : (
                <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                    {movs.map(m => {
                        const delta = Number(m.delta ?? (Number(m.cantidad_nueva) - Number(m.cantidad_anterior))) || 0;
                        const cfg = movimientoTipoConfig[m.tipo];
                        const ref = referencia(m);
                        return (
                            <li key={m.id} className="flex items-start gap-2.5 px-3 py-2">
                                <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-center gap-1.5">
                                        <span className={cn('rounded-full border px-1.5 py-px text-micro font-bold', cfg?.classes ?? 'bg-muted text-foreground border-border')}>
                                            {cfg?.label ?? m.tipo}
                                        </span>
                                        <span className="text-xs font-medium text-brand-dark break-words">{m.obra_nombre || m.bodega_nombre || '—'}</span>
                                    </span>
                                    <span className="mt-0.5 block text-micro text-muted-foreground break-words">
                                        {[fecha(m.created_at), m.usuario_nombre, ref].filter(Boolean).join(' · ')}
                                    </span>
                                    {m.motivo && <span className="block text-micro italic text-muted-foreground break-words">{m.motivo}</span>}
                                </span>
                                <span className={cn('shrink-0 text-xs font-black tabular-nums', delta > 0 ? 'text-green-700 dark:text-green-400' : delta < 0 ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground')}>
                                    {delta > 0 ? '+' : ''}{delta}{unidad ? ` ${unidad}` : ''}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};
