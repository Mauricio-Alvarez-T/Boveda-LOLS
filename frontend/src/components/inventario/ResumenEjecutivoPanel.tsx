import React, { useState, useEffect } from 'react';
import {
    FileClock,
    AlertTriangle,
    Truck,
    Wallet,
    Landmark,
    RefreshCw,
    ChevronRight,
    Package,
    CheckCircle2,
    User,
    Timer,
    XCircle,
    Droplets,
    Filter,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { cn } from '../../utils/cn';
import api from '../../services/api';
import { useDashboardEjecutivo, type DashboardAlerta, type TopObra, type DashboardRechazo, type KpiHistorico } from '../../hooks/inventario/useDashboardEjecutivo';
import { useAuth } from '../../context/AuthContext';
import { FormError } from '../ui/FormError';
import { Button } from '../ui/Button';

interface ObraOpcion { id: number; nombre: string; }

interface Props {
    /** Navega al tab de transferencias filtrando por estado y, opcionalmente, abriendo una. */
    onNavigateTransferencias: (opts: { estado?: string; transferenciaId?: number }) => void;
    /** Navega al tab "Por Obra/Bodega" preseleccionando la obra indicada. */
    onNavigateObra: (obraId: number) => void;
}

const fmtCLP = (n: number) => {
    if (!n || n === 0) return '$0';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${Math.round(n).toLocaleString('es-CL')}`;
};

const fmtCLPFull = (n: number) => `$${Math.round(n || 0).toLocaleString('es-CL')}`;

// ────────────────────────────────────────────────────────
// Paleta de colores para categorías (barras horizontales)
// ────────────────────────────────────────────────────────
// paleta de data-viz (recharts requiere valores literales); colorMap ya usa la rampa accesible -700/-800
const CAT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// ────────────────────────────────────────────────────────
// Sparkline — mini gráfico SVG sin dependencias
// React.memo: el sparkline solo cambia cuando data o tone cambian.
// ────────────────────────────────────────────────────────
const SparklineImpl: React.FC<{ data: number[]; tone: 'amber' | 'red' | 'blue' | 'green' }> = ({ data, tone }) => {
    if (!data || data.length < 2) return null;
    const w = 80;
    const h = 22;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const step = w / (data.length - 1);
    const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(' ');
    // paleta de data-viz (recharts requiere valores literales); colorMap ya usa la rampa accesible -700/-800
    const colorMap = { amber: '#b45309', red: '#b91c1c', blue: '#1d4ed8', green: '#047857' };
    return (
        <svg width={w} height={h} className="shrink-0" aria-hidden="true">
            <polyline
                fill="none"
                stroke={colorMap[tone]}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
                opacity="0.75"
            />
        </svg>
    );
};
const Sparkline = React.memo(SparklineImpl);

// ────────────────────────────────────────────────────────
// Chip comparativa vs mes anterior
// React.memo: solo cambia cuando delta_pct o invertColor cambian.
// ────────────────────────────────────────────────────────
const ComparativaChipImpl: React.FC<{ delta_pct: number | null; invertColor?: boolean }> = ({ delta_pct, invertColor }) => {
    if (delta_pct === null || delta_pct === undefined) return null;
    // invertColor: para KPIs donde subir es malo (pendientes, estancados, etc.)
    const isUp = delta_pct > 0;
    const isFlat = delta_pct === 0;
    const good = invertColor ? !isUp : isUp;
    const toneClass = isFlat
        ? 'bg-muted/60 text-muted-foreground'
        : good
            ? 'bg-emerald-200/60 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
            : 'bg-red-200/60 text-red-800 dark:bg-red-500/20 dark:text-red-300';
    const arrow = isFlat ? '→' : isUp ? '↑' : '↓';
    return (
        <span
            className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-caption font-black', toneClass)}
            title={`Variación vs hace 30 días: ${delta_pct > 0 ? '+' : ''}${delta_pct}%`}
        >
            {arrow} {Math.abs(delta_pct)}%
        </span>
    );
};
const ComparativaChip = React.memo(ComparativaChipImpl);

// ────────────────────────────────────────────────────────
// KPI card grande, clickeable, área completa como botón
// React.memo aplicado al final (después de la definición).
// ────────────────────────────────────────────────────────
interface KpiCardProps {
    tone: 'amber' | 'red' | 'blue' | 'green';
    icon: React.ReactNode;
    label: string;
    value: string;
    subline?: string | null;
    onClick?: () => void;
    disabled?: boolean;
    tooltip?: string;
    historico?: KpiHistorico;
    /** true cuando subir = malo (pendientes, estancados, discrepancias, en_transito). Default false (valor_obras sube = bueno). */
    invertDelta?: boolean;
}

const KpiCardImpl: React.FC<KpiCardProps> = ({ tone, icon, label, value, subline, onClick, disabled, tooltip, historico, invertDelta }) => {
    const toneClasses: Record<KpiCardProps['tone'], string> = {
        amber:  'bg-amber-50  border-amber-200  hover:border-amber-400  text-amber-900 dark:bg-amber-950/40 dark:border-amber-900 dark:hover:border-amber-700 dark:text-amber-200',
        red:    'bg-red-50    border-red-200    hover:border-red-400    text-red-900 dark:bg-red-950/40 dark:border-red-900 dark:hover:border-red-700 dark:text-red-200',
        blue:   'bg-blue-50   border-blue-200   hover:border-blue-400   text-blue-900 dark:bg-blue-950/40 dark:border-blue-900 dark:hover:border-blue-700 dark:text-blue-200',
        green:  'bg-emerald-50 border-emerald-200 hover:border-emerald-400 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-900 dark:hover:border-emerald-700 dark:text-emerald-200',
    };
    const iconClasses: Record<KpiCardProps['tone'], string> = {
        amber:  'bg-amber-200/60  text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
        red:    'bg-red-200/60    text-red-700 dark:bg-red-500/20 dark:text-red-300',
        blue:   'bg-blue-200/60   text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
        green:  'bg-emerald-200/60 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    };

    // card clickable: la KPI completa actúa como botón (elemento dinámico, no <button> JSX)
    const Wrapper: any = onClick && !disabled ? 'button' : 'div';
    return (
        <Wrapper
            type={onClick && !disabled ? 'button' : undefined}
            onClick={onClick && !disabled ? onClick : undefined}
            title={tooltip}
            aria-label={onClick && !disabled ? `${label}: ${value}. Click para ver detalle.` : undefined}
            className={cn(
                'relative flex flex-col gap-3 p-5 md:p-6 rounded-2xl border-2 transition-all text-left w-full',
                toneClasses[tone],
                onClick && !disabled && 'cursor-pointer hover:shadow-lg active:scale-[0.99]',
                !onClick && tooltip && 'cursor-help',
                disabled && 'opacity-60'
            )}
        >
            <div className="flex items-center gap-3">
                <div className={cn('p-2.5 rounded-xl', iconClasses[tone])}>
                    {icon}
                </div>
                <span className="text-label md:text-xs font-black uppercase tracking-wider">
                    {label}
                </span>
            </div>
            <div className="flex items-end justify-between gap-2">
                <div className="text-4xl md:text-5xl font-black leading-none">
                    {value}
                </div>
                {historico?.sparkline && historico.sparkline.length >= 2 && (
                    <Sparkline data={historico.sparkline} tone={tone} />
                )}
            </div>
            <div className="flex items-center justify-between gap-2 min-h-[18px]">
                {subline && (
                    <div className="text-xs md:text-sm font-semibold opacity-80 truncate">
                        {subline}
                    </div>
                )}
                {historico && historico.delta_pct !== null && (
                    <ComparativaChip delta_pct={historico.delta_pct} invertColor={invertDelta} />
                )}
            </div>
            {onClick && !disabled && (
                <ChevronRight className="absolute top-4 right-4 h-5 w-5 opacity-40" />
            )}
        </Wrapper>
    );
};
const KpiCard = React.memo(KpiCardImpl);

// ────────────────────────────────────────────────────────
// Fila de ranking de obras (memoizada)
// ────────────────────────────────────────────────────────
interface ObraRankingItemProps {
    pos: number;
    obra: TopObra;
    maxValor: number;
    onClick: () => void;
}

const ObraRankingItemImpl: React.FC<ObraRankingItemProps> = ({ pos, obra, maxValor, onClick }) => {
    const pct = maxValor > 0 ? (obra.valor_mensual / maxValor) * 100 : 0;
    const tooltipLines = [
        `${obra.nombre}`,
        `Arriendo mensual neto: ${fmtCLPFull(obra.valor_mensual)}`,
        `Patrimonio (valor en activos): ${fmtCLPFull(obra.valor_patrimonial)}`,
    ];
    if (obra.descuento_porcentaje > 0) {
        tooltipLines.push(`Bruto sin descuento: ${fmtCLPFull(obra.valor_bruto)}`);
        tooltipLines.push(`Descuento aplicado: ${obra.descuento_porcentaje}%`);
        tooltipLines.push(`Ahorro: ${fmtCLPFull(obra.valor_bruto - obra.valor_mensual)}`);
    }
    tooltipLines.push('', 'Click para ver detalle de la obra.');
    return (
        // eslint-disable-next-line no-restricted-syntax -- card clickable (fila de ranking con barra de progreso)
        <button
            type="button"
            onClick={onClick}
            title={tooltipLines.join('\n')}
            aria-label={`${obra.nombre}: ${fmtCLPFull(obra.valor_mensual)} mensual. Click para ver detalle.`}
            className="group flex items-center gap-3 w-full p-3 rounded-xl hover:bg-muted transition-all text-left"
        >
            <span className="shrink-0 w-7 h-7 rounded-lg bg-brand-primary/10 text-green-700 dark:text-green-300 text-xs font-black flex items-center justify-center">
                {pos}
            </span>
            <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-bold text-brand-dark truncate">{obra.nombre}</span>
                    <span className="shrink-0 text-sm font-black text-brand-dark">
                        {fmtCLP(obra.valor_mensual)}
                    </span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                        className="h-full bg-brand-primary rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <div className="mt-1 text-caption text-muted-foreground font-semibold">
                    <Landmark className="inline h-3 w-3 mr-0.5 -mt-0.5" /> Patrimonio: {fmtCLP(obra.valor_patrimonial)}
                </div>
                {obra.descuento_porcentaje > 0 && (
                    <div className="mt-1 text-caption text-muted-foreground font-semibold">
                        {obra.descuento_porcentaje}% desc. aplicado · bruto {fmtCLP(obra.valor_bruto)}
                    </div>
                )}
            </div>
            <ChevronRight className="shrink-0 h-4 w-4 text-muted-foreground/40 group-hover:text-brand-primary transition-colors" />
        </button>
    );
};
const ObraRankingItem = React.memo(ObraRankingItemImpl);

// ────────────────────────────────────────────────────────
// Item de alerta (memoizado)
// ────────────────────────────────────────────────────────
interface AlertaItemProps {
    alerta: DashboardAlerta;
    onClick: () => void;
    /** Solo para pendientes estancadas: extender 10 días. */
    onProrrogar?: () => void;
    /** Solo para pendientes estancadas: cancelar la solicitud. */
    onCancelar?: () => void;
    /** Deshabilita las acciones mientras se procesa una. */
    actionLoading?: boolean;
}

const AlertaItemImpl: React.FC<AlertaItemProps> = ({ alerta, onClick, onProrrogar, onCancelar, actionLoading }) => {
    const isEstancada = alerta.tipo === 'pendiente' && !!alerta.estancada;
    const toneMap: Record<DashboardAlerta['tipo'], { bg: string; border: string; icon: React.ReactNode; iconBg: string; cta: string }> = {
        pendiente: {
            bg: 'bg-amber-50/60 dark:bg-amber-950/30',
            border: 'border-amber-200 dark:border-amber-900',
            icon: <FileClock className="h-4 w-4" />,
            iconBg: 'bg-amber-200/70 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
            cta: 'Aprobar',
        },
        discrepancia: {
            bg: 'bg-red-50/60 dark:bg-red-950/30',
            border: 'border-red-200 dark:border-red-900',
            icon: <AlertTriangle className="h-4 w-4" />,
            iconBg: 'bg-red-200/70 text-red-800 dark:bg-red-500/20 dark:text-red-300',
            cta: 'Revisar',
        },
        transito: {
            bg: 'bg-blue-50/60 dark:bg-blue-950/30',
            border: 'border-blue-200 dark:border-blue-900',
            icon: <Truck className="h-4 w-4" />,
            iconBg: 'bg-blue-200/70 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300',
            cta: 'Ver',
        },
        faltante: {
            bg: 'bg-orange-50/60 dark:bg-orange-950/30',
            border: 'border-orange-200 dark:border-orange-900',
            icon: <Package className="h-4 w-4" />,
            iconBg: 'bg-orange-200/70 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300',
            cta: 'Decidir',
        },
        rechazo: {
            bg: 'bg-red-50/60 dark:bg-red-950/30',
            border: 'border-red-200 dark:border-red-900',
            icon: <XCircle className="h-4 w-4" />,
            iconBg: 'bg-red-200/70 text-red-800 dark:bg-red-500/20 dark:text-red-300',
            cta: 'Ver',
        },
    };
    const t = toneMap[alerta.tipo];

    const diasLabel = alerta.dias === 0 ? 'hoy' : alerta.dias === 1 ? 'hace 1 día' : `hace ${alerta.dias} días`;
    // Las estancadas mantienen el rol ÁMBAR (precaución/pendiente) pero intensificado
    // para destacar que requieren decisión; el rojo se reserva para destructivo/error.
    const bg = isEstancada ? 'bg-amber-100/70 dark:bg-amber-950/40' : t.bg;
    const border = isEstancada ? 'border-amber-400 dark:border-amber-700' : t.border;
    const iconBg = isEstancada ? 'bg-amber-200/80 text-amber-800 dark:bg-amber-500/25 dark:text-amber-300' : t.iconBg;
    const showActions = isEstancada && (onProrrogar || onCancelar);

    return (
        <div
            className={cn(
                'rounded-xl border-2 transition-all',
                bg, border
            )}
        >
            {/* eslint-disable-next-line no-restricted-syntax -- card clickable (item de alerta con layout interno rico) */}
            <button
                type="button"
                onClick={onClick}
                aria-label={`${alerta.titulo}. ${alerta.detalle}. ${diasLabel}. Click para ver.`}
                className="flex items-center gap-3 w-full p-3.5 text-left hover:opacity-90 active:scale-[0.995] transition-all"
            >
                <div className={cn('shrink-0 p-2 rounded-lg', iconBg)}>
                    {isEstancada ? <Timer className="h-4 w-4" /> : t.icon}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-brand-dark truncate">
                        {alerta.titulo}
                        <span className="ml-2 text-label font-semibold text-muted-foreground">— {diasLabel}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {alerta.detalle}
                    </div>
                    {alerta.solicitante && (
                        <div className="flex items-center gap-1 text-label text-muted-foreground/80 mt-0.5 truncate">
                            <User className="h-3 w-3 shrink-0" />
                            <span className="font-semibold truncate">{alerta.solicitante}</span>
                        </div>
                    )}
                </div>
                <span className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-card/80 border border-current/10 text-xs font-bold">
                    {isEstancada ? 'Modificar' : t.cta}
                    <ChevronRight className="h-3.5 w-3.5" />
                </span>
            </button>

            {/* Acciones para solicitudes estancadas: extender plazo o cancelar */}
            {showActions && (
                <div className="flex items-center gap-2 px-3.5 pb-3 -mt-1">
                    {onProrrogar && (
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={onProrrogar}
                            disabled={actionLoading}
                            leftIcon={<Timer className="h-3 w-3" />}
                        >
                            Extender 10 días
                        </Button>
                    )}
                    {onCancelar && (
                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={onCancelar}
                            disabled={actionLoading}
                            leftIcon={<XCircle className="h-3 w-3" />}
                        >
                            Cancelar
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
};
const AlertaItem = React.memo(AlertaItemImpl);

// ────────────────────────────────────────────────────────
// Item de rechazo reciente
// ────────────────────────────────────────────────────────
interface RechazoItemProps {
    rechazo: DashboardRechazo;
    onClick: () => void;
}

const RechazoItem: React.FC<RechazoItemProps> = ({ rechazo, onClick }) => {
    const diasLabel = rechazo.dias === 0 ? 'hoy' : rechazo.dias === 1 ? 'hace 1 día' : `hace ${rechazo.dias} días`;
    return (
        // eslint-disable-next-line no-restricted-syntax -- card clickable (item de rechazo con layout interno rico)
        <button
            type="button"
            onClick={onClick}
            aria-label={`${rechazo.codigo} rechazado ${diasLabel}. Click para ver.`}
            className="flex items-start gap-3 w-full p-3.5 rounded-xl border-2 border-red-100 bg-red-50/40 transition-all text-left hover:border-red-300 hover:shadow-md active:scale-[0.995] dark:border-red-900 dark:bg-red-950/30 dark:hover:border-red-700"
        >
            <div className="shrink-0 p-2 rounded-lg bg-red-200/70 text-red-800 mt-0.5 dark:bg-red-500/20 dark:text-red-300">
                <XCircle className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-brand-dark truncate">
                    {rechazo.codigo}
                    <span className="ml-2 text-label font-semibold text-muted-foreground">— {diasLabel}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {rechazo.origen} → {rechazo.destino}
                </div>
                {rechazo.observaciones_rechazo && (
                    <div className="text-xs text-red-700 font-semibold mt-1 line-clamp-2 dark:text-red-300">
                        "{rechazo.observaciones_rechazo}"
                    </div>
                )}
                {rechazo.rechazado_por && (
                    <div className="flex items-center gap-1 text-label text-muted-foreground/80 mt-0.5">
                        <User className="h-3 w-3 shrink-0" />
                        <span className="font-semibold truncate">{rechazo.rechazado_por}</span>
                    </div>
                )}
            </div>
            <span className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-card/80 border border-current/10 text-xs font-bold text-red-700 dark:text-red-300">
                Ver
                <ChevronRight className="h-3.5 w-3.5" />
            </span>
        </button>
    );
};

// ────────────────────────────────────────────────────────
// Skeleton (mantiene layout para no saltar)
// ────────────────────────────────────────────────────────
const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
    <div className={cn('animate-pulse bg-muted rounded-xl', className)} />
);

// ────────────────────────────────────────────────────────
// Panel principal
// ────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────
// "Hace X min/seg" — label y color según antigüedad
// ────────────────────────────────────────────────────────
function formatRelativeTime(lastUpdated: number | null, now: number): { label: string; stale: boolean } {
    if (!lastUpdated) return { label: '', stale: false };
    const diffMs = now - lastUpdated;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 10) return { label: 'Actualizado ahora', stale: false };
    if (diffSec < 60) return { label: `Actualizado hace ${diffSec}s`, stale: false };
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return { label: `Actualizado hace ${diffMin} min`, stale: diffMin >= 5 };
    const diffHr = Math.floor(diffMin / 60);
    return { label: `Actualizado hace ${diffHr}h`, stale: true };
}

const ResumenEjecutivoPanel: React.FC<Props> = ({ onNavigateTransferencias, onNavigateObra }) => {
    // Permiso financiero para mostrar valores $ en el resumen ejecutivo.
    // El backend ya sanitiza (Sprint 1), por lo que sin permiso los campos
    // monetarios llegan undefined. Aquí escondemos los KPIs/secciones $
    // completos para evitar mostrar "$0" sin contexto.
    const { hasPermission } = useAuth();
    const verValoresResumen = hasPermission('inventario.resumen.ver_valores');
    const verCostosBombas = hasPermission('inventario.bombas.ver_costos');

    const [obraFilter, setObraFilter] = useState<number | null>(null);
    const [obras, setObras] = useState<ObraOpcion[]>([]);
    const { data, loading, error, refetch, lastUpdated } = useDashboardEjecutivo(obraFilter);
    const [now, setNow] = useState(() => Date.now());

    // Acciones sobre solicitudes estancadas (punto 55)
    const canAprobar = hasPermission('inventario.transferencias.aprobar');
    const canCancelar = hasPermission('inventario.transferencias.cancelar');
    const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

    const handleProrrogar = async (id: number) => {
        setActionLoadingId(id);
        try {
            await api.put(`/transferencias/${id}/prorrogar`);
            toast.success('Plazo extendido 10 días');
            refetch();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al extender el plazo');
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleCancelarSolicitud = async (id: number) => {
        if (!window.confirm('¿Cancelar esta solicitud estancada? Esta acción no se puede deshacer.')) return;
        setActionLoadingId(id);
        try {
            await api.put(`/transferencias/${id}/cancelar`);
            toast.success('Solicitud cancelada');
            refetch();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al cancelar');
        } finally {
            setActionLoadingId(null);
        }
    };

    // Cargar obras participantes una sola vez para el selector
    useEffect(() => {
        api.get('/obras?participa_inventario=1')
            .then(res => setObras((res.data.data || []).map((o: any) => ({ id: o.id, nombre: o.nombre }))))
            .catch(() => setObras([]));
    }, []);

    // Tick cada 30s para refrescar el label "hace X min"
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(id);
    }, []);

    const maxValor = data?.top_obras.reduce((m, o) => Math.max(m, o.valor_mensual), 0) || 0;
    const relTime = formatRelativeTime(lastUpdated, now);
    const obraSeleccionada = obras.find(o => o.id === obraFilter);

    return (
        <div className="flex flex-col gap-5 flex-1 min-h-0 overflow-y-auto -mr-2 pr-2">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0 gap-3">
                <div className="min-w-0">
                    <h2 className="text-lg md:text-xl font-black text-brand-dark">Resumen Ejecutivo</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Todo lo importante del inventario en un vistazo.
                    </p>
                </div>
                <div className="hidden md:flex items-center gap-2 shrink-0">
                    <div className="relative">
                        <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <select
                            value={obraFilter ?? ''}
                            onChange={e => setObraFilter(e.target.value ? Number(e.target.value) : null)}
                            className={cn(
                                'pl-8 pr-3 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer appearance-none',
                                'border focus:outline-none focus:ring-2 focus:ring-brand-primary/30',
                                obraFilter
                                    ? 'bg-brand-primary/10 border-brand-primary/30 text-green-700 dark:text-green-300'
                                    : 'bg-muted border-transparent hover:bg-muted text-brand-dark'
                            )}
                            aria-label="Filtrar por obra"
                            title={obraFilter ? `Filtrado por: ${obraSeleccionada?.nombre || ''}` : 'Ver todas las obras'}
                        >
                            <option value="">Todas las obras</option>
                            {obras.map(o => (
                                <option key={o.id} value={o.id}>{o.nombre}</option>
                            ))}
                        </select>
                    </div>
                    {relTime.label && (
                        <span
                            title={lastUpdated ? new Date(lastUpdated).toLocaleString('es-CL') : undefined}
                            className={cn(
                                'hidden md:inline text-label font-semibold cursor-help',
                                relTime.stale ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'
                            )}
                        >
                            {relTime.label}
                        </span>
                    )}
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={refetch}
                        disabled={loading}
                        aria-label="Actualizar datos"
                        leftIcon={<RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />}
                    >
                        Actualizar
                    </Button>
                </div>
            </div>

            <FormError message={error} />

            {obraFilter && obraSeleccionada && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-primary/5 border border-brand-primary/20 text-xs">
                    <Filter className="h-3.5 w-3.5 text-brand-primary shrink-0" />
                    <span className="font-bold text-green-700 dark:text-green-300 truncate">
                        Filtrando por obra: {obraSeleccionada.nombre}
                    </span>
                    <span className="text-muted-foreground hidden sm:inline">
                        · sparklines y comparativa mes desactivadas
                    </span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setObraFilter(null)}
                        className="ml-auto"
                    >
                        Quitar filtro
                    </Button>
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4 shrink-0">
                {loading && !data ? (
                    <>
                        <Skeleton className="h-[148px]" />
                        <Skeleton className="h-[148px]" />
                        <Skeleton className="h-[148px]" />
                        <Skeleton className="h-[148px]" />
                        <Skeleton className="h-[148px]" />
                        <Skeleton className="h-[148px]" />
                    </>
                ) : (
                    <>
                        <KpiCard
                            tone="amber"
                            icon={<FileClock className="h-5 w-5" />}
                            label="Por aprobar"
                            value={String(data?.kpis.transferencias_pendientes ?? 0)}
                            subline={(data?.kpis.transferencias_pendientes ?? 0) === 1 ? 'solicitud' : 'solicitudes'}
                            onClick={() => onNavigateTransferencias({ estado: 'pendiente' })}
                            disabled={(data?.kpis.transferencias_pendientes ?? 0) === 0}
                            tooltip="Solicitudes de transferencia esperando tu aprobación. Click para ir a la lista y aprobarlas."
                            historico={data?.historico?.pendientes}
                            invertDelta
                        />
                        <KpiCard
                            tone="red"
                            icon={<AlertTriangle className="h-5 w-5" />}
                            label="Diferencias"
                            value={String(data?.kpis.discrepancias_pendientes.transferencias_afectadas ?? 0)}
                            subline={
                                (data?.kpis.discrepancias_pendientes.unidades_totales ?? 0) > 0
                                    ? `${data!.kpis.discrepancias_pendientes.unidades_totales} u. afectadas`
                                    : 'sin pendientes'
                            }
                            onClick={() => onNavigateTransferencias({ estado: 'discrepancias' })}
                            disabled={(data?.kpis.discrepancias_pendientes.transferencias_afectadas ?? 0) === 0}
                            tooltip="Transferencias recibidas con cantidad distinta a la enviada (merma, sobrante o error). Requieren revisión para ajustar stock."
                            historico={data?.historico?.discrepancias}
                            invertDelta
                        />
                        <KpiCard
                            tone="blue"
                            icon={<Truck className="h-5 w-5" />}
                            label="En tránsito"
                            value={String(data?.kpis.transferencias_en_transito ?? 0)}
                            subline={(data?.kpis.transferencias_en_transito ?? 0) === 1 ? 'envío' : 'envíos'}
                            onClick={() => onNavigateTransferencias({ estado: 'en_transito' })}
                            disabled={(data?.kpis.transferencias_en_transito ?? 0) === 0}
                            tooltip="Transferencias ya aprobadas y despachadas, esperando confirmación de recepción en destino."
                            historico={data?.historico?.en_transito}
                        />
                        <KpiCard
                            tone="red"
                            icon={<Timer className="h-5 w-5" />}
                            label="Estancados +7d"
                            value={String(data?.kpis.estancados_transito ?? 0)}
                            subline={(data?.kpis.estancados_transito ?? 0) === 1 ? 'envío sin recibir' : 'envíos sin recibir'}
                            onClick={() => onNavigateTransferencias({ estado: 'en_transito' })}
                            disabled={(data?.kpis.estancados_transito ?? 0) === 0}
                            tooltip="Transferencias en tránsito que llevan más de 7 días sin ser recibidas. Require seguimiento urgente."
                            historico={data?.historico?.estancados}
                            invertDelta
                        />
                        {verValoresResumen && (
                            <KpiCard
                                tone="green"
                                icon={<Wallet className="h-5 w-5" />}
                                label="Valor obras"
                                value={fmtCLP(data?.kpis.valor_total_obras ?? 0)}
                                subline="arriendo mensual"
                                tooltip="Valor total mensual de arriendo de todos los items asignados a obras activas. Ya incluye los descuentos aplicados a cada obra."
                                historico={data?.historico?.valor_obras}
                            />
                        )}
                        {verValoresResumen && (
                            <KpiCard
                                tone="blue"
                                icon={<Landmark className="h-5 w-5" />}
                                label="Patrimonio"
                                value={fmtCLP(data?.kpis.valor_total_patrimonio ?? 0)}
                                subline="valor en activos"
                                tooltip="Valor patrimonial total: suma del valor de compra de todo el inventario asignado a obras activas (lo que las obras poseen en activos). No incluye vehículos."
                            />
                        )}
                    </>
                )}
            </div>

            {/* Patrimonio por empresa (Dedalius=inventario, LOLS/TRANSPORTE=vehículos).
                Solo en la vista "Todas las obras" (los vehículos son globales) y con
                permiso de valores. El total ya está en la tarjeta Patrimonio. */}
            {!obraFilter && verValoresResumen && (data?.patrimonio_por_empresa?.length ?? 0) > 0 && (
            <div className="bg-card border border-border rounded-2xl p-4 md:p-5 shrink-0">
                <h3 className="text-sm font-black text-brand-dark uppercase tracking-wider mb-3">
                    Patrimonio por empresa
                </h3>
                <div className="flex flex-col gap-3">
                    {(() => {
                        const lista = data!.patrimonio_por_empresa;
                        const maxPat = Math.max(1, ...lista.map(e => e.valor));
                        return lista.map(e => (
                            <div key={e.nombre}>
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="text-sm font-bold text-brand-dark flex items-center gap-2 min-w-0">
                                        <span className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ background: e.color }} />
                                        <span className="truncate">{e.nombre}</span>
                                        <span className="text-caption text-muted-foreground font-semibold shrink-0">· {e.tipo === 'inventario' ? 'inventario' : 'vehículos'}</span>
                                    </span>
                                    <span className="shrink-0 text-sm font-black text-brand-dark">{fmtCLP(e.valor)}</span>
                                </div>
                                <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden">
                                    <div className="h-full rounded-full transition-all" style={{ width: `${(e.valor / maxPat) * 100}%`, background: e.color }} />
                                </div>
                            </div>
                        ));
                    })()}
                </div>
            </div>
            )}

            {/* Inversión en vehículos: indicadores "cuánta plata por auto" — por tipo de
                vehículo + detalle (ranking) por auto. Solo LOLS y TRANSPORTE. Mismo gate. */}
            {!obraFilter && verValoresResumen && (
            <div className="bg-card border border-border rounded-2xl p-4 md:p-5 shrink-0">
                <h3 className="text-sm font-black text-brand-dark uppercase tracking-wider mb-3">
                    Inversión en vehículos
                </h3>
                {(data?.inversion_vehiculos?.length ?? 0) === 0 ? (
                    <div className="py-10 text-center text-muted-foreground">
                        <Truck className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm font-medium">Aún no hay vehículos con valor cargado.</p>
                        <p className="text-xs mt-1">Ve a Vehículos → editar un vehículo y completa "Valor del vehículo" para verlo.</p>
                    </div>
                ) : (() => {
                    const vehs = data!.inversion_vehiculos;
                    // Inversión ACUMULADA por empresa (para el área estilo "Tendencia de Asistencia").
                    const byEmp = new Map<string, { color: string; vals: number[] }>();
                    for (const v of vehs) {
                        if (!byEmp.has(v.empresa)) byEmp.set(v.empresa, { color: v.color, vals: [] });
                        byEmp.get(v.empresa)!.vals.push(v.valor);
                    }
                    for (const info of byEmp.values()) info.vals.sort((a, b) => b - a);
                    const empresasAcum = [...byEmp.entries()].map(([nombre, info]) => [nombre, info.color] as [string, string]);
                    const maxLen = Math.max(0, ...[...byEmp.values()].map(e => e.vals.length));
                    const run: Record<string, number> = {};
                    empresasAcum.forEach(([n]) => (run[n] = 0));
                    const chartData = Array.from({ length: maxLen }, (_, k) => {
                        const row: any = { step: k + 1 };
                        for (const [nombre, info] of byEmp) {
                            if (k < info.vals.length) { run[nombre] += info.vals[k]; row[nombre] = run[nombre]; }
                        }
                        return row;
                    });
                    // Inversión por TIPO de vehículo (total + cantidad + promedio).
                    const porTipo = Object.values(
                        vehs.reduce((acc: Record<string, { tipo: string; count: number; total: number }>, v) => {
                            const t = v.tipo || 'otro';
                            (acc[t] = acc[t] || { tipo: t, count: 0, total: 0 });
                            acc[t].count += 1; acc[t].total += v.valor;
                            return acc;
                        }, {})
                    ).sort((a, b) => b.total - a.total);
                    return (
                        <>
                            {/* Área acumulada (estilo "Tendencia de Asistencia") */}
                            <p className="text-caption uppercase font-black text-muted-foreground tracking-widest mb-2">Inversión acumulada</p>
                            <div className="h-[240px] w-full mb-5">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -4, bottom: 12 }}>
                                        <defs>
                                            {empresasAcum.map(([emp, color], i) => (
                                                <linearGradient key={emp} id={`gradVeh-${i}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                                                </linearGradient>
                                            ))}
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                        <XAxis dataKey="step" allowDecimals={false} axisLine={false} tickLine={false}
                                            tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                                            label={{ value: 'N° de vehículos acumulados', position: 'insideBottom', offset: -4, fill: 'var(--muted-foreground)', fontSize: 11 }} />
                                        <YAxis axisLine={false} tickLine={false} width={52}
                                            tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                                            tickFormatter={(v: number) => fmtCLP(v)} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '12px' }}
                                            labelStyle={{ color: 'var(--muted-foreground)', marginBottom: '4px' }}
                                            labelFormatter={(label: any) => `${label} vehículo(s)`}
                                            formatter={(value: any, name: any) => [fmtCLPFull(Number(value)), name]} />
                                        <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: '12px', paddingLeft: '12px' }} />
                                        {empresasAcum.map(([emp, color], i) => (
                                            <Area key={emp} type="monotone" dataKey={emp} name={emp}
                                                stroke={color} strokeWidth={3} fill={`url(#gradVeh-${i})`} fillOpacity={1}
                                                connectNulls dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} isAnimationActive={false} />
                                        ))}
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                            {/* Por tipo */}
                            <p className="text-caption uppercase font-black text-muted-foreground tracking-widest mb-2">Por tipo de vehículo</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
                                {porTipo.map(t => (
                                    <div key={t.tipo} className="rounded-xl border border-border p-3">
                                        <p className="text-sm font-bold text-brand-dark capitalize">{t.tipo}</p>
                                        <p className="text-base font-black text-brand-dark">{fmtCLPFull(t.total)}</p>
                                        <p className="text-caption text-muted-foreground">{t.count} auto{t.count !== 1 ? 's' : ''} · prom {fmtCLP(t.total / t.count)}</p>
                                    </div>
                                ))}
                            </div>
                            {/* Detalle por auto (ranking, ya viene ordenado de mayor a menor) */}
                            <p className="text-caption uppercase font-black text-muted-foreground tracking-widest mb-1">Detalle por auto</p>
                            <div className="divide-y divide-border">
                                {vehs.map((v, i) => (
                                    <div key={i} className="flex items-center gap-3 py-2.5">
                                        <span className="shrink-0 w-6 text-caption font-black text-muted-foreground text-right">{i + 1}</span>
                                        <span className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ background: v.color }} title={v.empresa} />
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm font-bold text-brand-dark">{v.label}</span>
                                            <span className="text-caption text-muted-foreground"> · {v.empresa}</span>
                                        </div>
                                        <span className="shrink-0 text-sm font-black text-brand-dark">{fmtCLPFull(v.valor)}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    );
                })()}
            </div>
            )}

            {/* Ranking de obras — oculto cuando hay filtro por obra o el
                usuario no tiene permiso para ver valores monetarios. La
                sección entera ranquea por $ — sin permiso $ no aporta. */}
            {!obraFilter && verValoresResumen && (
            <div className="bg-card border border-border rounded-2xl p-4 md:p-5 shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-black text-brand-dark uppercase tracking-wider">
                        Obras por valor (arriendo mensual)
                    </h3>
                </div>
                {loading && !data ? (
                    <div className="space-y-2">
                        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14" />)}
                    </div>
                ) : !data?.top_obras.length ? (
                    <div className="py-8 text-center">
                        <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No hay obras con inventario activo.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1">
                        {data.top_obras.map((obra, idx) => (
                            <ObraRankingItem
                                key={obra.obra_id}
                                pos={idx + 1}
                                obra={obra}
                                maxValor={maxValor}
                                onClick={() => onNavigateObra(obra.obra_id)}
                            />
                        ))}
                    </div>
                )}
            </div>
            )}

            {/* Valor por categoría — barras horizontales.
                Gate financiero: gateado por `inventario.resumen.ver_valores` porque
                muestra montos $ totales por categoría y un total general $. */}
            {verValoresResumen && (loading || ((data?.valor_por_categoria?.reduce((s, c) => s + c.valor, 0) ?? 0) > 0)) && (
                <div className="bg-card border border-border rounded-2xl p-4 md:p-5 shrink-0">
                    <div className="flex items-baseline justify-between mb-4">
                        <h3 className="text-sm font-black text-brand-dark uppercase tracking-wider">
                            Valor por categoría
                        </h3>
                        {data && (
                            <span className="text-label font-semibold text-muted-foreground">
                                Total: {fmtCLP(data.valor_por_categoria.reduce((s, c) => s + c.valor, 0))}
                            </span>
                        )}
                    </div>
                    {loading && !data ? (
                        <div className="space-y-3">
                            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}
                        </div>
                    ) : (
                        (() => {
                            const visibles = data!.valor_por_categoria.filter(c => c.valor > 0);
                            const total = visibles.reduce((s, c) => s + c.valor, 0);
                            const sorted = [...visibles].sort((a, b) => b.valor - a.valor);
                            const maxValor = sorted[0]?.valor || 0;
                            const colorByCatId: Record<number, string> = {};
                            visibles.forEach((c, i) => { colorByCatId[c.categoria_id] = CAT_COLORS[i % CAT_COLORS.length]; });

                            return (
                                <div className="flex flex-col gap-3">
                                    {sorted.map(c => {
                                        const pct = total > 0 ? Math.round((c.valor / total) * 100) : 0;
                                        const widthPct = maxValor > 0 ? (c.valor / maxValor) * 100 : 0;
                                        const color = colorByCatId[c.categoria_id];
                                        return (
                                            <div
                                                key={c.categoria_id}
                                                title={`${c.nombre}: ${fmtCLPFull(c.valor)} — ${pct}% del total`}
                                                className="group cursor-help"
                                            >
                                                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span
                                                            className="shrink-0 w-2.5 h-2.5 rounded-sm"
                                                            style={{ backgroundColor: color }}
                                                        />
                                                        <span className="text-sm font-bold text-brand-dark truncate">
                                                            {c.nombre}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-baseline gap-3 shrink-0">
                                                        <span className="text-label font-semibold text-muted-foreground tabular-nums w-9 text-right">
                                                            {pct}%
                                                        </span>
                                                        <span className="text-sm font-black text-brand-dark tabular-nums w-16 text-right">
                                                            {fmtCLP(c.valor)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-300 group-hover:opacity-90"
                                                        style={{ width: `${widthPct}%`, backgroundColor: color }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()
                    )}
                </div>
            )}

            {/* Bombas de hormigón — mes actual */}
            {(loading || (data?.bombas_hormigon_mes?.eventos ?? 0) > 0) && (
                <div className="bg-card border border-border rounded-2xl p-4 md:p-5 shrink-0">
                    <div className="flex items-center gap-2 mb-3">
                        <Droplets className="h-4 w-4 text-cyan-600" />
                        <h3 className="text-sm font-black text-brand-dark uppercase tracking-wider">
                            Bombas de hormigón
                        </h3>
                        <span className="ml-auto text-label text-muted-foreground font-semibold capitalize">
                            {new Date().toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}
                        </span>
                    </div>
                    {loading && !data ? (
                        <Skeleton className="h-[80px]" />
                    ) : (
                        // Sin permiso de ver costos de bombas: layout pasa a 2
                        // columnas (Bombeos + Obras), oculta "Costo ext.".
                        <div className={`grid gap-3 ${verCostosBombas ? 'grid-cols-3' : 'grid-cols-2'}`}>
                            <div className="flex flex-col items-center p-3 rounded-xl bg-cyan-50 border border-cyan-100 dark:bg-cyan-950/40 dark:border-cyan-900">
                                <span className="text-caption font-black uppercase tracking-wider text-cyan-800 opacity-80 dark:text-cyan-300">Bombeos</span>
                                <span className="text-2xl font-black text-cyan-900 mt-1 dark:text-cyan-200">
                                    {data!.bombas_hormigon_mes.eventos}
                                </span>
                            </div>
                            <div className="flex flex-col items-center p-3 rounded-xl bg-cyan-50 border border-cyan-100 dark:bg-cyan-950/40 dark:border-cyan-900">
                                <span className="text-caption font-black uppercase tracking-wider text-cyan-800 opacity-80 dark:text-cyan-300">Obras</span>
                                <span className="text-2xl font-black text-cyan-900 mt-1 dark:text-cyan-200">
                                    {data!.bombas_hormigon_mes.obras_distintas}
                                </span>
                            </div>
                            {verCostosBombas && (
                                <div
                                    className="flex flex-col items-center p-3 rounded-xl bg-cyan-50 border border-cyan-100 dark:bg-cyan-950/40 dark:border-cyan-900"
                                    title={`Costo externo total del mes: ${fmtCLPFull(data!.bombas_hormigon_mes.costo_externo ?? 0)}`}
                                >
                                    <span className="text-caption font-black uppercase tracking-wider text-cyan-800 opacity-80 dark:text-cyan-300">Costo ext.</span>
                                    <span className="text-2xl font-black text-cyan-900 mt-1 dark:text-cyan-200">
                                        {fmtCLP(data!.bombas_hormigon_mes.costo_externo ?? 0)}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Requiere tu atención */}
            <div className="bg-card border border-border rounded-2xl p-4 md:p-5">
                <h3 className="text-sm font-black text-brand-dark uppercase tracking-wider mb-3">
                    Requiere tu atención
                </h3>
                {loading && !data ? (
                    <div className="space-y-2">
                        {[0, 1, 2].map(i => <Skeleton key={i} className="h-[72px]" />)}
                    </div>
                ) : !data?.alertas.length ? (
                    <div className="py-10 flex flex-col items-center text-center">
                        <div className="p-3 rounded-full bg-emerald-100 mb-3 dark:bg-emerald-500/20">
                            <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-300" />
                        </div>
                        <p className="text-sm font-bold text-brand-dark">Todo al día</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            No hay pendientes, diferencias, faltantes, rechazos ni envíos atascados.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {data.alertas.map((alerta) => {
                            // Mapea el tipo de alerta al filtro de estado del listado de transferencias.
                            const estadoPorTipo: Record<DashboardAlerta['tipo'], string> = {
                                discrepancia: 'discrepancias',
                                transito: 'en_transito',
                                rechazo: 'rechazada',
                                faltante: 'aprobada',
                                pendiente: 'pendiente',
                            };
                            return (
                                <AlertaItem
                                    key={`${alerta.tipo}-${alerta.transferencia_id}`}
                                    alerta={alerta}
                                    onClick={() => onNavigateTransferencias({
                                        estado: estadoPorTipo[alerta.tipo] || 'pendiente',
                                        transferenciaId: alerta.transferencia_id,
                                    })}
                                    onProrrogar={canAprobar ? () => handleProrrogar(alerta.transferencia_id) : undefined}
                                    onCancelar={canCancelar ? () => handleCancelarSolicitud(alerta.transferencia_id) : undefined}
                                    actionLoading={actionLoadingId === alerta.transferencia_id}
                                />
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Nota: los rechazos ahora se muestran integrados en "Requiere tu
                atención" (alertas tipo 'rechazo'), no en una sección aparte. */}
        </div>
    );
};

export default ResumenEjecutivoPanel;
