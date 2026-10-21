import React, { useMemo } from 'react';
import { Truck } from 'lucide-react';
import { Chip } from '../../ui/Chip';
import { Button } from '../../ui/Button';
import { textoVencimiento, etiquetaVencimiento } from '../../../utils/vencimientos';
import type { VehiculoVencimiento } from '../../../types/entities';
import { EncabezadoTarjeta, CifraTarjeta, type TonoTarjeta } from './EncabezadoTarjeta';
import { BotonVerMas } from './BotonVerMas';

interface Props {
    data: VehiculoVencimiento[];
    onNavigate: () => void;
    /** Filas visibles antes de cortar con «y N más»: 3 en la tarjeta (dueño 2026-10-20), todas en el detalle. */
    maxFilas?: number;
    /** En la tarjeta: «Ver más» abre el detalle de abajo. Sin él (en el detalle) el pie lleva a /vehiculos. */
    onVerMas?: () => void;
    activo?: boolean;
}

/**
 * Vencimientos de vehículos — tarjeta del Inicio (propuesta H, 2026-10-16).
 *
 * Cubre las TRES fuentes que el backend ya agrega en `getVencimientos(30)`:
 * documentos (permiso de circulación, seguro, padrón, póliza), revisiones
 * (técnica y de gases) y mantenciones. Es exactamente lo que cuenta el badge
 * del menú Vehículos — misma request compartida vía `useVencimientosVehiculos`,
 * así que esta tarjeta no agrega tráfico ni puede desincronizarse del contador.
 *
 * Color = estado (regla 4 del DS): rojo si hay algo YA vencido, ámbar si solo
 * hay cosas por vencer, verde si no hay nada en 30 días.
 */
const VehicleExpiries: React.FC<Props> = ({ data, onNavigate, maxFilas = 3, onVerMas, activo = false }) => {
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
    const porVencer = items.length - vencidos;
    const tono: TonoTarjeta = vencidos > 0 ? 'rojo' : porVencer > 0 ? 'ambar' : 'verde';

    return (
        <div className="flex h-full flex-col">
            <EncabezadoTarjeta icon={Truck} tono={tono} titulo="Vehículos" subtitulo="Vencimientos en los próximos 30 días" />
            {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin vencimientos en los próximos 30 días.</p>
            ) : (
                <>
                    <CifraTarjeta
                        valor={vencidos > 0 ? vencidos : porVencer}
                        etiqueta={vencidos > 0
                            ? `${vencidos === 1 ? 'vencido' : 'vencidos'}${porVencer > 0 ? ` · ${porVencer} por vencer` : ''}`
                            : 'por vencer'}
                        tono={tono}
                    />
                    <div>
                        {items.slice(0, maxFilas).map(v => (
                            // eslint-disable-next-line no-restricted-syntax -- fila de lista (toda la fila navega)
                            <button
                                key={`${v.categoria}-${v.id}`}
                                type="button"
                                onClick={onNavigate}
                                className="flex w-full items-center gap-3 border-t border-border py-2.5 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 -mx-2 px-2 rounded-lg"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-foreground truncate">
                                        <span className="font-semibold tracking-wide">{v.patente || 'Sin patente'}</span>
                                        {' · '}{etiquetaVencimiento(v.categoria, v.subtipo)}
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
                        ))}
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                        <span className="text-xs text-muted-foreground">
                            {items.length > maxFilas ? `y ${items.length - maxFilas} más` : ''}
                        </span>
                        {onVerMas
                            ? <BotonVerMas activo={activo} onClick={onVerMas} modulo="Vehículos" />
                            : (
                                <Button variant="link" size="sm" onClick={onNavigate} className="text-green-700 dark:text-green-300">
                                    Ver vehículos
                                </Button>
                            )}
                    </div>
                </>
            )}
        </div>
    );
};

export default VehicleExpiries;
