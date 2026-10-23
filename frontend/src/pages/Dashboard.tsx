import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAparecer } from '../hooks/useAparecer';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useObra } from '../context/ObraContext';
import api from '../services/api';
import type { ApiResponse } from '../types';
import { cn } from '../utils/cn';
import { useSetCentroMovil, useSetPageHeader } from '../context/PageHeaderContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useDashboardLayout } from '../hooks/useDashboardLayout';
import { SkeletonText } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { CheckSquare, FileText, FileWarning, Package, RefreshCw, SearchCheck, Truck, UserPlus } from 'lucide-react';

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
import ObraRanking from '../components/dashboard/widgets/ObraRanking';
import ActividadesSemana from '../components/dashboard/widgets/ActividadesSemana';
import DocumentosInicio from '../components/dashboard/widgets/DocumentosInicio';
import { resumenDocumentosInicio } from '../components/dashboard/widgets/resumenDocumentosInicio';
import AsistenciaInicio from '../components/dashboard/widgets/AsistenciaInicio';
import DetalleAsistencia from '../components/dashboard/widgets/DetalleAsistencia';
import type { AusentesHoy } from '../components/dashboard/widgets/resumenAsistenciaHoy';
import type { DetalleAsistenciaApi } from '../components/dashboard/widgets/resumenAsistenciaDetalle';
import InventarioInicio from '../components/dashboard/widgets/InventarioInicio';
import DetalleInventario from '../components/dashboard/widgets/DetalleInventario';
import RespaldoInventario from '../components/dashboard/widgets/inventarioPerfil/RespaldoInventario';
import DetalleVehiculos from '../components/dashboard/widgets/DetalleVehiculos';
import { resumenInventarioInicio, type FilaInventario, type ResumenInventarioApi } from '../components/dashboard/widgets/resumenInventarioInicio';
import TarjetaPendientes from '../components/dashboard/widgets/TarjetaPendientes';
import FlujoDocumentos from '../components/dashboard/widgets/FlujoDocumentos';
import { InicioMarca } from '../components/dashboard/widgets/InicioMarca';
import { DetalleTusDocumentos, TusDocumentosInicio } from '../components/dashboard/widgets/TusDocumentos';
import { resumenTusDocumentos } from '../components/dashboard/widgets/resumenTusDocumentos';
import { DetalleTusSolicitudes, TusSolicitudesInicio } from '../components/dashboard/widgets/TusSolicitudes';
import { resumenTusSolicitudes } from '../components/dashboard/widgets/resumenTusSolicitudes';
import type { SolicitudIngreso } from '../types/entities';
import type { MisLotesRespuesta } from '../components/documentos-fisicos/documentosFisicos';
import { DetalleModulo } from '../components/dashboard/widgets/DetalleModulo';
import { EncabezadoTarjeta } from '../components/dashboard/widgets/EncabezadoTarjeta';
import { TarjetaActiva, type TonoTarjeta } from '../components/dashboard/widgets/tarjetaActiva';
import { BarraModulos, ColaGota, ModuloEnCurso, TarjetaCompacta, type AccesoModulo } from '../components/dashboard/widgets/TarjetaCompacta';
import { ID_DETALLE_INICIO } from '../components/dashboard/widgets/BotonVerMas';
import { nombreMes, type FaltasMesData, type TrabajadorFaltas } from '../components/dashboard/widgets/resumenFaltasMes';
import { contarBandeja } from '../components/dashboard/widgets/bandejaConteo';
import { fechaDelDia, resumenDelDia } from '../utils/resumenInicio';
import { NovedadesModal } from '../components/novedades/NovedadesModal';
import InicioGerencia from '../components/dashboard/widgets/gerencia/InicioGerencia';
import VerComoInicio from '../components/dashboard/widgets/inventarioPerfil/VerComoInicio';
import { useVerComo } from '../components/dashboard/widgets/inventarioPerfil/useVerComo';
import { esSuperAdmin } from '../components/dashboard/widgets/inventarioPerfil/perfil';

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
    trabajadoresConAlertas: TrabajadorFaltas[];
    /** Reiterados del mes con su total real (tarjeta «Asistencia»); null si el backend no pudo calcularlo. */
    faltasMes?: FaltasMesData | null;
    /** Ausentes de hoy completos y por motivo (tarjeta y detalle de Asistencia, 2026-10-20). */
    ausentesHoy?: AusentesHoy | null;
    saludo: { nombre: string; resumen: string; totalAlertas: number };
}

// ─── Panel: tarjeta blanca del Inicio (2026-10-16): sin borde, sombra suave (en oscuro la sombra
// trae su anillo de 1 px), esquinas grandes. El color va en el círculo de cada encabezado
// (EncabezadoTarjeta), nunca en el fondo.
/**
 * Contenido que se pliega y despliega animando la altura (fila de grid de 0fr a 1fr, 250 ms; en seco con
 * «reducir movimiento»). Plegado queda `inert`: ni Tab ni lector de pantalla entran.
 */
const Plegable: React.FC<{ abierto: boolean; llena?: boolean; children: React.ReactNode; className?: string }> = ({ abierto, llena, children, className }) => (
    <div inert={!abierto}
        className={cn('grid transition-[grid-template-rows,opacity] duration-[250ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none',
            abierto ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0', llena && abierto && 'flex-1')}>
        <div className={cn('min-h-0 overflow-hidden', className)}>{children}</div>
    </div>
);

/** Clase de fundido de los datos de las tarjetas (useAparecer en Dashboard): el contorno de cada tarjeta queda fijo. */
const DatosAparecen = createContext('');

const Panel: React.FC<{
    children: React.ReactNode; className?: string; onClick?: () => void; activa?: boolean;
    /** Con un detalle abierto, las tarjetas se pliegan a su franja `resumen` (dueño 2026-10-20). */
    compacta?: boolean; resumen?: React.ReactNode;
    /** Clases de visibilidad de la cola de gota de la tarjeta elegida (solo con las tarjetas en una fila). */
    cola?: string;
}> = ({ children, className, onClick, activa = false, compacta = false, resumen, cola }) => {
    const plegada = compacta && resumen !== undefined;
    const aparece = useContext(DatosAparecen);
    return (
        <div
            className={cn('relative flex flex-col rounded-3xl bg-card text-foreground shadow-[var(--shadow-md)]',
                'transition-[background-color,box-shadow,padding] duration-[250ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none',
                plegada ? 'px-5 py-4' : 'p-6',
                onClick && 'cursor-pointer hover:ring-1 hover:ring-border',
                activa && 'tarjeta-activa', className)}
            // Tarjeta entera pinchable (atajo con mouse/dedo): los botones y enlaces de adentro mandan sobre ella.
            // Con teclado, el camino es su botón «Ver más» (o la franja, que es un botón).
            onClick={onClick ? (e) => {
                if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [role="button"]')) return;
                onClick();
            } : undefined}
        >
            <TarjetaActiva.Provider value={activa}>
                {resumen !== undefined && <Plegable abierto={plegada}>{resumen}</Plegable>}
                <Plegable abierto={!plegada} llena className={aparece}>{children}</Plegable>
            </TarjetaActiva.Provider>
            {activa && plegada && cola !== undefined && <ColaGota className={cola} />}
        </div>
    );
};

/** Columnas de la fila de tarjetas según cuántas ve el perfil: todas en una línea desde 1280 px. */
const COLUMNAS: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
};

// ─── Dashboard ───
const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const { selectedObra, isLoading: cargandoObras } = useObra();
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
    const superAdmin = esSuperAdmin(user);
    const [verComo] = useVerComo(superAdmin ? user?.id : null);
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

    // ─── Fetch Data (reutilizable para el botón refrescar) ───
    // Turno de la última petición (2026-10-20): al entrar, el resumen se pedía con «todas las obras» antes
    // de que el selector restaurara la obra guardada, y si esa respuesta llegaba DESPUÉS de la buena la
    // pisaba (se veía la obra elegida arriba con los datos de todas). Solo la respuesta del último turno
    // escribe, y no se pide nada hasta que el selector cargó.
    const turnoResumen = useRef(0);
    const fetchSummary = useCallback(async () => {
        const turno = ++turnoResumen.current;
        setLoading(true);
        try {
            const query = selectedObra ? `?obra_id=${selectedObra.id}` : '';
            const res = await api.get<ApiResponse<DashboardData>>(`/dashboard/summary${query}`);
            if (turno !== turnoResumen.current) return;
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
            if (turno === turnoResumen.current) toast.error('Error al cargar resumen del dashboard');
        } finally {
            if (turno === turnoResumen.current) setLoading(false);
        }
    }, [selectedObra]);

    useEffect(() => { if (!cargandoObras) fetchSummary(); }, [fetchSummary, cargandoObras]);

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

    // Portador que no registra (Jhoan): su Inicio abre con «Tus documentos» (perfil portador, dueño 2026-10-21).
    const esPortador = permisos.includes('documentos.entrega.portar') && !canRegistrarEntregas;
    const [misLotes, setMisLotes] = useState<MisLotesRespuesta | null>(null);
    const fetchMisLotes = useCallback(async () => {
        if (!esPortador) { setMisLotes(null); return; }
        try {
            const res = await api.get<ApiResponse<MisLotesRespuesta>>('/documentos-lotes/mios');
            setMisLotes(res.data.data ?? null);
        } catch {
            setMisLotes(null);
        }
    }, [esPortador]);
    useEffect(() => { fetchMisLotes(); }, [fetchMisLotes]);
    const resumenMis = useMemo(() => (misLotes ? resumenTusDocumentos(misLotes) : null), [misLotes]);

    // Terreno (crea fichas de ingreso, no aprueba ni registra entregas): «Tus solicitudes de ingreso»
    // (perfil terreno, dueño 2026-10-21). El portador que además crea fichas las ve en su detalle.
    const creaFichas = permisos.includes('trabajadores.solicitud.crear') && !canAprobarSolicitudes && !canRegistrarEntregas;
    const esTerreno = creaFichas && !esPortador;
    const [misSolicitudes, setMisSolicitudes] = useState<SolicitudIngreso[] | null>(null);
    const fetchMisSolicitudes = useCallback(async () => {
        if (!creaFichas) { setMisSolicitudes(null); return; }
        try {
            const res = await api.get<ApiResponse<SolicitudIngreso[]>>('/solicitudes-ingreso', { params: { estado: 'todas', incluir_prueba: 'true' } });
            setMisSolicitudes(res.data.data ?? []);
        } catch {
            setMisSolicitudes(null);
        }
    }, [creaFichas]);
    useEffect(() => { fetchMisSolicitudes(); }, [fetchMisSolicitudes]);
    const resumenSol = useMemo(() => (misSolicitudes ? resumenTusSolicitudes(misSolicitudes) : null), [misSolicitudes]);

    // Inventario: lo que le toca a quien mira según su perfil (tarjeta «Inventario», dueño 2026-10-20).
    const [resumenInv, setResumenInv] = useState<ResumenInventarioApi | null>(null);
    const fetchResumenInv = useCallback(async () => {
        if (!canInventario) { setResumenInv(null); return; }
        try {
            const res = await api.get<ApiResponse<ResumenInventarioApi>>('/transferencias/inicio');
            setResumenInv(res.data.data ?? null);
        } catch {
            setResumenInv(null);
        }
    }, [canInventario]);

    useEffect(() => { fetchResumenInv(); }, [fetchResumenInv]);

    const { refetch: refetchAlertasDocs } = alertasDocs;
    const { refetch: refetchLotes } = lotes;
    const { refetch: refetchVencimientos } = vencimientos;
    const refreshAll = useCallback(() => {
        fetchSummary(); fetchInventory(); fetchImpresos(); fetchResumenInv(); refetchAlertasDocs(); refetchLotes(); fetchMisLotes(); fetchMisSolicitudes(); refetchVencimientos();
    }, [fetchSummary, fetchInventory, fetchImpresos, fetchResumenInv, refetchAlertasDocs, refetchLotes, fetchMisLotes, fetchMisSolicitudes, refetchVencimientos]);

    // ─── Encabezado: rótulo, fecha y «Actualizar» (antes vivían en la tarjeta verde, que se fue el 2026-10-20) ───
    const hora = lastUpdated ? lastUpdated.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : null;
    const headerTitle = useMemo(() => (
        <div className="flex min-w-0 items-center gap-3">
            <h1 className="text-base font-semibold text-foreground">Inicio</h1>
            <span className="hidden truncate text-sm text-muted-foreground md:inline">{fechaDelDia(new Date())}</span>
            <Button variant="ghost" size="sm" onClick={refreshAll} isLoading={loading && !!data} aria-label="Actualizar"
                title={hora ? `Actualizado ${hora}` : undefined} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}>
                <span className="hidden sm:inline">Actualizar</span>
            </Button>
        </div>
    ), [refreshAll, loading, hora]);
    useSetPageHeader(headerTitle);

    // Skeletons por-widget. `ready` narrowea `data` a no-null en cada zona.
    const ready = !loading && !!data;
    // Fundido de datos solo si antes se vio el contorno (hooks/useAparecer).
    const aparece = useAparecer(!ready);
    const showFaltas = shown.has('absence_alerts');
    const showVencVehiculos = shown.has('vehiculo_vencimientos');
    const showRanking = shown.has('obra_ranking') && selectedObra == null; // solo ámbito "Todas"

    // Pendientes que no son asistencia (documentos por vencer, contratos de 10 meses): van al detalle de Gestiones.
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
    // Obras con y sin asistencia guardada hoy (detalle de Asistencia).
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

    // ─── Inicio por módulos (dueño 2026-10-20; diseno.md §9.14) ───
    // Una tarjeta por apartado —Asistencia, Gestiones, Inventario, Vehículos— con lo primero de cada uno y
    // «Ver más»; debajo se despliega el detalle del módulo elegido (parte abierto el primero visible).
    const resumenDocs = useMemo(
        () => resumenDocumentosInicio(alertasDocs.alertas, lotes.pendientes, impresosSinAsignar),
        [alertasDocs.alertas, lotes.pendientes, impresosSinAsignar],
    );
    const modeloInv = useMemo(() => resumenInventarioInicio(resumenInv), [resumenInv]);
    // Gestiones para quien NO registra entregas: sus pendientes de siempre (solicitudes, documentos por
    // vencer, contratos, trabajadores sin documentos, sus lotes de portador), los más graves primero.
    const gestionesItems = useMemo((): BandejaItem[] => {
        const orden = { critical: 0, warning: 1, info: 2 } as const;
        const sinDocs = data?.counters.trabajadoresSinDocs ?? 0;
        return [
            ...solicitudItems,
            ...(canRegistrarEntregas ? [] : documentosFisicosItems),
            ...otrasTareas.map(t => ({ severity: t.severity, title: t.title, description: t.description, ruta: t.action.ruta })),
            ...(sinDocs > 0 ? [{
                severity: 'warning' as const,
                title: `${sinDocs} trabajador${sinDocs === 1 ? '' : 'es'} sin documentos obligatorios`,
                description: 'Completar su carpeta en Gestiones',
                ruta: '/consultas?completitud=faltantes',
            }] : []),
        ].sort((a, b) => orden[a.severity] - orden[b.severity]);
    }, [solicitudItems, canRegistrarEntregas, documentosFisicosItems, otrasTareas, data?.counters.trabajadoresSinDocs]);
    const totalGestiones = useMemo(
        () => contarBandeja(otrasTareas, data?.counters.trabajadoresSinDocs ?? 0, [solicitudItems, canRegistrarEntregas ? [] : documentosFisicosItems]).total,
        [otrasTareas, data?.counters.trabajadoresSinDocs, solicitudItems, canRegistrarEntregas, documentosFisicosItems],
    );

    type Modulo = 'asistencia' | 'gestiones' | 'inventario' | 'vehiculos';
    const verGestiones = canRegistrarEntregas || permisos.includes('trabajadores.ver')
        || permisos.includes('trabajadores.solicitud.crear') || canAprobarSolicitudes
        || permisos.includes('documentos.entrega.portar');
    // El portador ve primero sus documentos y terreno sus solicitudes (también en la barra del celular).
    const gestionesPrimero = esPortador || esTerreno;
    const visibles: Modulo[] = [
        ...(gestionesPrimero && verGestiones ? ['gestiones' as const] : []),
        ...(showFaltas ? ['asistencia' as const] : []),
        ...(verGestiones && !gestionesPrimero ? ['gestiones' as const] : []),
        ...(canInventario ? ['inventario' as const] : []),
        ...(showVencVehiculos ? ['vehiculos' as const] : []),
    ];
    const [elegido, setElegido] = useState<Modulo | null>(null);
    // Al entrar no hay detalle abierto (dueño 2026-10-20: «que abajo no haya nada»); pinchar una tarjeta lo
    // abre y pincharla de nuevo lo cierra.
    // En el CELULAR no hay tarjetas (dueño 2026-10-20): se entra directo al detalle del primer módulo y la
    // barra de abajo cambia entre ellos, así que siempre hay uno abierto.
    const esCelular = useMediaQuery('(max-width: 639.98px)');
    const activo: Modulo | null = elegido && visibles.includes(elegido) ? elegido : esCelular ? (visibles[0] ?? null) : null;
    // Abrir el detalle NO mueve la pantalla (dueño 2026-10-20: el salto repentino desorienta). El detalle
    // aparece bajo las tarjetas y la tarjeta elegida se pinta verde; el usuario baja cuando quiere.
    const verMas = useCallback((m: Modulo) => {
        setElegido(actual => (actual === m ? null : m));
    }, []);
    // Las cifras de la tarjeta abren el detalle (sin cerrarlo si ya estaba abierto) y tampoco mueven la pantalla.
    const abrirSeccion = useCallback(() => setElegido('asistencia'), []);
    // Detalle de Asistencia, fase 2: se pide SOLO al abrirlo (no pesa en el resumen) y al cambiar de obra o
    // pulsar «Actualizar» con el detalle abierto.
    const [mesAsistencia, setMesAsistencia] = useState<DetalleAsistenciaApi | null>(null);
    const [cargandoMesAsistencia, setCargandoMesAsistencia] = useState(false);
    const asistenciaAbierta = activo === 'asistencia';
    const turnoMes = useRef(0);
    const fetchMesAsistencia = useCallback(async () => {
        const turno = ++turnoMes.current;
        setCargandoMesAsistencia(true);
        try {
            const query = selectedObra ? `?obra_id=${selectedObra.id}` : '';
            const res = await api.get<ApiResponse<DetalleAsistenciaApi>>(`/dashboard/asistencia${query}`);
            if (turno === turnoMes.current) setMesAsistencia(res.data.data ?? null);
        } catch {
            if (turno === turnoMes.current) setMesAsistencia(null);
        } finally {
            if (turno === turnoMes.current) setCargandoMesAsistencia(false);
        }
    }, [selectedObra]);
    useEffect(() => {
        if (asistenciaAbierta) fetchMesAsistencia();
    }, [asistenciaAbierta, fetchMesAsistencia, lastUpdated]);
    const irATrabajador = (rut: string) => navigate(`/asistencia?q=${encodeURIComponent(rut)}`);
    const irAFilaInventario = (f: FilaInventario) => navigate(`/inventario?tab=transferencias&estado=${f.estado}`);
    const mes = nombreMes(hoy);
    // Obras con y sin asistencia guardada hoy, para la tarjeta y el detalle de Asistencia.
    const obrasHoy = conAsistencia ? {
        total: resumen.total, guardadas: resumen.guardadas, sinGuardar: resumen.sinGuardar, finDeSemana: resumen.finDeSemana,
    } : null;
    const fechaAsistencia = { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1, hoyDia: hoy.getDate() };

    // ─── Franjas compactas (tarjetas plegadas mientras hay un detalle abierto, dueño 2026-10-20) ───
    const reiteradosN = ready ? (data?.faltasMes?.reiterados ?? 0) : null;
    const tonoAsistencia: TonoTarjeta = (reiteradosN ?? 0) > 0 ? 'rojo'
        : obrasHoy && !obrasHoy.finDeSemana && obrasHoy.sinGuardar.length > 0 ? 'ambar' : 'verde';
    const tonoGestiones: TonoTarjeta = canRegistrarEntregas ? resumenDocs.tono
        : gestionesItems.some(i => i.severity === 'critical') ? 'rojo' : totalGestiones > 0 ? 'ambar' : 'verde';
    const porVencerVeh = vencimientos.items.length - vehiculosVencidos;
    const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
    // Lo que muestra cada módulo plegado: la franja (pantallas anchas) y el botón de la barra (celular).
    const resumenes: Record<Modulo, Omit<AccesoModulo, 'key'> & { detalle: string }> = {
        asistencia: { icon: CheckSquare, tono: tonoAsistencia, titulo: 'Asistencia', cifra: reiteradosN,
            detalle: plural(reiteradosN ?? 0, 'falta reiterada', 'faltas reiteradas') },
        gestiones: esPortador
            ? { icon: FileText, tono: resumenMis?.tono ?? 'neutro', titulo: 'Documentos', cifra: resumenMis ? resumenMis.porEntregar : null, detalle: 'por entregar' }
            : esTerreno
            ? { icon: UserPlus, tono: resumenSol?.tono ?? 'neutro', titulo: 'Solicitudes', cifra: resumenSol ? resumenSol.pendientes : null, detalle: 'esperando revisión' }
            : canRegistrarEntregas
            ? { icon: FileWarning, tono: tonoGestiones, titulo: 'Gestiones', cifra: resumenDocs.fueraDePlazo, detalle: 'fuera de plazo' }
            : { icon: SearchCheck, tono: tonoGestiones, titulo: 'Gestiones', cifra: ready ? totalGestiones : null,
                detalle: plural(totalGestiones, 'pendiente', 'pendientes') },
        inventario: { icon: Package, tono: modeloInv.tono, titulo: 'Inventario', cifra: modeloInv.cifra, detalle: modeloInv.etiqueta },
        vehiculos: { icon: Truck, titulo: 'Vehículos', tono: vehiculosVencidos > 0 ? 'rojo' : porVencerVeh > 0 ? 'ambar' : 'verde',
            cifra: vencimientos.loading && vencimientos.items.length === 0 ? null : vehiculosVencidos > 0 ? vehiculosVencidos : porVencerVeh,
            detalle: vehiculosVencidos > 0 ? plural(vehiculosVencidos, 'vencido', 'vencidos') : 'por vencer' },
    };
    const compactas = Object.fromEntries((Object.keys(resumenes) as Modulo[]).map(m => [m,
        <TarjetaCompacta key={m} {...resumenes[m]} onClick={() => verMas(m)} />])) as Record<Modulo, React.ReactNode>;
    // Barra del celular: cambiar de módulo deja ver el detalle nuevo desde su comienzo si se había bajado más
    // allá (convención de pestañas); abrir o cerrar no mueve nada.
    const elegirDesdeBarra = (clave: string) => {
        const m = clave as Modulo;
        if (activo === m) return; // pestaña: tocar la abierta no la cierra
        setElegido(m);
        window.requestAnimationFrame(() => {
            const el = document.getElementById(ID_DETALLE_INICIO);
            if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' });
        });
    };
    // Celular: el módulo en curso va al centro del encabezado (en vez de la fila de título del detalle).
    const iconoEnCurso = activo ? resumenes[activo].icon : null;
    const tituloEnCurso = activo ? resumenes[activo].titulo : null;
    const centroMovil = useMemo(() => {
        if (!esCelular || !activo || !iconoEnCurso || !tituloEnCurso) return null;
        const ruta: Record<Modulo, string> = {
            asistencia: '/asistencia', gestiones: esPortador ? '/consultas?tab=fisicos' : esTerreno ? '/consultas?tab=solicitudes' : '/consultas?tab=inicio', inventario: '/inventario?tab=transferencias', vehiculos: '/vehiculos',
        };
        return <ModuloEnCurso icon={iconoEnCurso} titulo={tituloEnCurso} onIr={() => navigate(ruta[activo])} />;
    }, [esCelular, activo, iconoEnCurso, tituloEnCurso, navigate, esPortador, esTerreno]);
    useSetCentroMovil(centroMovil);
    // La cola solo se ve cuando las tarjetas van en UNA fila (si no, apuntaría a la tarjeta de abajo).
    const colaVisible = visibles.length <= 1 ? '' : visibles.length === 2 ? 'hidden sm:block' : 'hidden xl:block';

    return (
        <DatosAparecen.Provider value={aparece}>
        <div className={cn('space-y-6', visibles.length > 0 && 'max-sm:pb-28')}>
            {/* El cartel de atrasos del portador se quitó (dueño 2026-10-21): avisa la ventana al iniciar sesión
                (AlertaAtrasosAlEntrar) y su tarjeta «Tus documentos» va primero. */}
            {/* Lo nuevo de la última entrega, una vez por persona (config/novedades.ts). */}
            <NovedadesModal />

            {/* Super Admin (Marcos 2026-10-23): «Ver como» arriba de todo, para mirar el Inicio de gerencia y las vistas de
                Inventario de los demás; su Inicio propio no lleva el tablero de gerencia. */}
            <VerComoInicio version={lastUpdated} onInventario={() => setElegido('inventario')} />
            {/* Inicio de gerencia (don Luis, opción B «Tablero por tema», 2026-10-23): arriba de las tarjetas, con su permiso
                (el Super Admin, solo con «Ver como → Gerencia»). */}
            {(superAdmin ? verComo === 'gerencia' : permisos.includes('inicio.gerencia')) && <InicioGerencia version={lastUpdated} />}

            {/* Una tarjeta por apartado, todas en una línea desde 1280 px (2×2 en tablet, una bajo otra en celular). */}
            {visibles.length > 0 && (
                <div className={cn('grid gap-6 items-stretch', COLUMNAS[visibles.length], 'max-sm:hidden')}>
                    {/* Con un detalle abierto, todas se pliegan a su franja (`compacta`) y la elegida lleva la cola. */}
                    {showFaltas && (
                        <Panel className="h-full" activa={activo === 'asistencia'} onClick={() => verMas('asistencia')}
                            compacta={activo !== null} resumen={compactas.asistencia} cola={colaVisible}>
                            {ready && data
                                ? <AsistenciaInicio faltas={data.faltasMes ?? null} ausentes={data.ausentesHoy ?? null} obras={obrasHoy}
                                    fechaTexto={fechaDelDia(hoy)} mesNombre={mes}
                                    onTrabajador={irATrabajador} onObras={() => navigate('/asistencia')} onSeccion={abrirSeccion}
                                    activo={activo === 'asistencia'} onVerMas={() => verMas('asistencia')} />
                                : <SkeletonText lines={5} />}
                        </Panel>
                    )}
                    {verGestiones && (
                        <Panel className={cn('h-full', gestionesPrimero && 'order-first')} activa={activo === 'gestiones'} onClick={() => verMas('gestiones')}
                            compacta={activo !== null} resumen={compactas.gestiones} cola={colaVisible}>
                            {esPortador
                                ? <TusDocumentosInicio resumen={resumenMis} activo={activo === 'gestiones'} onVerMas={() => verMas('gestiones')} />
                                : esTerreno
                                ? <TusSolicitudesInicio resumen={resumenSol} activo={activo === 'gestiones'} onVerMas={() => verMas('gestiones')}
                                    onNuevo={() => navigate('/consultas?tab=solicitudes')} />
                                : canRegistrarEntregas
                                ? <DocumentosInicio resumen={resumenDocs} activo={activo === 'gestiones'} onVerMas={() => verMas('gestiones')} />
                                : ready
                                    ? <TarjetaPendientes icon={SearchCheck} titulo="Gestiones" subtitulo="Trabajadores, solicitudes y documentos"
                                        items={gestionesItems} total={totalGestiones} onNavigate={(r) => navigate(r)}
                                        activo={activo === 'gestiones'} onVerMas={() => verMas('gestiones')} modulo="Gestiones" />
                                    : <SkeletonText lines={5} />}
                        </Panel>
                    )}
                    {canInventario && (
                        <Panel className="h-full" activa={activo === 'inventario'} onClick={() => verMas('inventario')}
                            compacta={activo !== null} resumen={compactas.inventario} cola={colaVisible}>
                            <InventarioInicio modelo={modeloInv} onFila={irAFilaInventario}
                                activo={activo === 'inventario'} onVerMas={() => verMas('inventario')} />
                        </Panel>
                    )}
                    {showVencVehiculos && (
                        <Panel className="h-full" activa={activo === 'vehiculos'} onClick={() => verMas('vehiculos')}
                            compacta={activo !== null} resumen={compactas.vehiculos} cola={colaVisible}>
                            {vencimientos.loading && vencimientos.items.length === 0
                                ? <SkeletonText lines={5} />
                                : <VehicleExpiries data={vencimientos.items} onNavigate={() => navigate('/vehiculos')}
                                    activo={activo === 'vehiculos'} onVerMas={() => verMas('vehiculos')} />}
                        </Panel>
                    )}
                </div>
            )}

            {/* ─── Detalle del módulo elegido (se irá sumando más información y gráficos) ─── */}
            {/* Sin detalle abierto, el espacio bajo las tarjetas lleva la marca y accesos directos (propuesta C,
                dueño 2026-10-21). En el celular siempre hay un módulo abierto, así que no aparece. */}
            {activo === null && (
                <InicioMarca nombre={user?.nombre} permisos={permisos} onIr={(r) => navigate(r)} className="max-sm:hidden" />
            )}

            {activo === 'asistencia' && (
                <DetalleModulo icon={CheckSquare} titulo="Asistencia"
                    descripcion={`Lo que exige acción en ${mes}, el día de hoy y la tendencia`}
                    accion={{ texto: 'Ir a Asistencia', onClick: () => navigate('/asistencia') }}>
                    <DetalleAsistencia faltas={data?.faltasMes ?? null} ausentes={data?.ausentesHoy ?? null} obras={obrasHoy}
                        mesNombre={mes} {...fechaAsistencia} cargando={!ready}
                        mesExtra={mesAsistencia} cargandoMes={cargandoMesAsistencia}
                        verMes={permisos.includes('asistencia.exportar_excel') || permisos.includes('asistencia.horas_extra.ver')}
                        onTrabajador={irATrabajador} onAsistencia={() => navigate('/asistencia')}>
                        {(canActividades || showRanking) && (
                            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                {/* Trae sus datos (tiene selector de semana), por eso no depende de `ready`. */}
                                {canActividades && (
                                    <Panel>
                                        <ActividadesSemana />
                                    </Panel>
                                )}
                                {showRanking && (
                                    <Panel className={canActividades ? undefined : 'lg:col-span-2'}>
                                        {ready && data
                                            ? <ObraRanking data={data.obraRanking ?? []} onNavigate={(id) => navigate(`/consultas?obra_id=${id}`)} />
                                            : <SkeletonText lines={5} />}
                                    </Panel>
                                )}
                            </div>
                        )}
                    </DetalleAsistencia>
                </DetalleModulo>
            )}

            {activo === 'gestiones' && esPortador && (
                <DetalleModulo icon={FileText} titulo="Tus documentos"
                    descripcion="Lo que tienes que llevar a firmar y devolver a RRHH"
                    accion={{ texto: 'Ir a Documentos físicos', onClick: () => navigate('/consultas?tab=fisicos') }}>
                    <div className="grid grid-cols-1 gap-6">
                        <Panel>
                            {misLotes ? <DetalleTusDocumentos mis={misLotes} onIr={() => navigate('/consultas?tab=fisicos')} /> : <SkeletonText lines={6} />}
                        </Panel>
                        {/* El portador que además envía fichas de ingreso ve aquí cómo van. */}
                        {creaFichas && resumenSol && (
                            <Panel>
                                <EncabezadoTarjeta icon={UserPlus} tono={resumenSol.tono} titulo="Tus solicitudes de ingreso" subtitulo="Fichas que enviaste a RRHH" />
                                <DetalleTusSolicitudes resumen={resumenSol} onIr={() => navigate('/consultas?tab=solicitudes')} />
                            </Panel>
                        )}
                    </div>
                </DetalleModulo>
            )}

            {activo === 'gestiones' && esTerreno && (
                <DetalleModulo icon={UserPlus} titulo="Tus solicitudes de ingreso"
                    descripcion="Todas tus fichas por estado"
                    accion={{ texto: 'Ir a Solicitudes', onClick: () => navigate('/consultas?tab=solicitudes') }}>
                    <Panel>
                        {resumenSol ? <DetalleTusSolicitudes resumen={resumenSol} onIr={() => navigate('/consultas?tab=solicitudes')} /> : <SkeletonText lines={6} />}
                    </Panel>
                </DetalleModulo>
            )}

            {activo === 'gestiones' && !esPortador && !esTerreno && (
                <DetalleModulo icon={SearchCheck} titulo="Gestiones"
                    descripcion={canRegistrarEntregas ? 'El flujo de los documentos físicos y el resto de los pendientes' : 'Pendientes de trabajadores, solicitudes y documentos'}
                    accion={{ texto: 'Ir a Gestiones', onClick: () => navigate('/consultas?tab=inicio') }}>
                    <div className="grid grid-cols-1 gap-6">
                        {/* RRHH: el flujo completo por etapa (detalle D del lienzo, dueño 2026-10-21). */}
                        {canRegistrarEntregas && (
                            <Panel>
                                <EncabezadoTarjeta icon={FileWarning} tono={resumenDocs.tono} titulo="Documentos físicos"
                                    subtitulo="Elige una etapa del flujo para ver qué hay en ella" />
                                <FlujoDocumentos alertas={alertasDocs.alertas} onIr={() => navigate('/consultas?tab=fisicos')} />
                            </Panel>
                        )}
                        <Panel>
                            {ready && data
                                ? <BandejaDelDia
                                    titulo="Otros pendientes"
                                    vacio={{ titulo: 'Nada más por resolver', descripcion: 'Sin solicitudes, documentos por vencer, contratos ni trabajadores sin documentos.' }}
                                    tasks={otrasTareas}
                                    trabajadoresSinDocs={data.counters.trabajadoresSinDocs}
                                    solicitudItems={solicitudItems}
                                    documentosFisicosItems={canRegistrarEntregas ? [] : documentosFisicosItems}
                                    onNavigate={(route) => navigate(route)}
                                />
                                : <SkeletonText lines={6} />}
                        </Panel>
                    </div>
                </DetalleModulo>
            )}

            {activo === 'inventario' && (
                // Una vista por perfil (Marcos 2026-10-22): DetalleInventario elige la vista y su descripción; a los
                // demás perfiles les deja lo de antes (`respaldo`: «Solicitudes» + «Alertas de inventario»).
                // `onCambio`: al aprobar o rechazar ahí mismo (VistaLeonardo, 2026-10-23), la tarjeta de arriba se pone al día.
                <DetalleInventario version={lastUpdated} onIr={() => navigate('/inventario?tab=transferencias')} onCambio={fetchResumenInv}
                    respaldo={<RespaldoInventario Tarjeta={Panel} modelo={modeloInv} cargado={resumenInv !== null}
                        onFila={irAFilaInventario} alertas={invItems} onNavigate={(route) => navigate(route)} />} />
            )}

            {activo === 'vehiculos' && (
                <DetalleModulo icon={Truck} titulo="Vehículos"
                    descripcion="Papeles de la flota: qué venció, qué viene y a quién avisarle"
                    accion={{ texto: 'Ir a Vehículos', onClick: () => navigate('/vehiculos') }}>
                    {/* Calendario + ficha (Marcos 2026-10-22): sin Panel, dos tarjetas como «Hoy» y «Próximos 14 días» de Asistencia. */}
                    <DetalleVehiculos version={lastUpdated} />
                </DetalleModulo>
            )}
            {/* Celular: en vez de tarjetas, barra de accesos fija abajo (oculta desde 640 px). */}
            {visibles.length > 0 && (
                <BarraModulos activo={activo} onElegir={elegirDesdeBarra}
                    items={visibles.map(m => ({ key: m, ...resumenes[m] }))} />
            )}
        </div>
        </DatosAparecen.Provider>
    );
};

export default Dashboard;
