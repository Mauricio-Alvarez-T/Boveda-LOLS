import React, { useCallback, useEffect, useRef, useState } from 'react';
import { UserPlus, MapPin, Briefcase, CalendarPlus, ChevronRight, User, RefreshCw } from 'lucide-react';

import api from '../../services/api';
import { showApiError } from '../../utils/toastUtils';
import type { ApiResponse } from '../../types';
import type { SolicitudIngreso, SolicitudIngresoEstado } from '../../types/entities';
import { useAuth } from '../../context/AuthContext';
import { useSolicitudesIngreso } from '../../hooks/useSolicitudesIngreso';
import { fmtFecha, normalizarFecha } from '../../utils/format';
import { fmtFechaHora } from '../../utils/fechas';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { EmptyState } from '../ui/EmptyState';
import { StatusBadge } from '../ui/StatusBadge';
import { RevisarSolicitudModal, type SolicitudAccion } from './RevisarSolicitudModal';

type Filtro = SolicitudIngresoEstado | 'todas';

const FILTROS: { value: Filtro; label: string }[] = [
    { value: 'pendiente', label: 'Pendientes' },
    { value: 'aprobada', label: 'Aprobadas' },
    { value: 'rechazada', label: 'Rechazadas' },
    { value: 'todas', label: 'Todas' },
];

interface Props {
    /** Súbelo cuando algo externo (una solicitud nueva) obligue a recargar la lista. */
    refreshKey?: number;
    /** Tras aprobar: el padre recarga la grilla de trabajadores (el nuevo ya existe). */
    onAprobada?: () => void;
    /** Abre el formulario de nueva ficha de ingreso (el modal vive en la página). Solo con trabajadores.solicitud.crear. */
    onNuevoIngreso?: () => void;
}

const iniciales = (s: SolicitudIngreso) =>
    `${(s.apellido_paterno || '')[0] || ''}${(s.nombres || '')[0] || ''}`.toUpperCase();

/**
 * Lista de solicitudes de ingreso (ficha digital). Con `solicitud.aprobar` se
 * ven todas y la fila abre la revisión; sin él el backend ya devuelve solo las
 * propias (el solicitante sigue su estado y lee el motivo si fue rechazada).
 * Ocupa el lugar de la grilla de Consultas cuando `?tab=solicitudes`.
 */
export const SolicitudesIngresoPanel: React.FC<Props> = ({ refreshKey = 0, onAprobada, onNuevoIngreso }) => {
    const { hasPermission } = useAuth();
    const puedeAprobar = hasPermission('trabajadores.solicitud.aprobar');
    const puedeCrear = hasPermission('trabajadores.solicitud.crear');
    const { refetch: refetchPendientes } = useSolicitudesIngreso();

    const [filtro, setFiltro] = useState<Filtro>('pendiente');
    const [items, setItems] = useState<SolicitudIngreso[]>([]);
    const [loading, setLoading] = useState(true);
    const [seleccionada, setSeleccionada] = useState<SolicitudIngreso | null>(null);
    const seq = useRef(0); // descarta respuestas viejas al cambiar de filtro rápido

    const cargar = useCallback(async (silencioso = false) => {
        const mio = ++seq.current;
        if (!silencioso) setLoading(true);
        try {
            // incluir_prueba: paridad con la grilla de Consultas (superficie de administración);
            // el form de terreno ofrece obras de prueba y sin el flag el backend las excluiría.
            const res = await api.get<ApiResponse<SolicitudIngreso[]>>('/solicitudes-ingreso', { params: { estado: filtro, incluir_prueba: 'true' } });
            if (mio !== seq.current) return;
            setItems(res.data.data || []);
        } catch (err) {
            if (mio !== seq.current) return;
            showApiError(err, 'No se pudieron cargar las solicitudes');
        } finally {
            if (mio === seq.current) setLoading(false);
        }
    }, [filtro]);

    useEffect(() => { cargar(); }, [cargar, refreshKey]);

    const handleResuelta = (accion: SolicitudAccion) => {
        setSeleccionada(null);
        refetchPendientes();   // badge del menú + botón "Solicitudes" + Bandeja
        cargar(true);
        if (accion === 'aprobada') onAprobada?.();
    };
    // Aprobar NO cierra el modal (B5: muestra "Descargar ficha" / "Emitir kit"); igual se refresca todo ya.
    const handleAprobado = () => {
        refetchPendientes();
        cargar(true);
        onAprobada?.();
    };

    const vacioTitulo = filtro === 'pendiente' ? 'Sin solicitudes pendientes'
        : filtro === 'todas' ? 'Sin solicitudes de ingreso'
            : `Sin solicitudes ${FILTROS.find(f => f.value === filtro)?.label.toLowerCase() ?? ''}`;
    const vacioDesc = puedeAprobar
        ? 'Cuando terreno envíe una ficha de ingreso aparecerá aquí para revisarla.'
        : 'Las fichas de ingreso que envíes aparecerán aquí con su estado.';

    return (
        <div className="flex-1 min-h-0 flex flex-col bg-card border border-border rounded-3xl shadow-[var(--shadow-md)] overflow-hidden relative">
            {/* Header: rótulo + filtros por estado */}
            <div className="min-h-[60px] border-b border-border bg-card/50 px-3 py-2 flex flex-wrap items-center justify-between shrink-0 gap-2">
                <div className="hidden sm:flex items-center gap-2 bg-muted text-muted-foreground px-3 py-1.5 rounded-xl">
                    <UserPlus className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-widest">Solicitudes de ingreso</span>
                </div>
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none w-full sm:w-auto">
                    {FILTROS.map(f => (
                        <Button
                            key={f.value}
                            size="sm"
                            variant={filtro === f.value ? 'primary' : 'ghost'}
                            onClick={() => setFiltro(f.value)}
                            aria-pressed={filtro === f.value}
                            className={cn('shrink-0 text-xs font-semibold', filtro !== f.value && 'text-muted-foreground')}
                        >
                            {f.label}
                        </Button>
                    ))}
                    <IconButton
                        variant="ghost"
                        size="sm"
                        aria-label="Actualizar solicitudes"
                        title="Actualizar"
                        onClick={() => cargar()}
                        className="shrink-0"
                        icon={<RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />}
                    />
                    {puedeCrear && onNuevoIngreso && (
                        <Button size="sm" leftIcon={<UserPlus className="h-4 w-4" />} onClick={onNuevoIngreso} className="shrink-0 ml-1">Nuevo ingreso</Button>
                    )}
                </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-muted/80 p-2 md:p-4">
                {loading ? (
                    <div className="flex flex-col gap-3">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-20 w-full bg-card rounded-2xl border border-border flex items-center p-4 gap-4 animate-pulse">
                                <div className="h-10 w-10 rounded-xl bg-muted shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 w-1/3 bg-muted rounded" />
                                    <div className="h-3 w-1/4 bg-muted rounded" />
                                </div>
                                <div className="hidden sm:flex h-6 w-24 bg-muted rounded-full ml-auto" />
                            </div>
                        ))}
                    </div>
                ) : items.length === 0 ? (
                    <EmptyState
                        icon={UserPlus}
                        title={vacioTitulo}
                        description={vacioDesc}
                        className="h-full justify-center"
                        action={puedeCrear && onNuevoIngreso ? <Button size="sm" leftIcon={<UserPlus className="h-4 w-4" />} onClick={onNuevoIngreso}>Nuevo ingreso</Button> : undefined}
                    />
                ) : (
                    <div className="flex flex-col gap-2.5 pb-10 sm:pb-5">
                        {items.map(s => (
                            /* eslint-disable-next-line no-restricted-syntax -- fila clickeable que abre la ficha */
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => setSeleccionada(s)}
                                className="w-full text-left bg-card rounded-2xl border border-border p-3 sm:p-4 shadow-[var(--shadow-sm)] transition-all duration-200 hover:border-brand-primary/30 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
                            >
                                <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                                    <div className="h-10 w-10 shrink-0 rounded-xl bg-muted text-muted-foreground border border-border flex items-center justify-center font-black text-xs">
                                        {iniciales(s)}
                                    </div>

                                    <div className="flex-1 min-w-0 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_1.2fr] gap-2 lg:gap-4 lg:items-center">
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-brand-dark truncate">
                                                {s.apellido_paterno} {s.apellido_materno || ''} {s.nombres}
                                            </p>
                                            <p className="text-label font-medium text-muted-foreground">{s.rut}</p>
                                        </div>
                                        <div className="min-w-0 flex flex-col gap-0.5 text-label sm:text-xs">
                                            <span className="flex items-center gap-1.5 font-semibold text-brand-dark truncate">
                                                <MapPin className="h-3 w-3 text-muted-foreground shrink-0" /> {s.obra_nombre || 'Sin obra'}
                                            </span>
                                            <span className="flex items-center gap-1.5 text-muted-foreground truncate">
                                                <Briefcase className="h-3 w-3 shrink-0" /> {s.cargo_nombre || 'Sin cargo'}
                                            </span>
                                        </div>
                                        <div className="min-w-0 flex flex-col gap-0.5 text-label sm:text-xs">
                                            <span className="flex items-center gap-1.5 font-semibold text-brand-dark">
                                                <CalendarPlus className="h-3 w-3 text-muted-foreground shrink-0" /> Ingreso {fmtFecha(normalizarFecha(s.fecha_ingreso)) || '—'}
                                            </span>
                                            <span className="flex items-center gap-1.5 text-muted-foreground truncate">
                                                <User className="h-3 w-3 shrink-0" /> {s.solicitante_nombre || '—'} · {fmtFechaHora(s.fecha_solicitud) || '—'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <StatusBadge domain="solicitudIngresoEstado" status={s.estado} showIcon />
                                        <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Status bar */}
            <div className="h-9 bg-muted border-t border-border flex items-center justify-between px-5 text-label font-bold text-muted-foreground shrink-0 uppercase tracking-widest rounded-b-3xl">
                <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-brand-primary/40" />
                    <span>{items.length} {items.length === 1 ? 'solicitud' : 'solicitudes'}</span>
                </div>
                <span>{puedeAprobar ? 'Revisa y aprueba para crear al trabajador' : 'Tus solicitudes de ingreso'}</span>
            </div>

            <RevisarSolicitudModal
                solicitud={seleccionada}
                onClose={() => setSeleccionada(null)}
                puedeAprobar={puedeAprobar}
                onResuelta={handleResuelta}
                onAprobado={handleAprobado}
            />
        </div>
    );
};
