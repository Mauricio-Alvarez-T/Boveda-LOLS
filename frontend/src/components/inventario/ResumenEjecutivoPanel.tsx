import React, { useState, useEffect } from 'react';
import {
    FileClock,
    AlertTriangle,
    Truck,
    Wallet,
    RefreshCw,
    ChevronRight,
    Package,
    CheckCircle2,
    User,
    Timer,
    XCircle,
    Droplets,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useDashboardEjecutivo, type DashboardAlerta, type TopObra, type DashboardRechazo, type KpiHistorico, type CategoriaValor } from '../../hooks/inventario/useDashboardEjecutivo';

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
// Donut — gráfico de categorías SVG inline
// ────────────────────────────────────────────────────────
const CAT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

interface DonutProps {
    data: CategoriaValor[];
    size?: number;
}

const Donut: React.FC<DonutProps> = ({ data, size = 180 }) => {
    const total = data.reduce((s, d) => s + d.valor, 0);
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 8;
    const stroke = 32;

    if (total === 0) {
        return (
            <svg width={size} height={size} aria-hidden="true">
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EDEDF2" strokeWidth={stroke} />
            </svg>
        );
    }

    let acc = 0;
    const segments = data
        .filter(d => d.valor > 0)
        .map((d, i) => {
            const frac = d.valor / total;
            const start = acc;
            const end = acc + frac;
            acc = end;
            // Convertir fracciones [0..1] a ángulos (0 = top, clockwise)
            const a0 = 2 * Math.PI * start - Math.PI / 2;
            const a1 = 2 * Math.PI * end - Math.PI / 2;
            const x0 = cx + r * Math.cos(a0);
            const y0 = cy + r * Math.sin(a0);
            const x1 = cx + r * Math.cos(a1);
            const y1 = cy + r * Math.sin(a1);
            const largeArc = frac > 0.5 ? 1 : 0;
            const path = `M ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1}`;
            return {
                path,
                color: CAT_COLORS[i % CAT_COLORS.length],
                nombre: d.nombre,
                valor: d.valor,
                pct: Math.round(frac * 100),
            };
        });

    return (
        <svg width={size} height={size} aria-label="Distribución de valor por categoría">
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F5F5F7" strokeWidth={stroke} />
            {segments.map((s, i) => (
                <path
                    key={i}
                    d={s.path}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={stroke}
                    strokeLinecap="butt"
                >
                    <title>{`${s.nombre}: ${fmtCLPFull(s.valor)} (${s.pct}%)`}</title>
                </path>
            ))}
        </svg>
    );
};

// ────────────────────────────────────────────────────────
// Sparkline — mini gráfico SVG sin dependencias
// ────────────────────────────────────────────────────────
const Sparkline: React.FC<{ data: number[]; tone: 'amber' | 'red' | 'blue' | 'green' }> = ({ data, tone }) => {
    if (!data || data.length < 2) return null;
    const w = 80;
    const h = 22;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const step = w / (data.length - 1);
    const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(' ');
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

// ────────────────────────────────────────────────────────
// Chip comparativa vs mes anterior
// ────────────────────────────────────────────────────────
const ComparativaChip: React.FC<{ delta_pct: number | null; invertColor?: boolean }> = ({ delta_pct, invertColor }) => {
    if (delta_pct === null || delta_pct === undefined) return null;
    // invertColor: para KPIs donde subir es malo (pendientes, estancados, etc.)
    const isUp = delta_pct > 0;
    const isFlat = delta_pct === 0;
    const good = invertColor ? !isUp : isUp;
    const toneClass = isFlat
        ? 'bg-white/60 text-muted-foreground'
        : good
            ? 'bg-emerald-200/60 text-emerald-800'
            : 'bg-red-200/60 text-red-800';
    const arrow = isFlat ? '→' : isUp ? '↑' : '↓';
    return (
        <span
            className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-black', toneClass)}
            title={`Variación vs hace 30 días: ${delta_pct > 0 ? '+' : ''}${delta_pct}%`}
        >
            {arrow} {Math.abs(delta_pct)}%
        </span>
    );
};

// ────────────────────────────────────────────────────────
// KPI card grande, clickeable, área completa como botón
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

const KpiCard: React.FC<KpiCardProps> = ({ tone, icon, label, value, subline, onClick, disabled, tooltip, historico, invertDelta }) => {
    const toneClasses: Record<KpiCardProps['tone'], string> = {
        amber:  'bg-amber-50  border-amber-200  hover:border-amber-400  text-amber-900',
        red:    'bg-red-50    border-red-200    hover:border-red-400    text-red-900',
        blue:   'bg-blue-50   border-blue-200   hover:border-blue-400   text-blue-900',
        green:  'bg-emerald-50 border-emerald-200 hover:border-emerald-400 text-emerald-900',
    };
    const iconClasses: Record<KpiCardProps['tone'], string> = {
        amber:  'bg-amber-200/60  text-amber-700',
        red:    'bg-red-200/60    text-red-700',
        blue:   'bg-blue-200/60   text-blue-700',
        green:  'bg-emerald-200/60 text-emerald-700',
    };

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
                <span className="text-[11px] md:text-xs font-black uppercase tracking-wider">
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

// ────────────────────────────────────────────────────────
// Fila de ranking de obras
// ────────────────────────────────────────────────────────
interface ObraRankingItemProps {
    pos: number;
    obra: TopObra;
    maxValor: number;
    onClick: () => void;
}

const ObraRankingItem: React.FC<ObraRankingItemProps> = ({ pos, obra, maxValor, onClick }) => {
    const pct = maxValor > 0 ? (obra.valor_mensual / maxValor) * 100 : 0;
    const tooltipLines = [
        `${obra.nombre}`,
        `Arriendo mensual neto: ${fmtCLPFull(obra.valor_mensual)}`,
    ];
    if (obra.descuento_porcentaje > 0) {
        tooltipLines.push(`Bruto sin descuento: ${fmtCLPFull(obra.valor_bruto)}`);
        tooltipLines.push(`Descuento aplicado: ${obra.descuento_porcentaje}%`);
        tooltipLines.push(`Ahorro: ${fmtCLPFull(obra.valor_bruto - obra.valor_mensual)}`);
    }
    tooltipLines.push('', 'Click para ver detalle de la obra.');
    return (
        <button
            type="button"
            onClick={onClick}
            title={tooltipLines.join('\n')}
            aria-label={`${obra.nombre}: ${fmtCLPFull(obra.valor_mensual)} mensual. Click para ver detalle.`}
            className="group flex items-center gap-3 w-full p-3 rounded-xl hover:bg-[#F5F5F7] transition-all text-left"
        >
            <span className="shrink-0 w-7 h-7 rounded-lg bg-brand-primary/10 text-brand-primary text-xs font-black flex items-center justify-center">
                {pos}
            </span>
            <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-bold text-brand-dark truncate">{obra.nombre}</span>
                    <span className="shrink-0 text-sm font-black text-brand-dark">
                        {fmtCLP(obra.valor_mensual)}
                    </span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-[#EDEDF2] overflow-hidden">
                    <div
                        className="h-full bg-brand-primary rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                    />
                </div>
                {obra.descuento_porcentaje > 0 && (
                    <div className="mt-1 text-[10px] text-muted-foreground font-semibold">
                        {obra.descuento_porcentaje}% desc. aplicado · bruto {fmtCLP(obra.valor_bruto)}
                    </div>
                )}
            </div>
            <ChevronRight className="shrink-0 h-4 w-4 text-muted-foreground/40 group-hover:text-brand-primary transition-colors" />
        </button>
    );
};

// ────────────────────────────────────────────────────────
// Item de alerta
// ────────────────────────────────────────────────────────
interface AlertaItemProps {
    alerta: DashboardAlerta;
    onClick: () => void;
}

const AlertaItem: React.FC<AlertaItemProps> = ({ alerta, onClick }) => {
    const toneMap: Record<DashboardAlerta['tipo'], { bg: string; border: string; icon: React.ReactNode; iconBg: string; cta: string }> = {
        pendiente: {
            bg: 'bg-amber-50/60',
            border: 'border-amber-200',
            icon: <FileClock className="h-4 w-4" />,
            iconBg: 'bg-amber-200/70 text-amber-800',
            cta: 'Aprobar',
        },
        discrepancia: {
            bg: 'bg-red-50/60',
            border: 'border-red-200',
            icon: <AlertTriangle className="h-4 w-4" />,
            iconBg: 'bg-red-200/70 text-red-800',
            cta: 'Revisar',
        },
        transito: {
            bg: 'bg-blue-50/60',
            border: 'border-blue-200',
            icon: <Truck className="h-4 w-4" />,
            iconBg: 'bg-blue-200/70 text-blue-800',
            cta: 'Ver',
        },
    };
    const t = toneMap[alerta.tipo];

    const diasLabel = alerta.dias === 0 ? 'hoy' : alerta.dias === 1 ? 'hace 1 día' : `hace ${alerta.dias} días`;

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={`${alerta.titulo}. ${alerta.detalle}. ${diasLabel}. Click para ver.`}
            className={cn(
                'flex items-center gap-3 w-full p-3.5 rounded-xl border-2 transition-all text-left hover:shadow-md active:scale-[0.995]',
                t.bg,
                t.border
            )}
        >
            <div className={cn('shrink-0 p-2 rounded-lg', t.iconBg)}>
                {t.icon}
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-brand-dark truncate">
                    {alerta.titulo}
                    <span className="ml-2 text-[11px] font-semibold text-muted-foreground">— {diasLabel}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {alerta.detalle}
                </div>
                {alerta.solicitante && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground/80 mt-0.5 truncate">
                        <User className="h-3 w-3 shrink-0" />
                        <span className="font-semibold truncate">{alerta.solicitante}</span>
                    </div>
                )}
            </div>
            <span className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/80 border border-current/10 text-xs font-bold">
                {t.cta}
                <ChevronRight className="h-3.5 w-3.5" />
            </span>
        </button>
    );
};

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
        <button
            type="button"
            onClick={onClick}
            aria-label={`${rechazo.codigo} rechazado ${diasLabel}. Click para ver.`}
            className="flex items-start gap-3 w-full p-3.5 rounded-xl border-2 border-red-100 bg-red-50/40 transition-all text-left hover:border-red-300 hover:shadow-md active:scale-[0.995]"
        >
            <div className="shrink-0 p-2 rounded-lg bg-red-200/70 text-red-800 mt-0.5">
                <XCircle className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-brand-dark truncate">
                    {rechazo.codigo}
                    <span className="ml-2 text-[11px] font-semibold text-muted-foreground">— {diasLabel}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {rechazo.origen} → {rechazo.destino}
                </div>
                {rechazo.observaciones_rechazo && (
                    <div className="text-xs text-red-700 font-semibold mt-1 line-clamp-2">
                        "{rechazo.observaciones_rechazo}"
                    </div>
                )}
                {rechazo.rechazado_por && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground/80 mt-0.5">
                        <User className="h-3 w-3 shrink-0" />
                        <span className="font-semibold truncate">{rechazo.rechazado_por}</span>
                    </div>
                )}
            </div>
            <span className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/80 border border-current/10 text-xs font-bold text-red-700">
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
    <div className={cn('animate-pulse bg-[#EDEDF2] rounded-xl', className)} />
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
    const { data, loading, error, refetch, lastUpdated } = useDashboardEjecutivo();
    const [now, setNow] = useState(() => Date.now());

    // Tick cada 30s para refrescar el label "hace X min"
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(id);
    }, []);

    const maxValor = data?.top_obras.reduce((m, o) => Math.max(m, o.valor_mensual), 0) || 0;
    const relTime = formatRelativeTime(lastUpdated, now);

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
                <div className="flex items-center gap-2 shrink-0">
                    {relTime.label && (
                        <span
                            title={lastUpdated ? new Date(lastUpdated).toLocaleString('es-CL') : undefined}
                            className={cn(
                                'hidden md:inline text-[11px] font-semibold cursor-help',
                                relTime.stale ? 'text-amber-600' : 'text-muted-foreground'
                            )}
                        >
                            {relTime.label}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={refetch}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-brand-dark bg-[#F5F5F7] hover:bg-[#EDEDF2] rounded-xl transition-colors disabled:opacity-50"
                        aria-label="Actualizar datos"
                    >
                        <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                        Actualizar
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-xl bg-red-50 border-2 border-red-200 text-sm text-red-800 font-semibold">
                    {error}
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4 shrink-0">
                {loading && !data ? (
                    <>
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
                            label="Discrepancias"
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
                        <KpiCard
                            tone="green"
                            icon={<Wallet className="h-5 w-5" />}
                            label="Valor obras"
                            value={fmtCLP(data?.kpis.valor_total_obras ?? 0)}
                            subline="arriendo mensual"
                            tooltip="Valor total mensual de arriendo de todos los items asignados a obras activas. Ya incluye los descuentos aplicados a cada obra."
                            historico={data?.historico?.valor_obras}
                        />
                    </>
                )}
            </div>

            {/* Ranking de obras */}
            <div className="bg-white border border-[#E8E8ED] rounded-2xl p-4 md:p-5 shrink-0">
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

            {/* Valor por categoría (Donut) */}
            {(loading || ((data?.valor_por_categoria?.reduce((s, c) => s + c.valor, 0) ?? 0) > 0)) && (
                <div className="bg-white border border-[#E8E8ED] rounded-2xl p-4 md:p-5 shrink-0">
                    <h3 className="text-sm font-black text-brand-dark uppercase tracking-wider mb-3">
                        Valor por categoría
                    </h3>
                    {loading && !data ? (
                        <Skeleton className="h-[180px]" />
                    ) : (
                        <div className="flex flex-col md:flex-row items-center gap-5">
                            <div className="shrink-0">
                                <Donut data={data!.valor_por_categoria} />
                            </div>
                            <div className="flex-1 w-full flex flex-col gap-2">
                                {(() => {
                                    // Color asignado por posición original en el array (para que
                                    // donut y leyenda coincidan aunque la leyenda se ordene por valor).
                                    const colorByCatId: Record<number, string> = {};
                                    const visibles = data!.valor_por_categoria.filter(c => c.valor > 0);
                                    visibles.forEach((c, i) => { colorByCatId[c.categoria_id] = CAT_COLORS[i % CAT_COLORS.length]; });
                                    const total = visibles.reduce((s, c) => s + c.valor, 0);
                                    return [...visibles]
                                        .sort((a, b) => b.valor - a.valor)
                                        .map(c => {
                                            const pct = total > 0 ? Math.round((c.valor / total) * 100) : 0;
                                            return (
                                                <div key={c.categoria_id} className="flex items-center gap-3">
                                                    <span
                                                        className="shrink-0 w-3 h-3 rounded-full"
                                                        style={{ backgroundColor: colorByCatId[c.categoria_id] }}
                                                    />
                                                    <span className="flex-1 text-sm font-bold text-brand-dark truncate">
                                                        {c.nombre}
                                                    </span>
                                                    <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                                                        {pct}%
                                                    </span>
                                                    <span className="shrink-0 text-sm font-black text-brand-dark w-20 text-right">
                                                        {fmtCLP(c.valor)}
                                                    </span>
                                                </div>
                                            );
                                        });
                                })()}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Bombas de hormigón — mes actual */}
            {(loading || (data?.bombas_hormigon_mes?.eventos ?? 0) > 0) && (
                <div className="bg-white border border-[#E8E8ED] rounded-2xl p-4 md:p-5 shrink-0">
                    <div className="flex items-center gap-2 mb-3">
                        <Droplets className="h-4 w-4 text-cyan-600" />
                        <h3 className="text-sm font-black text-brand-dark uppercase tracking-wider">
                            Bombas de hormigón
                        </h3>
                        <span className="ml-auto text-[11px] text-muted-foreground font-semibold capitalize">
                            {new Date().toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}
                        </span>
                    </div>
                    {loading && !data ? (
                        <Skeleton className="h-[80px]" />
                    ) : (
                        <div className="grid grid-cols-3 gap-3">
                            <div className="flex flex-col items-center p-3 rounded-xl bg-cyan-50 border border-cyan-100">
                                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-800 opacity-80">Bombeos</span>
                                <span className="text-2xl font-black text-cyan-900 mt-1">
                                    {data!.bombas_hormigon_mes.eventos}
                                </span>
                            </div>
                            <div className="flex flex-col items-center p-3 rounded-xl bg-cyan-50 border border-cyan-100">
                                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-800 opacity-80">Obras</span>
                                <span className="text-2xl font-black text-cyan-900 mt-1">
                                    {data!.bombas_hormigon_mes.obras_distintas}
                                </span>
                            </div>
                            <div
                                className="flex flex-col items-center p-3 rounded-xl bg-cyan-50 border border-cyan-100"
                                title={`Costo externo total del mes: ${fmtCLPFull(data!.bombas_hormigon_mes.costo_externo)}`}
                            >
                                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-800 opacity-80">Costo ext.</span>
                                <span className="text-2xl font-black text-cyan-900 mt-1">
                                    {fmtCLP(data!.bombas_hormigon_mes.costo_externo)}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Requiere tu atención */}
            <div className="bg-white border border-[#E8E8ED] rounded-2xl p-4 md:p-5">
                <h3 className="text-sm font-black text-brand-dark uppercase tracking-wider mb-3">
                    Requiere tu atención
                </h3>
                {loading && !data ? (
                    <div className="space-y-2">
                        {[0, 1, 2].map(i => <Skeleton key={i} className="h-[72px]" />)}
                    </div>
                ) : !data?.alertas.length ? (
                    <div className="py-10 flex flex-col items-center text-center">
                        <div className="p-3 rounded-full bg-emerald-100 mb-3">
                            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                        </div>
                        <p className="text-sm font-bold text-brand-dark">Todo al día</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            No hay solicitudes pendientes, discrepancias ni envíos atascados.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {data.alertas.map((alerta) => (
                            <AlertaItem
                                key={`${alerta.tipo}-${alerta.transferencia_id}`}
                                alerta={alerta}
                                onClick={() => onNavigateTransferencias({
                                    estado: alerta.tipo === 'discrepancia' ? 'discrepancias' : alerta.tipo === 'transito' ? 'en_transito' : 'pendiente',
                                    transferenciaId: alerta.transferencia_id,
                                })}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Rechazos recientes (últimos 7 días) */}
            {(loading || (data?.rechazos_recientes?.length ?? 0) > 0) && (
                <div className="bg-white border border-[#E8E8ED] rounded-2xl p-4 md:p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <XCircle className="h-4 w-4 text-red-500" />
                        <h3 className="text-sm font-black text-brand-dark uppercase tracking-wider">
                            Rechazos recientes
                        </h3>
                        <span className="ml-auto text-[11px] text-muted-foreground font-semibold">últimos 7 días</span>
                    </div>
                    {loading && !data ? (
                        <div className="space-y-2">
                            {[0, 1].map(i => <Skeleton key={i} className="h-[80px]" />)}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {data!.rechazos_recientes.map((rechazo) => (
                                <RechazoItem
                                    key={rechazo.transferencia_id}
                                    rechazo={rechazo}
                                    onClick={() => onNavigateTransferencias({
                                        estado: 'rechazada',
                                        transferenciaId: rechazo.transferencia_id,
                                    })}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ResumenEjecutivoPanel;
