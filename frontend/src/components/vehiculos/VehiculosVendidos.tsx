import React, { useMemo } from 'react';
import { Banknote, Calendar, TrendingUp, TrendingDown, User } from 'lucide-react';
import type { VehiculoVenta } from '../../types/entities';
import { formatCLP } from '../../utils/currency';
import { cn } from '../../utils/cn';
import { EmptyState } from '../ui/EmptyState';

const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });

const Skeleton: React.FC = () => (
    <div className="animate-pulse rounded-2xl border border-border bg-card h-44" />
);

/**
 * Historial de vehículos vendidos: cada venta muestra la diferencia entre el
 * precio de compra y el de venta (ganancia / pérdida). Se muestra en la página
 * de Vehículos como una "empresa" más (card "Vehículos vendidos" en la columna
 * de empresas → clic → este panel). El fetch vive en la página (Vehiculos.tsx)
 * para poder mostrar el contador en la card. Los montos llegan como string
 * (DECIMAL) → Number().
 */
interface Props {
    ventas: VehiculoVenta[];
    loading: boolean;
}

export const VehiculosVendidos: React.FC<Props> = ({ ventas, loading }) => {
    const neto = useMemo(
        () => ventas.reduce((sum, v) => sum + Number(v.diferencia || 0), 0),
        [ventas]
    );
    const netoPositivo = neto >= 0;

    return (
        <section className="flex flex-col flex-1 min-h-0 p-4 md:p-6">
            {/* Resultado neto (suma de ganancias / pérdidas de todas las ventas) */}
            {ventas.length > 0 && (
                <div className="shrink-0 mb-3 flex items-center gap-1.5 text-sm font-bold">
                    <Banknote className="h-4 w-4 text-brand-primary" />
                    <span className="text-muted-foreground">Resultado neto:</span>
                    <span className={cn(netoPositivo ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>
                        {netoPositivo ? '+' : '−'}{formatCLP(Math.abs(neto))}
                    </span>
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto">
                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {[1, 2, 3].map(i => <Skeleton key={i} />)}
                    </div>
                ) : ventas.length === 0 ? (
                    <EmptyState
                        icon={Banknote}
                        title="Sin vehículos vendidos"
                        description="Cuando vendas un vehículo desde su empresa, aparecerá aquí con la diferencia entre compra y venta."
                        className="h-full justify-center"
                    />
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 pb-4">
                        {ventas.map(v => {
                            const diferencia = Number(v.diferencia || 0);
                            const ganancia = diferencia >= 0;
                            return (
                                <div key={v.id} className="flex flex-col rounded-2xl border border-border bg-card shadow-sm p-4 gap-3">
                                    {/* Patente + tipo + empresa */}
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-black text-brand-dark break-words">{v.patente}</p>
                                            <p className="text-caption text-muted-foreground break-words">{v.marca} {v.modelo} {v.anio}</p>
                                        </div>
                                        <span className="shrink-0 text-caption px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-semibold capitalize">{v.tipo}</span>
                                    </div>

                                    {v.empresa_nombre && (
                                        <span className="inline-flex items-center gap-1.5 self-start rounded-full px-2 py-0.5 text-xs font-bold"
                                            style={{ color: v.empresa_color || '#64748b', backgroundColor: `${v.empresa_color || '#64748b'}1a` }}>
                                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: v.empresa_color || '#64748b' }} />
                                            {v.empresa_nombre}
                                        </span>
                                    )}

                                    {/* Fecha de venta */}
                                    <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
                                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                                        Vendido el {fmtDate(v.fecha_venta)}
                                    </div>

                                    {/* Compra / Venta */}
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div className="rounded-xl bg-muted/40 px-2.5 py-1.5">
                                            <p className="text-micro uppercase font-bold text-muted-foreground tracking-wide">Compra</p>
                                            <p className="font-bold text-brand-dark">{formatCLP(Number(v.precio_compra || 0))}</p>
                                        </div>
                                        <div className="rounded-xl bg-muted/40 px-2.5 py-1.5">
                                            <p className="text-micro uppercase font-bold text-muted-foreground tracking-wide">Venta</p>
                                            <p className="font-bold text-brand-dark">{formatCLP(Number(v.precio_venta || 0))}</p>
                                        </div>
                                    </div>

                                    {/* Diferencia (ganancia / pérdida) */}
                                    <div className={cn(
                                        'flex items-center justify-between gap-2 rounded-xl border px-3 py-2 mt-auto',
                                        ganancia
                                            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/20'
                                            : 'border-red-200 bg-red-50 dark:border-red-800/60 dark:bg-red-950/20'
                                    )}>
                                        <span className="flex items-center gap-1.5 text-xs font-bold text-brand-dark">
                                            {ganancia
                                                ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                                : <TrendingDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />}
                                            {ganancia ? 'Ganancia' : 'Pérdida'}
                                        </span>
                                        <span className={cn(
                                            'text-sm font-black',
                                            ganancia ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
                                        )}>
                                            {ganancia ? '+' : '−'}{formatCLP(Math.abs(diferencia))}
                                        </span>
                                    </div>

                                    {(v.comprador || v.observaciones) && (
                                        <div className="text-caption text-muted-foreground space-y-0.5 border-t border-border/60 pt-2">
                                            {v.comprador && (
                                                <p className="flex items-center gap-1.5">
                                                    <User className="h-3.5 w-3.5 shrink-0" /> {v.comprador}
                                                </p>
                                            )}
                                            {v.observaciones && <p className="break-words">{v.observaciones}</p>}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
};
