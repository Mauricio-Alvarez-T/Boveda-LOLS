import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UserPlus, MapPin, ChevronRight, RefreshCw, Clock, CheckCircle2, XCircle } from 'lucide-react';

import api from '../../services/api';
import { showApiError } from '../../utils/toastUtils';
import type { ApiResponse } from '../../types';
import type { SolicitudIngreso } from '../../types/entities';
import { useAuth } from '../../context/AuthContext';
import { useSolicitudesIngreso } from '../../hooks/useSolicitudesIngreso';
import { fmtFecha, normalizarFecha } from '../../utils/format';
import { fmtFechaHora } from '../../utils/fechas';
import { solicitudIngresoEstadoConfig } from '../../utils/statusConfig';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { EmptyState } from '../ui/EmptyState';
import { StatusBadge } from '../ui/StatusBadge';
import { RevisarSolicitudModal, type SolicitudAccion } from './RevisarSolicitudModal';
import {
    FILTROS_SOLICITUDES, contarPorEstado, filtrar, diasDesde, tonoEspera, textoEspera, agruparPorObra,
    iniciales, nombreCompleto, type FiltroSolicitudes,
} from './solicitudesLista';

interface Props {
    /** Súbelo cuando algo externo (una solicitud nueva) obligue a recargar la lista. */
    refreshKey?: number;
    /** Tras aprobar: el padre recarga la grilla de trabajadores (el nuevo ya existe). */
    onAprobada?: () => void;
    /** Abre el formulario de nueva ficha de ingreso (el modal vive en la página). Solo con trabajadores.solicitud.crear. */
    onNuevoIngreso?: () => void;
}

const TONO_ESPERA = {
    ok: 'text-muted-foreground',
    aviso: 'text-amber-600 dark:text-amber-400',
    critico: 'text-red-600 dark:text-red-400',
} as const;

/**
 * Bandeja de solicitudes de ingreso (ficha digital). Rediseño 2026-09-15: se carga TODO una vez
 * (el backend no pagina) y se filtra en cliente → los contadores por estado son gratis y el cambio
 * de pestaña es instantáneo. Las pendientes se agrupan por obra (así las revisa RRHH) y muestran
 * cuántos días llevan esperando (≥2 ámbar, ≥5 rojo). Con `solicitud.aprobar` la fila ofrece
 * «Revisar»; sin él, el backend ya devuelve solo las propias y la fila muestra su estado.
 */
export const SolicitudesIngresoPanel: React.FC<Props> = ({ refreshKey = 0, onAprobada, onNuevoIngreso }) => {
    const { hasPermission } = useAuth();
    const puedeAprobar = hasPermission('trabajadores.solicitud.aprobar');
    const puedeCrear = hasPermission('trabajadores.solicitud.crear');
    const { refetch: refetchPendientes } = useSolicitudesIngreso();

    const [filtro, setFiltro] = useState<FiltroSolicitudes>('pendiente');
    const [todas, setTodas] = useState<SolicitudIngreso[]>([]);
    const [loading, setLoading] = useState(true);
    const [seleccionada, setSeleccionada] = useState<SolicitudIngreso | null>(null);
    const seq = useRef(0); // descarta respuestas viejas si se recarga rápido

    const cargar = useCallback(async (silencioso = false) => {
        const mio = ++seq.current;
        if (!silencioso) setLoading(true);
        try {
            // incluir_prueba: paridad con la grilla de Consultas (superficie de administración);
            // el form de terreno ofrece obras de prueba y sin el flag el backend las excluiría.
            const res = await api.get<ApiResponse<SolicitudIngreso[]>>('/solicitudes-ingreso', { params: { estado: 'todas', incluir_prueba: 'true' } });
            if (mio !== seq.current) return;
            setTodas(res.data.data || []);
        } catch (err) {
            if (mio !== seq.current) return;
            showApiError(err, 'No se pudieron cargar las solicitudes');
        } finally {
            if (mio === seq.current) setLoading(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar, refreshKey]);

    const conteo = useMemo(() => contarPorEstado(todas), [todas]);
    const items = useMemo(() => filtrar(todas, filtro), [todas, filtro]);
    const grupos = useMemo(() => (filtro === 'pendiente' ? agruparPorObra(items) : null), [items, filtro]);

    const handleResuelta = (accion: SolicitudAccion) => {
        setSeleccionada(null);
        refetchPendientes();   // badge del menú + portada + Bandeja
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
            : `Sin solicitudes ${FILTROS_SOLICITUDES.find(f => f.value === filtro)?.label.toLowerCase() ?? ''}`;
    const vacioDesc = puedeAprobar
        ? 'Cuando terreno envíe una ficha de ingreso aparecerá aquí para revisarla.'
        : 'Las fichas de ingreso que envíes aparecerán aquí con su estado.';
    const botonNuevo = puedeCrear && onNuevoIngreso
        ? <Button size="sm" leftIcon={<UserPlus className="h-4 w-4" />} onClick={onNuevoIngreso} className="shrink-0">Nuevo ingreso</Button>
        : null;

    const renderFila = (s: SolicitudIngreso) => {
        const cfg = solicitudIngresoEstadoConfig[s.estado];
        const dias = s.estado === 'pendiente' ? diasDesde(s.fecha_solicitud) : null;
        const tono = tonoEspera(dias);
        return (
            /* eslint-disable-next-line no-restricted-syntax -- fila clickeable que abre la ficha completa */
            <button
                key={s.id}
                type="button"
                onClick={() => setSeleccionada(s)}
                className={cn(
                    'w-full text-left bg-card rounded-2xl border border-border border-l-4 p-3.5 sm:p-4 shadow-sm transition-all duration-200',
                    'hover:border-brand-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                    cfg.borderLeft,
                )}
            >
                <div className="flex items-center gap-3 sm:gap-4">
                    <div className="h-11 w-11 shrink-0 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-section">
                        {iniciales(s)}
                    </div>

                    <div className="flex-1 min-w-0">
                        <p className="text-ui font-bold text-brand-dark truncate leading-tight">{nombreCompleto(s)}</p>
                        <p className="mt-0.5 text-caption text-muted-foreground truncate">
                            {s.rut} · {s.cargo_nombre || 'Sin cargo'} · Ingreso {fmtFecha(normalizarFecha(s.fecha_ingreso)) || '—'}
                            {filtro !== 'pendiente' && <> · <MapPin className="inline h-3 w-3 -mt-0.5" /> {s.obra_nombre || 'Sin obra'}</>}
                        </p>
                        {s.estado === 'pendiente' ? (
                            <p className={cn('mt-1 flex items-center gap-1.5 text-caption font-semibold', TONO_ESPERA[tono])}>
                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{textoEspera(dias)} · {s.solicitante_nombre || 'Sin solicitante'}</span>
                            </p>
                        ) : (
                            <p className="mt-1 flex items-center gap-1.5 text-caption text-muted-foreground">
                                {s.estado === 'aprobada'
                                    ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
                                    : <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500 dark:text-red-400" />}
                                <span className="truncate">
                                    {cfg.label} {fmtFechaHora(s.fecha_resolucion) ? `el ${fmtFechaHora(s.fecha_resolucion)}` : ''}
                                    {s.resuelto_por_nombre ? ` por ${s.resuelto_por_nombre}` : ''} · enviada por {s.solicitante_nombre || '—'}
                                </span>
                            </p>
                        )}
                        {s.estado === 'rechazada' && s.motivo_rechazo && (
                            <p className="mt-1.5 text-caption text-red-700 dark:text-red-300 line-clamp-2">Motivo: {s.motivo_rechazo}</p>
                        )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {s.estado === 'pendiente' && puedeAprobar ? (
                            <span className="hidden sm:inline-flex h-9 items-center rounded-full bg-brand-primary px-4 text-section font-semibold text-white shadow-sm">
                                Revisar
                            </span>
                        ) : (
                            <StatusBadge domain="solicitudIngresoEstado" status={s.estado} showIcon />
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                </div>
            </button>
        );
    };

    return (
        <div className="flex-1 min-h-0 flex flex-col bg-card border border-border rounded-3xl shadow-[var(--shadow-md)] overflow-hidden relative">
            {/* Cabecera: pestañas por estado con contador + acciones */}
            <div className="border-b border-border px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div role="tablist" aria-label="Estado de las solicitudes" className="flex items-center gap-1 rounded-2xl bg-muted p-1 overflow-x-auto scrollbar-none max-w-full">
                    {FILTROS_SOLICITUDES.map(f => {
                        const activo = filtro === f.value;
                        const n = conteo[f.value];
                        return (
                            <Button
                                key={f.value}
                                role="tab"
                                size="sm"
                                variant={activo ? 'glass' : 'ghost'}
                                onClick={() => setFiltro(f.value)}
                                aria-selected={activo}
                                className={cn('h-9 shrink-0 rounded-xl px-3 text-section font-semibold gap-2',
                                    activo ? 'text-brand-dark shadow-sm' : 'text-muted-foreground hover:text-brand-dark')}
                            >
                                {f.label}
                                {!loading && n > 0 && (
                                    <span className={cn('flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full text-micro font-bold tabular-nums',
                                        f.value === 'pendiente' ? 'bg-amber-500 text-white' : 'bg-border text-muted-foreground')}>
                                        {n}
                                    </span>
                                )}
                            </Button>
                        );
                    })}
                </div>
                <div className="flex items-center gap-2 ml-auto">
                    <IconButton
                        variant="ghost"
                        size="sm"
                        aria-label="Actualizar solicitudes"
                        title="Actualizar"
                        onClick={() => cargar()}
                        className="shrink-0"
                        icon={<RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />}
                    />
                    {botonNuevo}
                </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-muted/60 p-3 md:p-4">
                {loading ? (
                    <div className="flex flex-col gap-3">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-20 w-full bg-card rounded-2xl border border-border flex items-center p-4 gap-4 animate-pulse">
                                <div className="h-11 w-11 rounded-2xl bg-muted shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 w-1/3 bg-muted rounded" />
                                    <div className="h-3 w-1/2 bg-muted rounded" />
                                </div>
                                <div className="hidden sm:flex h-9 w-20 bg-muted rounded-full ml-auto" />
                            </div>
                        ))}
                    </div>
                ) : items.length === 0 ? (
                    <EmptyState
                        icon={UserPlus}
                        title={vacioTitulo}
                        description={vacioDesc}
                        className="h-full justify-center"
                        action={botonNuevo ?? undefined}
                    />
                ) : grupos ? (
                    <div className="flex flex-col gap-5 pb-10 sm:pb-5">
                        {grupos.map(g => (
                            <section key={g.clave}>
                                <h3 className="mb-2 flex items-center gap-2 px-1 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                                    <MapPin className="h-3.5 w-3.5 text-brand-primary" />
                                    <span className="truncate">{g.obra}</span>
                                    <span className="tabular-nums">· {g.items.length}</span>
                                </h3>
                                <div className="flex flex-col gap-2.5">{g.items.map(renderFila)}</div>
                            </section>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col gap-2.5 pb-10 sm:pb-5">{items.map(renderFila)}</div>
                )}
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
