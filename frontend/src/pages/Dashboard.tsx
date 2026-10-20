import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useObra } from '../context/ObraContext';
import api from '../services/api';
import type { ApiResponse } from '../types';
import { cn } from '../utils/cn';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { useDashboardLayout } from '../hooks/useDashboardLayout';
import { Skeleton, SkeletonText } from '../components/ui/Skeleton';

// Widgets
import VehicleExpiries from '../components/dashboard/widgets/VehicleExpiries';
import BandejaDelDia, { type PendingTask, type BandejaItem } from '../components/dashboard/widgets/BandejaDelDia';
import { useVencimientosVehiculos } from '../hooks/useVencimientosVehiculos';
import { useSolicitudesIngreso } from '../hooks/useSolicitudesIngreso';
import { useLotesPendientes } from '../hooks/useLotesPendientes';
import { filasBandejaLotes } from '../components/documentos-fisicos/documentosFisicos';
import { useDocumentosAlertas } from '../hooks/useDocumentosAlertas';
import { filasBandejaAlertas } from '../components/documentos-fisicos/documentosAlertas';
import type { DashboardAlerta } from '../hooks/inventario/useDashboardEjecutivo';
import AttendanceTrend from '../components/dashboard/widgets/AttendanceTrend';
import AbsencesToday from '../components/dashboard/widgets/AbsencesToday';
import QuickActions from '../components/dashboard/widgets/QuickActions';
import AbsenceAlerts, { type TrabajadorConAlerta } from '../components/dashboard/widgets/AbsenceAlerts';
import ObraRanking from '../components/dashboard/widgets/ObraRanking';
import ActividadesSemana from '../components/dashboard/widgets/ActividadesSemana';
import InicioHero from '../components/dashboard/widgets/InicioHero';
import AsistenciaPendiente from '../components/dashboard/widgets/AsistenciaPendiente';
import DocumentosInicio from '../components/dashboard/widgets/DocumentosInicio';
import { resumenDocumentosInicio } from '../components/dashboard/widgets/resumenDocumentosInicio';
import { contarBandeja } from '../components/dashboard/widgets/bandejaConteo';
import { fechaDelDia, resumenDelDia } from '../utils/resumenInicio';
import { AvisoAtrasosPortador } from '../components/documentos-fisicos/AvisoAtrasosPortador';

// ─── Types ───
interface DocExpiryItem {
    fecha: string;
    tipo_documento: string;
    trabajador: string;
    trabajador_id: number;
    rut: string;
    obra: string;
}

interface ObraRankingItem {
    id: number;
    nombre: string;
    trabajadores: number;
    asistencia_tasa: number;
    docs_completos_pct: number;
    asistencia_guardada: boolean;
}

interface AttendanceStatusEntry {
    nombre: string;
    guardada: boolean;
}

interface DashboardData {
    counters: {
        trabajadores?: number;
        documentos?: number;
        vencidos?: number;
        porVencer7d?: number;
        trabajadoresSinDocs?: number;
        asistencia_hoy?: number;
        ausentes_hoy?: number;
    };
    deltas: {
        trabajadores_nuevos_semana?: number;
        docs_vencidos_hoy?: number;
        asistencia_delta?: number;
        ausentes_delta?: number;
    };
    recentActivity: any[];
    obraDistribution: any[];
    attendanceTrend: { fecha: string; tasa: number }[];
    ausentesDetalle?: { nombres: string; apellido_paterno: string; apellido_materno?: string | null; estado: string; obra: string }[];
    alerts: { tipo: 'critical' | 'warning' | 'info'; titulo: string; mensaje: string; count: number; ruta: string }[];
    pendingTasks: PendingTask[];
    docExpiryTimeline: DocExpiryItem[];
    obraRanking: ObraRankingItem[];
    attendanceStatus: Record<string, AttendanceStatusEntry>;
    // Faltas reiteradas del mes (Art. 160 N°3); incluye fechas[] (strip de evidencia).
    trabajadoresConAlertas: TrabajadorConAlerta[];
    saludo: { nombre: string; resumen: string; totalAlertas: number };
}

// ─── Panel: tarjeta blanca del Inicio H (2026-10-16): sin borde, sombra suave (en oscuro la sombra
// trae su anillo de 1 px), esquinas grandes. El color va en el círculo de cada encabezado
// (EncabezadoTarjeta), nunca en el fondo; la única superficie verde es la tarjeta del día.
const Panel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <div className={cn('rounded-3xl bg-card p-6 shadow-[var(--shadow-md)]', className)}>{children}</div>
);

// ─── Dashboard ───
const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const { selectedObra } = useObra();
    const navigate = useNavigate();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [invItems, setInvItems] = useState<BandejaItem[]>([]);

    // Vencimientos de vehículos: mismo store que el badge del menú (una sola
    // request compartida). Desde el Inicio H van en su propia tarjeta, no en la bandeja.
    const vencimientos = useVencimientosVehiculos();
    const vehiculosVencidos = useMemo(
        () => vencimientos.items.filter(v => Number(v.dias_restantes) < 0).length,
        [vencimientos.items],
    );

    const permisos = user?.permisos ?? [];
    const canInventario = permisos.includes('inventario.ver');
    // El WidgetRegistry solo expresa permisos de 2 niveles (modulo.accion), así que este
    // widget se gatea directo con la clave granular (mismo criterio que canInventario).
    const canActividades = permisos.includes('asistencia.actividades_sugeridas.ver');

    // Solicitudes de ingreso pendientes (ficha digital): mismo store que el badge de
    // Consultas. Una sola fila-resumen, solo para quien aprueba y solo si hay algo.
    const solicitudes = useSolicitudesIngreso();
    const canAprobarSolicitudes = permisos.includes('trabajadores.solicitud.aprobar');
    const solicitudItems = useMemo((): BandejaItem[] => {
        const n = solicitudes.pendientes;
        if (!canAprobarSolicitudes || n <= 0) return [];
        return [{
            severity: 'warning',
            title: `${n} solicitud${n === 1 ? '' : 'es'} de ingreso pendiente${n === 1 ? '' : 's'}`,
            description: 'Fichas de terreno por revisar: aprobar crea al trabajador',
            ruta: '/consultas?tab=solicitudes',
        }];
    }, [canAprobarSolicitudes, solicitudes.pendientes]);
    // Documentos físicos (B6): mismo store que el botón de Gestiones. El backend ya recorta el alcance
    // (portador: sus lotes; RRHH: todos); sin permiso el hook devuelve null y no hay filas.
    const lotes = useLotesPendientes();
    // B7: RRHH ve lo que superó su UMBRAL (por tipo + lotes atascados, con críticos); el portador, que no tiene
    // esas alertas, ve el contador simple de sus lotes por confirmar.
    const alertasDocs = useDocumentosAlertas();
    const canRegistrarEntregas = permisos.includes('documentos.entrega.registrar');
    const documentosFisicosItems = useMemo((): BandejaItem[] => (
        canRegistrarEntregas
            ? filasBandejaAlertas(alertasDocs.alertas)
            : filasBandejaLotes(lotes.pendientes).map(f => ({ ...f, ruta: '/consultas?tab=fisicos' }))
    ), [canRegistrarEntregas, alertasDocs.alertas, lotes.pendientes]);
    // Impresos que aún no van en ningún lote (la cifra de la cabecera de Documentos físicos). Solo RRHH.
    const [impresosSinAsignar, setImpresosSinAsignar] = useState<number | null>(null);
    const { visibleWidgets } = useDashboardLayout(user?.id ?? 0, permisos);

    // Widgets que el usuario puede ver (gating por permiso granular). El layout es
    // fijo; el permiso decide qué zonas se montan, no el orden.
    const shown = useMemo(() => new Set(visibleWidgets.map(w => w.id)), [visibleWidgets]);

    // ─── Page Header (solo el rótulo de sección) ───
    const headerTitle = useMemo(() => (
        <h1 className="text-base font-semibold text-foreground">Inicio</h1>
    ), []);
    useSetPageHeader(headerTitle);

    // ─── Fetch Data (reutilizable para el botón refrescar) ───
    const fetchSummary = useCallback(async () => {
        setLoading(true);
        try {
            const query = selectedObra ? `?obra_id=${selectedObra.id}` : '';
            const res = await api.get<ApiResponse<DashboardData>>(`/dashboard/summary${query}`);
            const raw = res.data.data;
            // Defensive defaults for new fields (backward compat with old backend)
            setData({
                ...raw,
                counters: raw.counters ?? {},
                deltas: raw.deltas ?? {},
                alerts: raw.alerts ?? [],
                pendingTasks: raw.pendingTasks ?? [],
                docExpiryTimeline: raw.docExpiryTimeline ?? [],
                obraRanking: raw.obraRanking ?? [],
                attendanceStatus: raw.attendanceStatus ?? {},
                attendanceTrend: raw.attendanceTrend ?? [],
                ausentesDetalle: raw.ausentesDetalle ?? [],
                trabajadoresConAlertas: raw.trabajadoresConAlertas ?? [],
                saludo: raw.saludo ?? { nombre: '', resumen: '', totalAlertas: 0 },
            });
            setLastUpdated(new Date());
        } catch {
            toast.error('Error al cargar resumen del dashboard');
        } finally {
            setLoading(false);
        }
    }, [selectedObra]);

    useEffect(() => { fetchSummary(); }, [fetchSummary]);

    // Inventario: fetch DIFERIDO y gated por permiso (no bloquea la bandeja de
    // asistencia/docs; si falla o no hay permiso, simplemente no agrega filas).
    const fetchInventory = useCallback(async () => {
        if (!canInventario) { setInvItems([]); return; }
        try {
            const query = selectedObra ? `?obra_id=${selectedObra.id}` : '';
            const res = await api.get<ApiResponse<{ alertas: DashboardAlerta[] }>>(`/inventario/dashboard-ejecutivo${query}`);
            const alertas = res.data.data?.alertas ?? [];
            setInvItems(alertas.map((a): BandejaItem => ({
                severity: a.tipo === 'discrepancia'
                    ? 'critical'
                    : (a.estancada || a.tipo === 'faltante' || a.tipo === 'rechazo') ? 'warning' : 'info',
                title: a.titulo,
                description: a.detalle,
                ruta: '/inventario',
            })));
        } catch {
            setInvItems([]);
        }
    }, [canInventario, selectedObra]);

    useEffect(() => { fetchInventory(); }, [fetchInventory]);

    // Global, como la cabecera de Gestiones → Documentos físicos (no se recorta por la obra elegida).
    const fetchImpresos = useCallback(async () => {
        if (!canRegistrarEntregas) { setImpresosSinAsignar(null); return; }
        try {
            const res = await api.get<ApiResponse<unknown[]>>('/documentos-lotes/disponibles');
            setImpresosSinAsignar(res.data.data?.length ?? 0);
        } catch {
            setImpresosSinAsignar(null);
        }
    }, [canRegistrarEntregas]);

    useEffect(() => { fetchImpresos(); }, [fetchImpresos]);

    const { refetch: refetchAlertasDocs } = alertasDocs;
    const { refetch: refetchLotes } = lotes;
    const refreshAll = useCallback(() => {
        fetchSummary(); fetchInventory(); fetchImpresos(); refetchAlertasDocs(); refetchLotes();
    }, [fetchSummary, fetchInventory, fetchImpresos, refetchAlertasDocs, refetchLotes]);

    // Skeletons por-widget. `ready` narrowea `data` a no-null en cada zona.
    const ready = !loading && !!data;
    const showFaltas = shown.has('absence_alerts');
    const showTrend = shown.has('chart_attendance_trend');
    const showAusentes = shown.has('list_absences_today');
    const showVencVehiculos = shown.has('vehiculo_vencimientos');
    const showRanking = shown.has('obra_ranking') && selectedObra == null; // solo ámbito "Todas"

    // ─── Inicio H (propuesta «Marca LOLS», dueño 2026-10-16; diseno.md §9.14) ───
    // La asistencia pendiente y los vehículos tienen tarjeta propia; la bandeja queda con el resto
    // («Otros pendientes») para no mostrar lo mismo dos veces.
    const otrasTareas = useMemo(
        () => (data?.pendingTasks ?? []).filter(t => t.category !== 'asistencia'),
        [data?.pendingTasks],
    );
    const otrosPendientes = useMemo(
        () => contarBandeja(otrasTareas, data?.counters.trabajadoresSinDocs ?? 0, [solicitudItems, documentosFisicosItems, invItems]).total,
        [otrasTareas, data?.counters.trabajadoresSinDocs, solicitudItems, documentosFisicosItems, invItems],
    );
    const hoy = new Date();
    const diaSemana = hoy.getDay();
    const resumen = useMemo(
        () => resumenDelDia(data?.attendanceStatus ?? {}, {
            obraId: selectedObra?.id ?? null,
            vehiculosVencidos: showVencVehiculos ? vehiculosVencidos : 0,
            otrosPendientes,
            diaSemana,
        }),
        [data?.attendanceStatus, selectedObra?.id, showVencVehiculos, vehiculosVencidos, otrosPendientes, diaSemana],
    );
    // `asistencia_hoy` solo llega con permiso de asistencia (dashboard.service, bloque 3).
    const conAsistencia = typeof data?.counters.asistencia_hoy === 'number';
    const verAsistenciaPendiente = ready && conAsistencia && resumen.total > 0 && !resumen.finDeSemana;
    // Documentos físicos (dueño 2026-10-20): para RRHH ocupa el lugar de «Asistencia pendiente» —la cifra de
    // obras ya está en la tarjeta verde— y sus filas salen de la bandeja para no contarlas dos veces a la vista.
    // Quien no registra entregas sigue viendo la nube de obras sin guardar.
    const verDocumentos = canRegistrarEntregas;
    const resumenDocs = useMemo(
        () => resumenDocumentosInicio(alertasDocs.alertas, lotes.pendientes, impresosSinAsignar),
        [alertasDocs.alertas, lotes.pendientes, impresosSinAsignar],
    );
    // Detalle de faltas y ausentes solo cuando hay algo: el «0» ya se lee en la tarjeta verde.
    const verFaltasDetalle = ready && showFaltas && (data?.trabajadoresConAlertas?.length ?? 0) > 0;
    const verAusentesDetalle = ready && showAusentes && (data?.counters.ausentes_hoy ?? 0) > 0;
    const columnaLateral = verFaltasDetalle || verAusentesDetalle;

    return (
        <div className="space-y-6">
            {/* Cartel de atrasos del supervisor que lleva documentos a firmar (pedido de RRHH, 2026-10-19). */}
            <AvisoAtrasosPortador />
            {ready && data ? (
                <InicioHero
                    resumen={resumen}
                    fecha={fechaDelDia(hoy)}
                    ambito={selectedObra ? selectedObra.nombre : 'Todas las obras'}
                    presentesPct={conAsistencia ? data.counters.asistencia_hoy ?? 0 : null}
                    ausentes={showAusentes ? data.counters.ausentes_hoy ?? 0 : null}
                    faltas={showFaltas ? data.trabajadoresConAlertas?.length ?? 0 : null}
                    actualizado={lastUpdated ? lastUpdated.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : null}
                    cargando={loading}
                    onActualizar={refreshAll}
                    onAsistencia={conAsistencia ? () => navigate('/asistencia') : undefined}
                    onVehiculos={showVencVehiculos && vencimientos.items.length > 0 ? () => navigate('/vehiculos') : undefined}
                />
            ) : (
                <div className="h-60 rounded-3xl bg-green-700/80 dark:bg-green-900 motion-safe:animate-pulse" aria-hidden />
            )}

            {/* Tarjetas con círculo de color: vehículos, documentos físicos (o asistencia pendiente) y actividades. */}
            {(showVencVehiculos || verDocumentos || verAsistenciaPendiente || canActividades) && (
                <div className="grid gap-6 items-stretch grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))]">
                    {showVencVehiculos && (
                        <Panel>
                            {vencimientos.loading && vencimientos.items.length === 0
                                ? <SkeletonText lines={5} />
                                : <VehicleExpiries data={vencimientos.items} onNavigate={() => navigate('/vehiculos')} />}
                        </Panel>
                    )}
                    {verDocumentos ? (
                        <Panel>
                            <DocumentosInicio resumen={resumenDocs} onNavigate={() => navigate('/consultas?tab=fisicos')} />
                        </Panel>
                    ) : verAsistenciaPendiente && (
                        <Panel>
                            <AsistenciaPendiente sinGuardar={resumen.sinGuardar} total={resumen.total} onNavigate={() => navigate('/asistencia')} />
                        </Panel>
                    )}
                    {/* Trae sus datos (tiene selector de semana), por eso no depende de `ready`. */}
                    {canActividades && (
                        <Panel>
                            <ActividadesSemana />
                        </Panel>
                    )}
                </div>
            )}

            {/* Otros pendientes (izq) + detalle de faltas y ausentes cuando los hay (der). */}
            <div className={cn('grid grid-cols-1 gap-6 items-start', columnaLateral && 'lg:grid-cols-[1.5fr_1fr]')}>
                <Panel>
                    {ready && data
                        ? <BandejaDelDia
                            titulo="Otros pendientes"
                            vacio={{ titulo: 'Nada más por resolver hoy', descripcion: 'Sin pendientes de documentos, contratos, inventario ni solicitudes.' }}
                            tasks={otrasTareas}
                            trabajadoresSinDocs={data.counters.trabajadoresSinDocs}
                            inventoryItems={invItems}
                            solicitudItems={solicitudItems}
                            documentosFisicosItems={verDocumentos ? [] : documentosFisicosItems}
                            onNavigate={(route) => navigate(route)}
                        />
                        : <SkeletonText lines={6} />}
                </Panel>

                {columnaLateral && data && (
                    <div className="space-y-6 lg:sticky lg:top-6">
                        {verFaltasDetalle && (
                            <Panel>
                                <AbsenceAlerts data={data.trabajadoresConAlertas ?? []} onNavigate={(rut) => navigate(`/asistencia?q=${rut}`)} />
                            </Panel>
                        )}
                        {verAusentesDetalle && (
                            <Panel>
                                <AbsencesToday data={data.ausentesDetalle ?? []} total={data.counters.ausentes_hoy} />
                            </Panel>
                        )}
                    </div>
                )}
            </div>

            {/* Contexto de asistencia: tendencia 7d. */}
            {showTrend && (
                <Panel>
                    {ready && data
                        ? <AttendanceTrend data={data.attendanceTrend} onNavigate={() => navigate('/asistencia')} />
                        : <Skeleton className="h-48 w-full" />}
                </Panel>
            )}

            {/* Ranking de obras (comparativa multi-obra; solo en ámbito "Todas") */}
            {showRanking && (
                <Panel>
                    {ready && data
                        ? <ObraRanking data={data.obraRanking ?? []} onNavigate={(id) => navigate(`/consultas?obra_id=${id}`)} />
                        : <SkeletonText lines={5} />}
                </Panel>
            )}

            {/* Acciones rápidas (footer) */}
            {shown.has('quick_actions') && (
                <Panel>
                    {ready
                        ? <QuickActions permisos={permisos} onNavigate={(route) => navigate(route)} />
                        : <Skeleton className="h-10 w-full" />}
                </Panel>
            )}
        </div>
    );
};

export default Dashboard;
