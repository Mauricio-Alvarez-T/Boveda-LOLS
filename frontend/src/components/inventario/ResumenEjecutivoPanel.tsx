import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileClock,
    AlertTriangle,
    Truck,
    Wallet,
    Landmark,
    ChevronRight,
    Package,
    CheckCircle2,
    Timer,
    XCircle,
    Filter,
    ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../utils/cn';
import api from '../../services/api';
import {
    useDashboardEjecutivo,
    type DashboardAlerta,
    type KpiHistorico,
    type DashboardEjecutivoData,
} from '../../hooks/inventario/useDashboardEjecutivo';
import { useAuth } from '../../context/AuthContext';
import { FormError } from '../ui/FormError';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { fmtMoney } from '../../utils/format';
import { showApiError, showConfirmToast } from '../../utils/toastUtils';

interface ObraOpcion { id: number; nombre: string; }

interface Props {
    /** Navega al tab de transferencias filtrando por estado y, opcionalmente, abriendo una. */
    onNavigateTransferencias: (opts: { estado?: string; transferenciaId?: number }) => void;
    /** Navega al tab "Por Obra/Bodega" preseleccionando la obra indicada. */
    onNavigateObra: (obraId: number) => void;
    /** Modo Bodega Virtual: su stock solo entra al patrimonio en 'sumar'. */
    bodegaVirtualModo?: 'ocultar' | 'mostrar' | 'sumar';
}

/*
 * Resumen Ejecutivo — rediseño 2026-10 (mockup aprobado por el dueño).
 * Orden: 1) montos con color y tendencia, 2) patrimonio en una barra,
 * 3) detalle en pestañas con gráficos (obras / categorías / vehículos),
 * 4) decisiones pendientes al final, con la acción en la misma fila.
 * Se retiraron: tarjeta TOTAL repetida, «Patrimonio por empresa» (filas en $0),
 * «Actualizado ahora», el gráfico acumulado de vehículos y bombas del mes
 * (viven en Vehículos y Hormigón). Montos siempre completos con `fmtMoney`.
 */

// Paleta de gráficos (literales: el SVG/estilo inline no lee clases de Tailwind).
const PALETA = ['#059669', '#2563EB', '#D97706', '#7C3AED', '#0891B2', '#DB2777'];

type Tono = 'green' | 'blue' | 'amber';
const TONO: Record<Tono, { card: string; tile: string; stroke: string; fill: string }> = {
    green: {
        card: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900',
        tile: 'bg-emerald-600 text-white',
        stroke: '#059669',
        fill: 'rgba(5,150,105,.14)',
    },
    blue: {
        card: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900',
        tile: 'bg-blue-600 text-white',
        stroke: '#2563EB',
        fill: 'rgba(37,99,235,.14)',
    },
    amber: {
        card: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900',
        tile: 'bg-amber-600 text-white',
        stroke: '#D97706',
        fill: 'rgba(217,119,6,.15)',
    },
};

// ────────────────────────────────────────────────────────
// Curva de tendencia (área) — solo con historial real
// ────────────────────────────────────────────────────────
const TendenciaImpl: React.FC<{ data: number[]; tono: Tono }> = ({ data, tono }) => {
    if (!data || data.length < 2) return null;
    const w = 300, h = 54;
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 6 - ((v - min) / range) * (h - 14)).toFixed(1)}`);
    return (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block w-full h-12 mt-3" aria-hidden="true">
            <path d={`M0,${h} L${pts.join(' L')} L${w},${h} Z`} fill={TONO[tono].fill} />
            <polyline points={pts.join(' ')} fill="none" stroke={TONO[tono].stroke} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
    );
};
const Tendencia = React.memo(TendenciaImpl);

const DeltaChip: React.FC<{ delta: number | null | undefined }> = ({ delta }) => {
    if (delta === null || delta === undefined) return null;
    const flat = delta === 0;
    const up = delta > 0;
    return (
        <span
            title={`Variación vs hace 30 días: ${up ? '+' : ''}${delta}%`}
            className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded-md text-caption font-black',
                flat ? 'bg-muted text-muted-foreground'
                    : up ? 'bg-emerald-200/70 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                        : 'bg-red-200/70 text-red-800 dark:bg-red-500/20 dark:text-red-300'
            )}
        >
            {flat ? '→' : up ? '↑' : '↓'} {Math.abs(delta)}%
        </span>
    );
};

// ────────────────────────────────────────────────────────
// Tarjeta de monto
// ────────────────────────────────────────────────────────
interface MontoCardProps {
    tono: Tono;
    icon: React.ReactNode;
    label: string;
    value: number;
    sub: string;
    tooltip: string;
    historico?: KpiHistorico;
    /** Primera carga: color, ícono, rótulo y bajada de verdad; solo la cifra en silueta (diseno.md §9.17). */
    cargando?: boolean;
}

const MontoCardImpl: React.FC<MontoCardProps> = ({ tono, icon, label, value, sub, tooltip, historico, cargando = false }) => {
    const texto = fmtMoney(value);
    return (
        <div title={tooltip} className={cn('flex flex-col rounded-2xl border p-5 min-w-0', TONO[tono].card)}>
            <div className="flex items-center gap-2.5">
                <div className={cn('p-2 rounded-xl shrink-0', TONO[tono].tile)}>{icon}</div>
                <span className="text-label md:text-xs font-black uppercase tracking-wider text-brand-dark">{label}</span>
                <span className="ml-auto"><DeltaChip delta={historico?.delta_pct} /></span>
            </div>
            {cargando ? <Skeleton className="mt-3 h-8 md:h-9 w-48 max-w-full" /> : (
                <div className={cn(
                    'mt-3 font-black leading-none tabular-nums whitespace-nowrap text-brand-dark',
                    texto.length <= 11 ? 'text-3xl md:text-4xl' : 'text-2xl md:text-3xl'
                )}>
                    {texto}
                </div>
            )}
            <div className="mt-1.5 text-xs md:text-sm text-muted-foreground font-semibold">{sub}</div>
            {historico?.sparkline && historico.sparkline.length >= 2 && (
                <Tendencia data={historico.sparkline} tono={tono} />
            )}
        </div>
    );
};
const MontoCard = React.memo(MontoCardImpl);

// ────────────────────────────────────────────────────────
// Barra horizontal de un ranking (obras / vehículos)
// ────────────────────────────────────────────────────────
interface BarraFilaProps {
    nombre: string;
    extra?: string;
    monto: number;
    max: number;
    color: string;
    onClick?: () => void;
    title?: string;
}

const BarraFila: React.FC<BarraFilaProps> = ({ nombre, extra, monto, max, color, onClick, title }) => {
    const pct = max > 0 ? Math.max(2, (monto / max) * 100) : 0;
    // Grilla: en celular nombre | monto arriba y la barra abajo a lo ancho (como el mockup);
    // desde sm, nombre | barra | monto en una línea. (Antes era flex-col con la barra
    // `flex-1` → en columna su alto quedaba en 0 y la barra no se veía en celular.)
    const cuerpo = (
        <>
            <div className="min-w-0 order-1">
                <div className="text-sm font-bold text-brand-dark break-words sm:truncate">{nombre}</div>
                {extra && <div className="text-caption text-muted-foreground font-semibold truncate">{extra}</div>}
            </div>
            <div className="order-2 sm:order-3 text-sm font-black text-brand-dark tabular-nums text-right whitespace-nowrap">
                {fmtMoney(monto)}
            </div>
            <div className="order-3 sm:order-2 col-span-2 sm:col-span-1 h-3 sm:h-6 rounded-lg bg-muted overflow-hidden">
                <div className="h-full rounded-lg transition-all" style={{ width: `${pct}%`, background: color }} />
            </div>
        </>
    );
    const grilla = 'grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[12rem_minmax(0,1fr)_9rem] items-center gap-x-4 gap-y-1.5 py-1.5';
    if (!onClick) {
        return <div title={title} className={grilla}>{cuerpo}</div>;
    }
    return (
        // eslint-disable-next-line no-restricted-syntax -- fila de ranking clickeable (barra + monto)
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={`${grilla} px-2 -mx-2 rounded-xl hover:bg-muted/60 transition-colors text-left w-[calc(100%+1rem)]`}
        >
            {cuerpo}
        </button>
    );
};

// ────────────────────────────────────────────────────────
// Fila de decisión pendiente (la acción vive en la misma fila)
// ────────────────────────────────────────────────────────
type TonoDecision = 'green' | 'amber' | 'red' | 'blue' | 'orange';
const TONO_DECISION: Record<TonoDecision, string> = {
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
    red: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300',
    orange: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300',
};

interface DecisionFilaProps {
    tono: TonoDecision;
    icon: React.ReactNode;
    titulo: string;
    detalle?: string;
    boton: string;
    onClick: () => void;
    children?: React.ReactNode;
}

const DecisionFila: React.FC<DecisionFilaProps> = ({ tono, icon, titulo, detalle, boton, onClick, children }) => (
    <div className="py-3 border-t border-border first:border-t-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className={cn('shrink-0 p-2.5 rounded-xl', TONO_DECISION[tono])}>{icon}</div>
            <div className="flex-1 min-w-0 basis-40">
                <div className="text-sm md:text-base font-bold text-brand-dark">{titulo}</div>
                {detalle && <div className="text-xs text-muted-foreground mt-0.5">{detalle}</div>}
            </div>
            <Button type="button" variant="primary" size="sm" onClick={onClick} className="ml-auto shrink-0">
                {boton}
            </Button>
        </div>
        {children}
    </div>
);


const diasTxt = (d: number) => (d === 0 ? 'hoy' : d === 1 ? '1 día' : `${d} días`);

// ────────────────────────────────────────────────────────
// Detalle en pestañas
// ────────────────────────────────────────────────────────
type TabDetalle = 'obras' | 'categorias' | 'vehiculos';

const DetalleTabs: React.FC<{
    data: DashboardEjecutivoData;
    filtrado: boolean;
    onNavigateObra: (id: number) => void;
}> = ({ data, filtrado, onNavigateObra }) => {
    const navigate = useNavigate();
    const disponibles = useMemo(() => {
        const t: { id: TabDetalle; label: string }[] = [];
        if (!filtrado && data.top_obras.length > 0) t.push({ id: 'obras', label: 'Obras' });
        if (data.valor_por_categoria.some(c => c.valor > 0)) t.push({ id: 'categorias', label: 'Categorías' });
        if (!filtrado && (data.inversion_vehiculos?.length ?? 0) > 0) t.push({ id: 'vehiculos', label: 'Vehículos' });
        return t;
    }, [data, filtrado]);
    const [tab, setTab] = useState<TabDetalle>('obras');
    const activa = disponibles.find(t => t.id === tab) ? tab : disponibles[0]?.id;
    if (!activa) return null;

    const cats = data.valor_por_categoria.filter(c => c.valor > 0).sort((a, b) => b.valor - a.valor);
    const totalCats = cats.reduce((s, c) => s + c.valor, 0);
    // Tramos de la dona: inicio/fin acumulados de cada categoría (en %).
    const finales = cats.map((_, i) => cats.slice(0, i + 1).reduce((s, c) => s + c.valor, 0));
    const dona = `conic-gradient(${cats.map((c, i) => {
        const desde = ((finales[i] - c.valor) / totalCats) * 100;
        const hasta = (finales[i] / totalCats) * 100;
        return `${PALETA[i % PALETA.length]} ${desde.toFixed(2)}% ${hasta.toFixed(2)}%`;
    }).join(', ')})`;

    const vehs = [...(data.inversion_vehiculos || [])].sort((a, b) => b.valor - a.valor);
    const topVehs = vehs.slice(0, 6);
    const empresasVeh = [...new Map(vehs.map(v => [v.empresa, v.color])).entries()];

    return (
        <div className="bg-card border border-border rounded-2xl p-4 md:p-5 shrink-0 flex flex-col gap-4">
            <div role="tablist" aria-label="Detalle" className="self-start flex gap-1 p-1 rounded-xl bg-muted">
                {disponibles.map(t => (
                    // eslint-disable-next-line no-restricted-syntax -- pestaña segmentada
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={activa === t.id}
                        onClick={() => setTab(t.id)}
                        className={cn(
                            'min-h-[40px] px-4 rounded-lg text-sm transition-colors',
                            activa === t.id
                                ? 'bg-card text-brand-dark font-bold shadow-sm'
                                : 'text-muted-foreground font-semibold hover:text-brand-dark'
                        )}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {activa === 'obras' && (
                <>
                    <p className="text-xs text-muted-foreground -mt-1">
                        Arriendo mensual por obra, ya con descuentos · toca una obra para ver su inventario
                    </p>
                    <div className="flex flex-col gap-1">
                        {(() => {
                            const max = data.top_obras.reduce((m, o) => Math.max(m, o.valor_mensual), 0);
                            return data.top_obras.map((o, i) => (
                                <BarraFila
                                    key={o.obra_id}
                                    nombre={o.nombre}
                                    extra={o.descuento_porcentaje > 0 ? `${o.descuento_porcentaje}% de descuento` : undefined}
                                    monto={o.valor_mensual}
                                    max={max}
                                    color={PALETA[i % PALETA.length]}
                                    onClick={() => onNavigateObra(o.obra_id)}
                                    title={`${o.nombre}\nArriendo mensual: ${fmtMoney(o.valor_mensual)}\nCosto (valor de compra): ${fmtMoney(o.valor_patrimonial)}`}
                                />
                            ));
                        })()}
                    </div>
                </>
            )}

            {activa === 'categorias' && (
                <>
                    <p className="text-xs text-muted-foreground -mt-1">Arriendo mensual por categoría, ya con descuentos</p>
                    <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-10">
                        <div
                            role="img"
                            aria-label="Gráfico de dona: arriendo mensual por categoría"
                            className="shrink-0 w-48 h-48 rounded-full flex items-center justify-center"
                            style={{ background: dona }}
                        >
                            <div className="w-28 h-28 rounded-full bg-card flex flex-col items-center justify-center text-center px-2">
                                <span className="text-caption text-muted-foreground font-semibold">Al mes</span>
                                <span className="text-xs font-black text-brand-dark tabular-nums">{fmtMoney(totalCats)}</span>
                            </div>
                        </div>
                        <div className="flex-1 min-w-0 w-full flex flex-col gap-2.5">
                            {cats.map((c, i) => (
                                <div key={c.categoria_id} className="flex items-center gap-2.5 text-sm">
                                    <span className="shrink-0 w-3.5 h-3.5 rounded" style={{ background: PALETA[i % PALETA.length] }} />
                                    <span className="flex-1 min-w-0 font-bold text-brand-dark truncate">{c.nombre}</span>
                                    <span className="shrink-0 w-10 text-right text-muted-foreground font-semibold tabular-nums">
                                        {totalCats > 0 ? Math.round((c.valor / totalCats) * 100) : 0}%
                                    </span>
                                    <span className="shrink-0 sm:w-36 text-right font-black text-brand-dark tabular-nums whitespace-nowrap">
                                        {fmtMoney(c.valor)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {activa === 'vehiculos' && (
                <>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 -mt-1 text-xs text-muted-foreground">
                        <span>Valor de compra por vehículo</span>
                        {empresasVeh.map(([emp, color]) => (
                            <span key={emp} className="inline-flex items-center gap-1.5 font-semibold">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                                {emp}
                            </span>
                        ))}
                    </div>
                    <div className="flex flex-col gap-1">
                        {topVehs.map((v, i) => (
                            <BarraFila
                                key={`${v.label}-${i}`}
                                nombre={v.label}
                                extra={`${v.tipo || 'vehículo'} · ${v.empresa}`}
                                monto={v.valor}
                                max={topVehs[0]?.valor || 0}
                                color={v.color}
                            />
                        ))}
                    </div>
                    {vehs.length > topVehs.length && (
                        <p className="text-xs text-muted-foreground">Mostrando los {topVehs.length} de mayor valor de {vehs.length}.</p>
                    )}
                    {/* eslint-disable-next-line no-restricted-syntax -- enlace de texto a otro módulo */}
                    <button
                        type="button"
                        onClick={() => navigate('/vehiculos')}
                        className="self-start inline-flex items-center gap-1.5 min-h-[44px] text-sm font-bold text-green-700 dark:text-green-300 hover:underline"
                    >
                        Ir a Vehículos <ArrowRight className="h-4 w-4" />
                    </button>
                </>
            )}
        </div>
    );
};

// ────────────────────────────────────────────────────────
// Panel principal
// ────────────────────────────────────────────────────────
const ResumenEjecutivoPanel: React.FC<Props> = ({ onNavigateTransferencias, onNavigateObra, bodegaVirtualModo = 'ocultar' }) => {
    // Permiso financiero: sin él el backend ya sanitiza los montos; aquí se
    // ocultan las secciones $ completas para no mostrar "$0" sin contexto.
    const { hasPermission } = useAuth();
    const verValoresResumen = hasPermission('inventario.resumen.ver_valores');

    const [obraFilter, setObraFilter] = useState<number | null>(null);
    const [obras, setObras] = useState<ObraOpcion[]>([]);
    const { data, loading, error, refetch } = useDashboardEjecutivo(obraFilter, bodegaVirtualModo);

    // Acciones en el lugar sobre solicitudes estancadas
    const canAprobar = hasPermission('inventario.transferencias.aprobar');
    const canCancelar = hasPermission('inventario.transferencias.cancelar');
    const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

    const handleProrrogar = async (id: number) => {
        setActionLoadingId(id);
        try {
            await api.put(`/transferencias/${id}/prorrogar`);
            toast.success('Plazo extendido 10 días');
            refetch();
        } catch (err) {
            showApiError(err, 'Error al extender el plazo');
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleCancelarSolicitud = (id: number, codigo: string) => {
        showConfirmToast({
            message: `¿Cancelar la solicitud ${codigo}? No se puede deshacer.`,
            confirmLabel: 'Sí, cancelar',
            cancelLabel: 'No',
            onConfirm: async () => {
                setActionLoadingId(id);
                try {
                    await api.put(`/transferencias/${id}/cancelar`);
                    toast.success('Solicitud cancelada');
                    refetch();
                } catch (err) {
                    showApiError(err, 'Error al cancelar');
                } finally {
                    setActionLoadingId(null);
                }
            },
        });
    };

    useEffect(() => {
        api.get('/obras?participa_inventario=1')
            .then(res => setObras(((res.data.data || []) as ObraOpcion[]).map(o => ({ id: o.id, nombre: o.nombre }))))
            .catch(() => setObras([]));
    }, []);

    const obraSeleccionada = obras.find(o => o.id === obraFilter);
    const kpis = data?.kpis;
    const filtrado = !!obraFilter;
    // Primera carga (sin datos aún): cada bloque dibuja su silueta; un solo aviso para el lector de pantalla.
    const cargandoInicio = loading && !data;

    // ── Decisiones: agrupadas por tipo, con su acción en la misma fila ──
    const alertas = data?.alertas ?? [];
    const masAntigua = (lista: DashboardAlerta[]) => lista.reduce((m, a) => Math.max(m, a.dias), 0);
    const estancadas = alertas.filter(a => a.tipo === 'pendiente' && a.estancada);
    const discrepancias = alertas.filter(a => a.tipo === 'discrepancia');
    const transito = alertas.filter(a => a.tipo === 'transito');
    const rechazos = alertas.filter(a => a.tipo === 'rechazo');
    const faltantes = alertas.filter(a => a.tipo === 'faltante');
    const nPendientes = kpis?.transferencias_pendientes ?? alertas.filter(a => a.tipo === 'pendiente').length;
    const nDiscrepancias = kpis?.discrepancias_pendientes?.transferencias_afectadas || discrepancias.length;
    const nTransito = kpis?.estancados_transito || transito.length;
    const hayDecisiones = nPendientes > 0 || estancadas.length > 0 || nDiscrepancias > 0 || nTransito > 0 || rechazos.length > 0 || faltantes.length > 0;
    const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

    const valorInv = kpis?.valor_inventario ?? 0;
    const valorVeh = kpis?.valor_vehiculos ?? 0;
    const totalPat = valorInv + valorVeh;
    const pctInv = totalPat > 0 ? (valorInv / totalPat) * 100 : 0;

    return (
        <div className="flex flex-col gap-5 flex-1 min-h-0 overflow-y-auto -mr-2 pr-2">
            {cargandoInicio && <span role="status" className="sr-only">Cargando el resumen…</span>}
            {/* Encabezado + único filtro de obra */}
            <div className="flex flex-wrap items-center justify-between shrink-0 gap-3">
                <div className="min-w-0">
                    <h2 className="text-lg md:text-xl font-black text-brand-dark">Resumen Ejecutivo</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Lo importante del inventario, de un vistazo.</p>
                </div>
                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <select
                        value={obraFilter ?? ''}
                        onChange={e => setObraFilter(e.target.value ? Number(e.target.value) : null)}
                        className={cn(
                            'min-h-[40px] pl-8 pr-3 text-sm font-bold rounded-xl cursor-pointer appearance-none border',
                            'focus:outline-none focus:ring-2 focus:ring-brand-primary/30',
                            obraFilter
                                ? 'bg-brand-primary/10 border-brand-primary/30 text-green-700 dark:text-green-300'
                                : 'bg-card border-border text-brand-dark'
                        )}
                        aria-label="Filtrar por obra"
                    >
                        <option value="">Todas las obras</option>
                        {obras.map(o => (
                            <option key={o.id} value={o.id}>{o.nombre}</option>
                        ))}
                    </select>
                </div>
            </div>

            <FormError message={error} />

            {filtrado && obraSeleccionada && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-primary/5 border border-brand-primary/20 text-xs">
                    <Filter className="h-3.5 w-3.5 text-brand-primary shrink-0" />
                    <span className="font-bold text-green-700 dark:text-green-300 truncate">
                        Viendo solo: {obraSeleccionada.nombre}
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setObraFilter(null)} className="ml-auto">
                        Quitar filtro
                    </Button>
                </div>
            )}

            {/* 1 · Montos */}
            {verValoresResumen && (cargandoInicio || kpis) && (
                    <div className={cn('grid grid-cols-1 gap-3 md:gap-4 shrink-0', filtrado ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
                        <MontoCard
                            tono="green"
                            icon={<Wallet className="h-5 w-5" />}
                            label="Arriendo mensual"
                            value={kpis?.valor_total_obras ?? 0}
                            cargando={cargandoInicio}
                            sub="lo que facturan las obras al mes"
                            tooltip="Arriendo mensual de todos los ítems asignados a obras activas, ya con los descuentos de cada obra."
                            historico={filtrado ? undefined : data?.historico?.valor_obras}
                        />
                        <MontoCard
                            tono="blue"
                            icon={<Landmark className="h-5 w-5" />}
                            label="Inventario"
                            value={kpis?.valor_inventario ?? 0}
                            cargando={cargandoInicio}
                            sub={filtrado ? 'valor de compra en esta obra' : 'valor de compra, obras y bodegas'}
                            tooltip="Lo invertido en compra del inventario: cantidad × valor de compra de todos los ítems en obras y bodegas. No incluye vehículos."
                        />
                        {!filtrado && (
                            <MontoCard
                                tono="amber"
                                icon={<Truck className="h-5 w-5" />}
                                label="Vehículos"
                                value={kpis?.valor_vehiculos ?? 0}
                            cargando={cargandoInicio}
                                sub="valor de compra de la flota"
                                tooltip="Lo invertido en compra de todos los vehículos activos."
                            />
                        )}
                    </div>
            )}

            {/* 2 · Patrimonio total en una barra */}
            {verValoresResumen && !filtrado && cargandoInicio && (
                <div className="bg-card border border-border rounded-2xl p-4 md:p-5 shrink-0 flex flex-col gap-3" aria-hidden="true">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-sm font-black text-brand-dark uppercase tracking-wider">Patrimonio total</h3>
                        <Skeleton className="h-6 w-40" />
                    </div>
                    <Skeleton className="h-5 w-full rounded-full" />
                    <Skeleton className="h-3.5 w-64 max-w-full" />
                </div>
            )}
            {verValoresResumen && !filtrado && kpis && totalPat > 0 && (
                <div className="bg-card border border-border rounded-2xl p-4 md:p-5 shrink-0 flex flex-col gap-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-sm font-black text-brand-dark uppercase tracking-wider">Patrimonio total</h3>
                        <span className="text-xl md:text-2xl font-black text-brand-dark tabular-nums">{fmtMoney(totalPat)}</span>
                    </div>
                    <div
                        className="flex h-5 rounded-full overflow-hidden gap-0.5"
                        role="img"
                        aria-label={`Inventario ${Math.round(pctInv)}%, vehículos ${100 - Math.round(pctInv)}%`}
                    >
                        <div className="h-full" style={{ width: `${pctInv}%`, background: TONO.blue.stroke }} />
                        <div className="h-full" style={{ width: `${100 - pctInv}%`, background: TONO.amber.stroke }} />
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                        <span className="inline-flex items-center gap-2">
                            <span className="w-3 h-3 rounded" style={{ background: TONO.blue.stroke }} />
                            <b className="text-brand-dark">Inventario</b>
                            <span className="text-muted-foreground">{Math.round(pctInv)}% · {fmtMoney(valorInv)}</span>
                        </span>
                        <span className="inline-flex items-center gap-2">
                            <span className="w-3 h-3 rounded" style={{ background: TONO.amber.stroke }} />
                            <b className="text-brand-dark">Vehículos</b>
                            <span className="text-muted-foreground">{100 - Math.round(pctInv)}% · {fmtMoney(valorVeh)}</span>
                        </span>
                    </div>
                </div>
            )}

            {/* 3 · Detalle con gráficos */}
            {verValoresResumen && cargandoInicio && (
                <div className="bg-card border border-border rounded-2xl p-4 md:p-5 shrink-0 flex flex-col gap-4" aria-hidden="true">
                    <Skeleton className="h-10 w-72 max-w-full rounded-xl" />
                    {[0, 1, 2, 3].map(i => (
                        <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[12rem_minmax(0,1fr)_9rem] items-center gap-x-4 gap-y-1.5">
                            <Skeleton className={i % 2 ? 'h-3.5 w-24' : 'h-3.5 w-32'} />
                            <Skeleton className="sm:order-3 h-3.5 w-24 justify-self-end" />
                            <Skeleton className="sm:order-2 col-span-2 sm:col-span-1 h-3 sm:h-6 rounded-lg" />
                        </div>
                    ))}
                </div>
            )}
            {verValoresResumen && data && (
                <DetalleTabs data={data} filtrado={filtrado} onNavigateObra={onNavigateObra} />
            )}

            {/* 4 · Decisiones pendientes (al final, con la acción en la fila) */}
            <div className="bg-card border border-border rounded-2xl p-4 md:p-5 shrink-0">
                <h3 className="text-sm font-black text-brand-dark uppercase tracking-wider mb-1 flex items-center gap-2">
                    {hayDecisiones && <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />}
                    Decisiones pendientes
                </h3>
                {cargandoInicio ? (
                    <div className="flex flex-col mt-2" aria-hidden="true">
                        {[0, 1, 2].map(i => (
                            <div key={i} className="flex items-center gap-3 py-3 border-t border-border first:border-t-0">
                                <Skeleton className="shrink-0 h-10 w-10 rounded-xl" />
                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <Skeleton className={i === 1 ? 'h-3.5 w-1/2' : 'h-3.5 w-2/3'} />
                                    <Skeleton className="h-3 w-1/3" />
                                </div>
                                <Skeleton className="shrink-0 h-9 w-24 rounded-lg" />
                            </div>
                        ))}
                    </div>
                ) : !hayDecisiones ? (
                    <div className="flex items-center gap-3 py-3">
                        <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-300 shrink-0" />
                        <p className="text-sm font-semibold text-brand-dark">Todo al día — no hay nada esperando una decisión.</p>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {nPendientes > 0 && (
                            <DecisionFila
                                tono="green"
                                icon={<FileClock className="h-5 w-5" />}
                                titulo={`${nPendientes} ${plural(nPendientes, 'solicitud espera', 'solicitudes esperan')} aprobación`}
                                detalle={(() => {
                                    const d = masAntigua(alertas.filter(a => a.tipo === 'pendiente'));
                                    return d > 0 ? `La más antigua lleva ${diasTxt(d)}` : undefined;
                                })()}
                                boton="Revisar"
                                onClick={() => onNavigateTransferencias({ estado: 'pendiente' })}
                            />
                        )}
                        {estancadas.length > 0 && (
                            <DecisionFila
                                tono="amber"
                                icon={<Timer className="h-5 w-5" />}
                                titulo={`${estancadas.length} ${plural(estancadas.length, 'solicitud lleva', 'solicitudes llevan')} más de 10 días`}
                                detalle="Dales 10 días más, cancélalas o revísalas"
                                boton="Ver todas"
                                onClick={() => onNavigateTransferencias({ estado: 'pendiente' })}
                            >
                                <div className="mt-2 ml-0 md:ml-14 flex flex-col gap-1.5">
                                    {estancadas.map(a => (
                                        <div key={a.transferencia_id} className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-muted/60">
                                            {/* eslint-disable-next-line no-restricted-syntax -- código clickeable que abre la solicitud */}
                                            <button
                                                type="button"
                                                onClick={() => onNavigateTransferencias({ estado: 'pendiente', transferenciaId: a.transferencia_id })}
                                                className="min-w-0 flex-1 basis-40 text-left"
                                            >
                                                <span className="text-sm font-bold text-brand-dark">{a.codigo}</span>
                                                <span className="text-xs text-muted-foreground"> · {diasTxt(a.dias)}{a.solicitante ? ` · ${a.solicitante}` : ''}</span>
                                            </button>
                                            {/* Los dos botones viajan juntos: en celular bajan en UNA fila, no uno por línea. */}
                                            {(canAprobar || canCancelar) && (
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {canAprobar && (
                                                        <Button type="button" variant="secondary" size="sm" disabled={actionLoadingId === a.transferencia_id}
                                                            onClick={() => handleProrrogar(a.transferencia_id)} leftIcon={<Timer className="h-3 w-3" />}>
                                                            Extender 10 días
                                                        </Button>
                                                    )}
                                                    {canCancelar && (
                                                        <Button type="button" variant="destructive" size="sm" disabled={actionLoadingId === a.transferencia_id}
                                                            onClick={() => handleCancelarSolicitud(a.transferencia_id, a.codigo)} leftIcon={<XCircle className="h-3 w-3" />}>
                                                            Cancelar
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </DecisionFila>
                        )}
                        {nDiscrepancias > 0 && (
                            <DecisionFila
                                tono="red"
                                icon={<AlertTriangle className="h-5 w-5" />}
                                titulo={`${nDiscrepancias} ${plural(nDiscrepancias, 'diferencia', 'diferencias')} sin resolver`}
                                detalle={discrepancias[0] ? `${discrepancias[0].codigo} · ${discrepancias[0].detalle}` : undefined}
                                boton="Resolver"
                                onClick={() => onNavigateTransferencias({ estado: 'discrepancias', transferenciaId: discrepancias[0]?.transferencia_id })}
                            />
                        )}
                        {nTransito > 0 && (
                            <DecisionFila
                                tono="blue"
                                icon={<Truck className="h-5 w-5" />}
                                titulo={`${nTransito} ${plural(nTransito, 'envío lleva', 'envíos llevan')} días en tránsito sin recibir`}
                                detalle={transito[0] ? `${transito[0].codigo} · ${transito[0].detalle}` : undefined}
                                boton="Ver"
                                onClick={() => onNavigateTransferencias({ estado: 'en_transito', transferenciaId: transito[0]?.transferencia_id })}
                            />
                        )}
                        {faltantes.length > 0 && (
                            <DecisionFila
                                tono="orange"
                                icon={<Package className="h-5 w-5" />}
                                titulo={`${faltantes.length} ${plural(faltantes.length, 'faltante espera', 'faltantes esperan')} tu decisión`}
                                detalle={`${faltantes[0].codigo} · ${faltantes[0].detalle}`}
                                boton="Decidir"
                                onClick={() => onNavigateTransferencias({ estado: 'aprobada', transferenciaId: faltantes[0].transferencia_id })}
                            />
                        )}
                        {rechazos.length > 0 && (
                            <DecisionFila
                                tono="red"
                                icon={<XCircle className="h-5 w-5" />}
                                titulo={`${rechazos.length} ${plural(rechazos.length, 'solicitud rechazada', 'solicitudes rechazadas')} esta semana`}
                                detalle={`${rechazos[0].codigo} · ${rechazos[0].detalle}`}
                                boton="Ver"
                                onClick={() => onNavigateTransferencias({ estado: 'rechazada', transferenciaId: rechazos[0].transferencia_id })}
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Sin permiso de valores: guía mínima para no dejar la pantalla vacía */}
            {!verValoresResumen && !loading && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <ChevronRight className="h-3.5 w-3.5" />
                    Los montos del inventario solo los ve quien tiene el permiso de valores.
                </p>
            )}
        </div>
    );
};

export default ResumenEjecutivoPanel;
