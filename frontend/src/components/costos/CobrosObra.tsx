import React from 'react';
import { HandCoins, Plus } from 'lucide-react';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { fmtMoney, fmtFechaCorta } from '../../utils/format';
import { hoyISO } from './costosConfig';
import { Kpi } from './piezas';
import type { CostoCobro, CostoResumen } from '../../types/entities';

/**
 * Cobros al mandante de una obra: lo cobrado, lo que falta por cobrar y lo retenido. Es lo que
 * ENTRA en el flujo de caja (los gastos por pagar son lo que sale).
 */
export const CobrosObra: React.FC<{
    cobros: CostoCobro[];
    resumen: CostoResumen['cobros'];
    bloqueada: boolean;
    onNuevo: () => void;
    onAbrir: (c: CostoCobro) => void;
}> = ({ cobros, resumen, bloqueada, onNuevo, onAbrir }) => {
    const hoy = hoyISO();

    if (!cobros.length) {
        return (
            <EmptyState icon={HandCoins} title="Sin cobros cargados"
                description="Agrega lo que se espera cobrar al mandante (anticipo, cada estado de pago, la devolución de retenciones). Con eso el flujo de caja sabe qué plata entra y cuándo."
                action={!bloqueada && <Button onClick={onNuevo} leftIcon={<Plus className="h-4 w-4" />}>Agregar cobro</Button>} />
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <Kpi icon={HandCoins} label="Cobrado" valor={fmtMoney(resumen.cobrado.total) || '$0'} nota={`${resumen.cobrado.n} cobro${resumen.cobrado.n === 1 ? '' : 's'} · ${fmtMoney(resumen.cobrado.neto) || '$0'} neto`} />
                <Kpi icon={HandCoins} label="Por cobrar" valor={fmtMoney(resumen.por_cobrar.total) || '$0'} nota={`${resumen.por_cobrar.n} cobro${resumen.por_cobrar.n === 1 ? '' : 's'} · ${fmtMoney(resumen.por_cobrar.neto) || '$0'} neto`} />
                <Kpi icon={HandCoins} label="Retenido por el mandante" valor={fmtMoney(resumen.retenido) || '$0'} nota="se cobra con la devolución de retenciones" />
            </div>

            {!bloqueada && (
                <div className="flex justify-end">
                    <Button onClick={onNuevo} leftIcon={<Plus className="h-4 w-4" />}>Agregar cobro</Button>
                </div>
            )}

            <ul className="flex flex-col gap-2">
                {cobros.map(c => {
                    const atrasado = c.estado === 'por_cobrar' && c.fecha < hoy;
                    return (
                        <li key={c.id}>
                            {/* eslint-disable-next-line no-restricted-syntax -- tarjeta de cobro (glosa, fechas, montos y estado); Button no soporta este layout */}
                            <button type="button" onClick={() => onAbrir(c)} disabled={bloqueada}
                                className="flex w-full items-start gap-3 rounded-card border border-border bg-card p-3.5 text-left transition-colors enabled:hover:border-muted-foreground/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 disabled:cursor-default">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                                    <HandCoins className="h-4 w-4 text-muted-foreground" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-start justify-between gap-3">
                                        <span className="min-w-0 truncate text-sm font-semibold text-brand-dark">{c.glosa}</span>
                                        <span className="shrink-0 text-sm font-bold text-brand-dark tabular-nums">{fmtMoney(c.total)}</span>
                                    </span>
                                    <span className="mt-0.5 flex items-start justify-between gap-3 text-caption text-muted-foreground">
                                        <span className="min-w-0 truncate">
                                            {c.estado === 'cobrado' ? `Cobrado el ${fmtFechaCorta(c.fecha_cobro || c.fecha)}` : `Se espera el ${fmtFechaCorta(c.fecha)}`}
                                        </span>
                                        <span className="shrink-0 tabular-nums">
                                            neto {fmtMoney(c.monto_neto)}{Number(c.retencion) > 0 ? ` · retiene ${fmtMoney(c.retencion)}` : ''}
                                        </span>
                                    </span>
                                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                        {c.estado === 'cobrado'
                                            ? <Chip tone="success" label="Cobrado" />
                                            : atrasado ? <Chip tone="danger" label={`Atrasado desde ${fmtFechaCorta(c.fecha)}`} /> : <Chip tone="warning" label="Por cobrar" />}
                                        {c.observacion && <span className="truncate text-caption text-muted-foreground">{c.observacion}</span>}
                                    </span>
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

export default CobrosObra;
