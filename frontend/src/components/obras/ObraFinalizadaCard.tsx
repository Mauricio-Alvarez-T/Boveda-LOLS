import React, { useState } from 'react';
import { Building2, Calendar, Clock, Users, RotateCcw, HardHat } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import api from '../../services/api';
import { fmtFecha, formatDuracion } from '../../utils/format';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import type { ObraFinalizada } from '../../types/entities';

interface Props {
    obra: ObraFinalizada;
    index: number;          // para el stagger de entrada
    canReactivar: boolean;  // hasPermission('obras.finalizar')
    onReactivada: () => void;
}

const MAX_CARGOS_VISIBLES = 5;

/**
 * Tarjeta de obra concluida: fechas, duración, total de trabajadores
 * (histórico, derivado de asistencias) y desglose por cargo en barras CSS.
 */
export const ObraFinalizadaCard: React.FC<Props> = ({ obra, index, canReactivar, onReactivada }) => {
    const [confirming, setConfirming] = useState(false);
    const [reactivating, setReactivating] = useState(false);

    const cargosVisibles = obra.por_cargo.slice(0, MAX_CARGOS_VISIBLES);
    const cargosOcultos = obra.por_cargo.length - cargosVisibles.length;
    const maxCantidad = cargosVisibles.length > 0 ? cargosVisibles[0].cantidad : 0;

    const handleReactivar = async () => {
        setReactivating(true);
        try {
            await api.put(`/obras/${obra.id}/reactivar`);
            toast.success(`Obra "${obra.nombre}" reactivada`);
            onReactivada();
        } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Error al reactivar la obra');
        } finally {
            setReactivating(false);
            setConfirming(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.4) }}
            className="flex flex-col rounded-2xl border border-border bg-card shadow-sm overflow-hidden"
        >
            {/* Header: badge + nombre + empresa */}
            <div className="p-4 pb-3 border-b border-border/60">
                <StatusBadge domain="obra" status="finalizada" className="mb-2" />
                <h3 className="text-sm font-black text-brand-dark leading-tight truncate" title={obra.nombre}>
                    {obra.nombre}
                </h3>
                {obra.empresa_nombre && (
                    <p className="flex items-center gap-1 text-caption text-muted-foreground mt-0.5 truncate">
                        <Building2 className="h-3 w-3 shrink-0" /> {obra.empresa_nombre}
                    </p>
                )}
            </div>

            <div className="p-4 pt-3 flex flex-col gap-3 flex-1">
                {/* Fechas + duración */}
                <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-label text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 text-brand-primary shrink-0" />
                        <span>
                            {obra.fecha_inicio ? fmtFecha(obra.fecha_inicio) : '—'}
                            <span className="mx-1 text-muted-foreground/50">→</span>
                            {obra.fecha_termino ? fmtFecha(obra.fecha_termino) : '—'}
                        </span>
                    </p>
                    <p className="flex items-center gap-1.5 text-label">
                        <Clock className="h-3.5 w-3.5 text-brand-primary shrink-0" />
                        <span className="font-bold text-brand-dark">{formatDuracion(obra.dias_duracion)}</span>
                    </p>
                </div>

                {/* Total trabajadores */}
                <div className="flex items-center gap-2.5 rounded-xl bg-brand-primary/5 border border-brand-primary/15 px-3 py-2">
                    <Users className="h-4 w-4 text-brand-primary shrink-0" />
                    <div className="leading-tight">
                        <p className="text-lg font-black text-brand-dark">{obra.total_trabajadores}</p>
                        <p className="text-micro text-muted-foreground uppercase font-bold tracking-wide">
                            Trabajadores (histórico)
                        </p>
                    </div>
                </div>

                {/* Por cargo — barras */}
                <div className="flex-1">
                    <p className="flex items-center gap-1 text-micro font-black uppercase tracking-widest text-brand-dark/50 mb-1.5">
                        <HardHat className="h-3 w-3" /> Por cargo
                    </p>
                    {cargosVisibles.length === 0 ? (
                        <p className="text-caption text-muted-foreground italic">Sin asistencias registradas</p>
                    ) : (
                        <div className="space-y-1">
                            {cargosVisibles.map(c => (
                                <div key={c.cargo} className="flex items-center gap-2">
                                    <span className="w-24 shrink-0 text-caption text-muted-foreground truncate" title={c.cargo}>
                                        {c.cargo}
                                    </span>
                                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-brand-primary/70"
                                            style={{ width: `${maxCantidad > 0 ? Math.max((c.cantidad / maxCantidad) * 100, 6) : 0}%` }}
                                        />
                                    </div>
                                    <span className="w-6 shrink-0 text-right text-caption font-bold text-brand-dark tabular-nums">
                                        {c.cantidad}
                                    </span>
                                </div>
                            ))}
                            {cargosOcultos > 0 && (
                                <p className="text-micro text-muted-foreground/70 pt-0.5">+{cargosOcultos} cargo{cargosOcultos > 1 ? 's' : ''} más</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Reactivar */}
                {canReactivar && (
                    <div className="mt-auto pt-1">
                        {!confirming ? (
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                leftIcon={<RotateCcw className="h-3 w-3" />}
                                onClick={() => setConfirming(true)}
                            >
                                Reactivar obra
                            </Button>
                        ) : (
                            <div className="flex gap-1.5">
                                <Button
                                    size="sm"
                                    className="flex-1"
                                    isLoading={reactivating}
                                    onClick={handleReactivar}
                                >
                                    Confirmar
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={reactivating}
                                    onClick={() => setConfirming(false)}
                                >
                                    Cancelar
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
};
