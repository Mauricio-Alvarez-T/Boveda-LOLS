import React, { useMemo } from 'react';
import { Truck } from 'lucide-react';
import { Chip } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';
import { textoVencimiento, etiquetaVencimiento } from '../../../utils/vencimientos';
import type { VehiculoVencimiento } from '../../../types/entities';

interface Props {
    data: VehiculoVencimiento[];
    onNavigate: () => void;
}

/** Filas visibles antes de cortar con "+ N más" (mismo criterio que Ausentes del Día). */
const MAX_FILAS = 8;

/**
 * Vencimientos de vehículos — panel DESTACADO del Inicio (decisión usuario
 * 2026-08-25: junto con los ausentes del día son los dos datos que la empresa
 * mira primero).
 *
 * Cubre las TRES fuentes que el backend ya agrega en `getVencimientos(30)`:
 * documentos (permiso de circulación, seguro, padrón, póliza), revisiones
 * (técnica y de gases) y mantenciones. Es exactamente lo que cuenta el badge
 * del menú Vehículos — misma request compartida vía `useVencimientosVehiculos`,
 * así que este panel no agrega tráfico ni puede desincronizarse del contador.
 *
 * Color = estado (regla 4 del DS): rojo solo para lo YA vencido, ámbar para lo
 * que está por vencer. El resto de la fila va neutro.
 */
const VehicleExpiries: React.FC<Props> = ({ data, onNavigate }) => {
    // Más urgente primero: dias_restantes ascendente deja arriba los negativos
    // (ya vencidos) y luego lo que vence antes.
    const items = useMemo(
        () => [...data].sort((a, b) => Number(a.dias_restantes) - Number(b.dias_restantes)),
        [data],
    );
    const vencidos = useMemo(
        () => items.filter(v => Number(v.dias_restantes) < 0).length,
        [items],
    );

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                        <Truck className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">Vencimientos de Vehículos</h3>
                </div>
                {vencidos > 0
                    ? <Chip tone="danger" label={`${vencidos} vencido${vencidos === 1 ? '' : 's'}`} className="shrink-0" />
                    : (
                        <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
                            {items.length} total
                        </span>
                    )}
            </div>
            <div className="space-y-2">
                {items.length > 0 ? (
                    items.slice(0, MAX_FILAS).map(v => (
                        <button
                            key={`${v.categoria}-${v.id}`}
                            type="button"
                            onClick={onNavigate}
                            className="flex w-full items-center gap-3 p-2 rounded-xl text-left hover:bg-background transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
                        >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                                <Truck className="h-5 w-5 text-muted-foreground" />
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                    {v.patente || 'Sin patente'} · {etiquetaVencimiento(v.categoria, v.subtipo)}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                    {[v.marca, v.modelo].filter(Boolean).join(' ') || 'Sin marca registrada'}
                                </p>
                            </div>
                            <Chip
                                tone={Number(v.dias_restantes) < 0 ? 'danger' : 'warning'}
                                label={textoVencimiento(Number(v.dias_restantes))}
                                className="shrink-0"
                            />
                        </button>
                    ))
                ) : (
                    <EmptyState className="py-8" icon={Truck} title="Sin vencimientos en los próximos 30 días." />
                )}
                {items.length > MAX_FILAS && (
                    <p className="text-xs text-muted-foreground text-center pt-1">
                        + {items.length - MAX_FILAS} más
                    </p>
                )}
            </div>
        </div>
    );
};

export default VehicleExpiries;
