import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Search, History, User, Globe, Cpu, Clock, ChevronLeft, ChevronRight,
    Building2, Users, ChevronDown, Download, X, Filter as FilterIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { cn } from '../../utils/cn';
import {
    normalizeLogDetail, getLabel,
    type BulkAsistenciaTrabajador,
} from '../../utils/logNormalizer';

/* ─────────────────────────── Tipos ─────────────────────────── */

interface Log {
    id: number;
    usuario_id: number;
    usuario_nombre: string;
    modulo: string;
    accion: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'UPLOAD' | 'EMAIL';
    item_id: string;
    entidad_tipo: string | null;
    entidad_label: string | null;
    detalle: string;
    ip: string;
    user_agent: string;
    created_at: string;
}

interface LogsFiltros {
    usuarios: { id: number; nombre: string }[];
    modulos: string[];
    entidad_tipos: string[];
    acciones: string[];
    acciones_default: string[];
}

interface PaginatedResponse {
    data: Log[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
}

interface PanelFilters {
    q: string;
    usuario_id: string;
    modulo: string;
    accion: string[];
    entidad_tipo: string;
    desde: string;
    hasta: string;
    incluir_logins: boolean;
}

const DEFAULT_FILTERS: PanelFilters = {
    q: '',
    usuario_id: '',
    modulo: '',
    accion: [],
    entidad_tipo: '',
    desde: '',
    hasta: '',
    incluir_logins: false,
};

const PAGE_SIZE = 20;

/* ─────────────────── Sub-componentes (sin cambios funcionales) ─────────────────── */

const CompactDiffViewer: React.FC<{ cambios: Record<string, { de: any, a: any }>, trabajador?: string, fecha?: string, responsable?: string }> = ({ cambios, trabajador, fecha, responsable }) => {
    const keys = Object.keys(cambios);
    if (keys.length === 0) return (
        <div className="flex flex-col items-center justify-center p-8 text-center bg-background rounded-2xl border border-dashed border-border">
            <History className="h-8 w-8 text-[#8E8E93] mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground font-medium italic">Sin cambios detectados en este registro</p>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="bg-white p-4 rounded-2xl border border-border shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-brand-primary/5 rounded-full flex items-center justify-center">
                        <History className="h-5 w-5 text-brand-primary" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-brand-dark uppercase tracking-tight">Detalle de Cambios</h4>
                        <p className="text-xs text-muted-foreground font-medium">Comparativa de valores modificados</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {responsable && (
                        <div className="flex items-center gap-2 bg-brand-primary/5 px-3 py-1.5 rounded-full border border-brand-primary/10">
                            <span className="text-[10px] font-bold text-brand-primary uppercase tracking-tighter">Hecho por:</span>
                            <span className="text-xs font-bold text-brand-dark">{responsable}</span>
                        </div>
                    )}
                    {trabajador && (
                        <div className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-full border border-border/50">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-semibold text-brand-dark">{trabajador}</span>
                        </div>
                    )}
                    {fecha && (
                        <div className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-full border border-border/50">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-semibold text-brand-dark">{fecha}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-3">
                {keys.map(key => (
                    <div key={key} className="bg-white rounded-2xl border border-border overflow-hidden">
                        <div className="px-5 py-3 bg-background border-b border-border flex items-center justify-between">
                            <span className="text-xs font-black text-brand-dark uppercase tracking-widest opacity-80">{getLabel(key)}</span>
                            <div className="h-2 w-2 rounded-full bg-brand-primary opacity-50" />
                        </div>
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <div className="h-2 w-2 rounded-full bg-destructive opacity-40" />
                                    <span className="text-[10px] font-black text-brand-dark uppercase tracking-widest">Valor Anterior</span>
                                </div>
                                <div className="bg-destructive/5 p-4 rounded-xl border border-destructive/10 min-h-[56px] flex items-center">
                                    <span className="text-base text-destructive font-medium line-through decoration-destructive/30 underline-offset-4 decoration-2">
                                        {cambios[key].de ?? '—'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <div className="h-2 w-2 rounded-full bg-brand-accent opacity-40" />
                                    <span className="text-[10px] font-black text-brand-dark uppercase tracking-widest">Valor Actualizado</span>
                                </div>
                                <div className="bg-brand-accent/5 p-4 rounded-xl border border-brand-accent/10 min-h-[56px] flex items-center">
                                    <span className="text-base text-brand-dark font-bold">
                                        {cambios[key].a ?? '—'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const LegacyDiffViewer: React.FC<{ antes: any, nuevo: any, responsable?: string }> = ({ antes, nuevo, responsable }) => {
    const ignoredKeys = new Set(['id', 'created_at', 'updated_at', 'usuario_id', 'password', 'password_hash']);
    const allKeys = Array.from(new Set([...Object.keys(antes || {}), ...Object.keys(nuevo || {})]));
    const normalize = (v: any) => (v === null || v === undefined || v === '') ? null : v;
    const changedKeys = allKeys.filter(k => {
        if (ignoredKeys.has(k)) return false;
        return JSON.stringify(normalize(antes?.[k])) !== JSON.stringify(normalize(nuevo?.[k]));
    });

    if (changedKeys.length === 0) return <p className="text-sm font-medium text-muted-foreground italic">Sin cambios detectados</p>;

    const cambios: Record<string, { de: any, a: any }> = {};
    for (const k of changedKeys) {
        cambios[k] = { de: antes?.[k] ?? null, a: nuevo?.[k] ?? null };
    }
    return <CompactDiffViewer cambios={cambios} responsable={responsable} />;
};

const GenericDetailView: React.FC<{ parsed: any, responsable?: string }> = ({ parsed, responsable }) => {
    return (
        <div className="space-y-6">
            <div className="bg-white p-5 rounded-2xl border border-border shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="h-12 w-12 bg-[#8E8E93]/10 rounded-full flex items-center justify-center">
                        <History className="h-6 w-6 text-[#8E8E93]" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-brand-dark uppercase tracking-tight">Datos del Registro</h4>
                        <p className="text-xs text-muted-foreground font-medium">Información completa almacenada</p>
                    </div>
                </div>
                {responsable && (
                    <div className="bg-brand-primary/5 px-3 py-1.5 rounded-full border border-brand-primary/10 flex items-center gap-2">
                        <span className="text-[10px] font-bold text-brand-primary uppercase tracking-tighter">Registrado por:</span>
                        <span className="text-xs font-bold text-brand-dark">{responsable}</span>
                    </div>
                )}
            </div>

            <div className="bg-white rounded-2xl border border-border overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2">
                    {Object.entries(parsed).map(([key, value], index) => {
                        if (typeof value === 'object' && value !== null && !Array.isArray(value)) return null;
                        return (
                            <div key={key} className={cn(
                                "p-5 flex flex-col gap-2 border-background",
                                index % 2 === 0 ? "md:border-r" : "",
                                index < Object.entries(parsed).length - 2 ? "border-b" : ""
                            )}>
                                <span className="text-xs font-black text-[#8E8E93] uppercase tracking-widest leading-none mb-0.5">
                                    {getLabel(key)}
                                </span>
                                <span className="text-base text-brand-dark font-semibold tracking-tight">
                                    {Array.isArray(value) ? `${value.length} elementos` : String(value ?? '—')}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

interface BulkAsistenciaPayload {
    type: 'bulk_asistencia';
    obra_id: number | null;
    obra_nombre: string;
    fecha_asistencia: string;
    total: number;
    creados: number;
    actualizados: number;
    trabajadores: BulkAsistenciaTrabajador[];
    resumen?: string;
}

const formatFechaAsistencia = (raw: string): string => {
    if (!raw) return '';
    const parts = raw.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : raw;
};

const BulkAsistenciaViewer: React.FC<{ data: BulkAsistenciaPayload; responsable?: string }> = ({ data, responsable }) => {
    const [expanded, setExpanded] = useState<Record<number, boolean>>({});
    const toggle = (i: number) => setExpanded(p => ({ ...p, [i]: !p[i] }));

    return (
        <div className="space-y-5">
            <div className="bg-white p-4 rounded-2xl border border-border shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-brand-primary/5 rounded-full flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-brand-primary" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-brand-dark uppercase tracking-tight">{data.obra_nombre}</h4>
                        <p className="text-xs text-muted-foreground font-medium">Toma de asistencia • {formatFechaAsistencia(data.fecha_asistencia)}</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {responsable && (
                        <div className="flex items-center gap-2 bg-brand-primary/5 px-3 py-1.5 rounded-full border border-brand-primary/10">
                            <span className="text-[10px] font-bold text-brand-primary uppercase tracking-tighter">Tomada por:</span>
                            <span className="text-xs font-bold text-brand-dark">{responsable}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-full border border-border/50">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold text-brand-dark">{data.total} trabajadores</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="bg-brand-accent/5 border border-brand-accent/15 rounded-2xl p-3 flex items-center justify-between">
                    <span className="text-[10px] font-black text-brand-dark uppercase tracking-widest">Registrados</span>
                    <span className="text-xl font-black text-brand-accent tabular-nums">{data.creados}</span>
                </div>
                <div className="bg-warning/5 border border-warning/15 rounded-2xl p-3 flex items-center justify-between">
                    <span className="text-[10px] font-black text-brand-dark uppercase tracking-widest">Modificados</span>
                    <span className="text-xl font-black text-warning tabular-nums">{data.actualizados}</span>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-border overflow-hidden">
                <div className="px-4 py-2.5 bg-background border-b border-border">
                    <span className="text-[11px] font-black text-brand-dark uppercase tracking-widest opacity-80">Trabajadores</span>
                </div>
                <div className="max-h-[420px] overflow-y-auto divide-y divide-border/50">
                    {data.trabajadores.map((t, i) => {
                        const hasCambios = t.cambios && Object.keys(t.cambios).length > 0;
                        const isOpen = !!expanded[i];
                        return (
                            <div key={i} className="px-4 py-2.5">
                                <div className={cn("flex items-center justify-between gap-3", hasCambios && "cursor-pointer")} onClick={() => hasCambios && toggle(i)}>
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={cn(
                                            "text-[9px] font-black px-1.5 py-0.5 rounded",
                                            t.accion === 'CREATE' ? "bg-brand-accent/10 text-brand-accent" : "bg-warning/10 text-warning"
                                        )}>
                                            {t.accion === 'CREATE' ? 'NUEVO' : 'EDITADO'}
                                        </span>
                                        <span className="text-xs font-semibold text-brand-dark truncate">{t.nombre}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {t.estado && (
                                            <span className="text-[10px] font-bold bg-background border border-border/50 px-2 py-0.5 rounded-full text-brand-dark">{t.estado}</span>
                                        )}
                                        {hasCambios && (
                                            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                                        )}
                                    </div>
                                </div>
                                {hasCambios && isOpen && (
                                    <div className="mt-2 ml-4 space-y-1">
                                        {Object.entries(t.cambios!).map(([campo, val]) => (
                                            <div key={campo} className="flex items-center gap-2 text-[10px]">
                                                <span className="font-black uppercase tracking-wider text-muted-foreground">{campo}:</span>
                                                <span className="text-destructive line-through decoration-destructive/30">{val.de ?? '—'}</span>
                                                <span className="text-muted-foreground">→</span>
                                                <span className="text-brand-dark font-bold">{val.a ?? '—'}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

/* ─────────────────────────── Resumen inline + modal opcional ─────────────────────────── */

/**
 * Decide si un log es "complejo" y amerita modal aparte.
 * - bulk_asistencia: siempre modal (lista de trabajadores)
 * - diff/compact con > 3 cambios: modal
 * - resto: inline
 */
const needsModal = (parsed: any): boolean => {
    if (!parsed || typeof parsed !== 'object') return false;
    if (parsed.type === 'bulk_asistencia') return true;
    if (parsed.type === 'diff') {
        const total = Object.keys({ ...parsed.antes, ...parsed.nuevo }).length;
        return total > 3;
    }
    if (parsed.type === 'compact') {
        return Object.keys(parsed.cambios || {}).length > 3;
    }
    return false;
};

/**
 * Texto de resumen mostrado inline en cada fila.
 * Estrategia:
 *   1. Si parsed tiene `resumen` → usarlo.
 *   2. Si es bulk_asistencia → "{obra} · {total} trabajadores".
 *   3. Si es diff/compact → primeros campos cambiados.
 *   4. Si es plain object → primeras 2 entries.
 */
const inlineResumen = (parsed: any): string => {
    if (!parsed) return '';
    if (typeof parsed === 'string') return parsed.slice(0, 200);
    if (typeof parsed !== 'object') return String(parsed);

    if (parsed.type === 'bulk_asistencia') {
        return `${parsed.obra_nombre || `Obra ${parsed.obra_id}`} · ${parsed.total} trabajadores`;
    }
    if (typeof parsed.resumen === 'string' && parsed.resumen.trim()) {
        return parsed.resumen.slice(0, 200);
    }
    if (parsed.type === 'compact') {
        const keys = Object.keys(parsed.cambios || {}).slice(0, 3).map(getLabel);
        return keys.length > 0 ? `Cambió: ${keys.join(', ')}` : '';
    }
    if (parsed.type === 'diff') {
        const keys = Object.keys({ ...parsed.antes, ...parsed.nuevo }).slice(0, 3).map(getLabel);
        return keys.length > 0 ? `Cambió: ${keys.join(', ')}` : '';
    }
    const entries = Object.entries(parsed).filter(([k]) => k !== 'datos');
    if (entries.length === 0) return '';
    return entries.slice(0, 2).map(([k, v]) =>
        `${getLabel(k)}: ${v === null || v === undefined ? '—' : String(v).slice(0, 50)}`
    ).join(' · ');
};

/* ─────────────────────────── Componente principal ─────────────────────────── */

export const ActivityLogsPanel: React.FC = () => {
    const [logs, setLogs] = useState<Log[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [filters, setFilters] = useState<PanelFilters>(DEFAULT_FILTERS);
    const [filterOptions, setFilterOptions] = useState<LogsFiltros | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [openLog, setOpenLog] = useState<Log | null>(null);

    // Cargar dropdowns una sola vez al montar.
    useEffect(() => {
        let cancelled = false;
        api.get('/logs/filtros')
            .then(res => { if (!cancelled) setFilterOptions(res.data.data); })
            .catch(err => { console.error('Error cargando filtros logs', err); });
        return () => { cancelled = true; };
    }, []);

    // Construye query string con los filtros activos. Compartido por fetch
    // y export para que el CSV refleje exactamente lo que se ve.
    const buildQuery = useCallback((extra: Record<string, string> = {}): string => {
        const qs = new URLSearchParams();
        if (filters.q) qs.set('q', filters.q);
        if (filters.usuario_id) qs.set('usuario_id', filters.usuario_id);
        if (filters.modulo) qs.set('modulo', filters.modulo);
        if (filters.accion.length > 0) qs.set('accion', filters.accion.join(','));
        if (filters.entidad_tipo) qs.set('entidad_tipo', filters.entidad_tipo);
        if (filters.desde) qs.set('desde', filters.desde);
        if (filters.hasta) qs.set('hasta', filters.hasta);
        if (filters.incluir_logins) qs.set('incluir_logins', 'true');
        for (const [k, v] of Object.entries(extra)) qs.set(k, v);
        return qs.toString();
    }, [filters]);

    // Debounce para `q`
    const qDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [debouncedQ, setDebouncedQ] = useState(filters.q);
    useEffect(() => {
        if (qDebounceRef.current) clearTimeout(qDebounceRef.current);
        qDebounceRef.current = setTimeout(() => setDebouncedQ(filters.q), 300);
        return () => {
            if (qDebounceRef.current) clearTimeout(qDebounceRef.current);
        };
    }, [filters.q]);

    // Reset page a 1 cuando cambian filtros (excepto page misma).
    useEffect(() => {
        setPage(1);
    }, [filters.usuario_id, filters.modulo, filters.accion, filters.entidad_tipo,
        filters.desde, filters.hasta, filters.incluir_logins, debouncedQ]);

    // Fetch
    useEffect(() => {
        let cancelled = false;
        const fetchLogs = async () => {
            setLoading(true);
            try {
                const qs = buildQuery({ page: String(page), limit: String(PAGE_SIZE) });
                const res = await api.get<{ data: PaginatedResponse } | PaginatedResponse>(`/logs?${qs}`);
                if (cancelled) return;
                // El endpoint puede responder con la estructura directa o anidada.
                const payload: PaginatedResponse = (res.data as any).data && Array.isArray((res.data as any).data)
                    ? (res.data as any) as PaginatedResponse
                    : ((res.data as any).data as PaginatedResponse);
                setLogs(payload.data || []);
                setTotal(payload.total || 0);
                setTotalPages(payload.total_pages || 1);
            } catch (err) {
                console.error('Error fetching logs', err);
                setLogs([]);
                setTotal(0);
                setTotalPages(1);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchLogs();
        return () => { cancelled = true; };
    }, [page, buildQuery, debouncedQ]);

    const handleExportCSV = () => {
        const qs = buildQuery();
        // Usa el endpoint de export con los mismos filtros. Forzamos descarga
        // dejando que el navegador maneje el Content-Disposition.
        const baseURL = api.defaults.baseURL || '';
        const url = `${baseURL}/logs/export${qs ? `?${qs}` : ''}`;
        // Como necesitamos auth, fetch con credentials. Pero `api` usa Axios
        // con interceptor de token → preferimos descargar via blob:
        api.get(`/logs/export${qs ? `?${qs}` : ''}`, { responseType: 'blob' })
            .then(res => {
                const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `historial_${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
            })
            .catch(err => {
                console.error('Error exportando CSV', err);
                // Fallback: abrir en nueva pestaña (sólo si auth via cookie funciona)
                window.open(url, '_blank');
            });
    };

    const toggleAccion = (accion: string) => {
        setFilters(prev => ({
            ...prev,
            accion: prev.accion.includes(accion)
                ? prev.accion.filter(a => a !== accion)
                : [...prev.accion, accion],
        }));
    };

    const clearFilters = () => setFilters(DEFAULT_FILTERS);

    const activeFilterCount = useMemo(() => {
        let n = 0;
        if (filters.usuario_id) n++;
        if (filters.modulo) n++;
        if (filters.accion.length > 0) n++;
        if (filters.entidad_tipo) n++;
        if (filters.desde) n++;
        if (filters.hasta) n++;
        if (filters.incluir_logins) n++;
        return n;
    }, [filters]);

    return (
        <div className="space-y-4">
            {/* ═══ Barra de filtros ═══ */}
            <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
                {/* Línea 1: búsqueda + toggle filtros + export */}
                <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
                    <div className="relative flex-1 min-w-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por entidad, usuario o detalle..."
                            className="pl-10"
                            value={filters.q}
                            onChange={(e) => setFilters(f => ({ ...f, q: e.target.value }))}
                        />
                        {filters.q && (
                            <button
                                onClick={() => setFilters(f => ({ ...f, q: '' }))}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground hover:bg-muted-foreground/20 transition-all"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            variant="glass"
                            size="sm"
                            onClick={() => setShowFilters(v => !v)}
                            leftIcon={<FilterIcon className="h-4 w-4" />}
                            className={cn(showFilters && 'bg-brand-primary/10 text-brand-primary')}
                        >
                            Filtros
                            {activeFilterCount > 0 && (
                                <span className="ml-1 inline-flex items-center justify-center h-4 min-w-4 px-1 text-[9px] font-black bg-brand-primary text-white rounded-full">
                                    {activeFilterCount}
                                </span>
                            )}
                        </Button>
                        <Button
                            variant="glass"
                            size="sm"
                            onClick={handleExportCSV}
                            leftIcon={<Download className="h-4 w-4" />}
                        >
                            CSV
                        </Button>
                    </div>
                </div>

                {/* Línea 2: panel filtros expandible */}
                {showFilters && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-3 border-t border-border">
                        {/* Usuario */}
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1 block">Usuario</label>
                            <select
                                value={filters.usuario_id}
                                onChange={(e) => setFilters(f => ({ ...f, usuario_id: e.target.value }))}
                                className="w-full h-9 bg-background border border-border rounded-lg text-xs font-medium text-brand-dark px-3 outline-none focus:border-brand-primary cursor-pointer"
                            >
                                <option value="">Todos</option>
                                {filterOptions?.usuarios.map(u => (
                                    <option key={u.id} value={u.id}>{u.nombre}</option>
                                ))}
                            </select>
                        </div>

                        {/* Módulo */}
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1 block">Módulo</label>
                            <select
                                value={filters.modulo}
                                onChange={(e) => setFilters(f => ({ ...f, modulo: e.target.value }))}
                                className="w-full h-9 bg-background border border-border rounded-lg text-xs font-medium text-brand-dark px-3 outline-none focus:border-brand-primary cursor-pointer"
                            >
                                <option value="">Todos</option>
                                {filterOptions?.modulos.map(m => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </div>

                        {/* Tipo entidad */}
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1 block">Tipo Entidad</label>
                            <select
                                value={filters.entidad_tipo}
                                onChange={(e) => setFilters(f => ({ ...f, entidad_tipo: e.target.value }))}
                                className="w-full h-9 bg-background border border-border rounded-lg text-xs font-medium text-brand-dark px-3 outline-none focus:border-brand-primary cursor-pointer"
                            >
                                <option value="">Todos</option>
                                {filterOptions?.entidad_tipos.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>

                        {/* Desde / Hasta */}
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1 block">Desde</label>
                            <input
                                type="date"
                                value={filters.desde}
                                onChange={(e) => setFilters(f => ({ ...f, desde: e.target.value }))}
                                className="w-full h-9 bg-background border border-border rounded-lg text-xs font-medium text-brand-dark px-3 outline-none focus:border-brand-primary"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1 block">Hasta</label>
                            <input
                                type="date"
                                value={filters.hasta}
                                onChange={(e) => setFilters(f => ({ ...f, hasta: e.target.value }))}
                                className="w-full h-9 bg-background border border-border rounded-lg text-xs font-medium text-brand-dark px-3 outline-none focus:border-brand-primary"
                            />
                        </div>

                        {/* Limpiar */}
                        <div className="flex items-end">
                            <Button
                                variant="glass"
                                size="sm"
                                onClick={clearFilters}
                                disabled={activeFilterCount === 0 && !filters.q}
                                className="w-full"
                            >
                                Limpiar filtros
                            </Button>
                        </div>

                        {/* Línea 3: chips acciones + toggle accesos */}
                        <div className="md:col-span-2 lg:col-span-3 pt-3 border-t border-border space-y-3">
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-2 block">Acción</label>
                                <div className="flex flex-wrap gap-2">
                                    {(filterOptions?.acciones || ['CREATE', 'UPDATE', 'DELETE', 'UPLOAD', 'EMAIL', 'LOGIN']).map(acc => {
                                        const active = filters.accion.includes(acc);
                                        return (
                                            <button
                                                key={acc}
                                                onClick={() => toggleAccion(acc)}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all",
                                                    active
                                                        ? "bg-brand-primary text-white border-brand-primary shadow-md"
                                                        : "bg-background text-muted-foreground border-border hover:border-brand-primary/30"
                                                )}
                                            >
                                                {acc}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
                                <input
                                    type="checkbox"
                                    checked={filters.incluir_logins}
                                    onChange={(e) => setFilters(f => ({ ...f, incluir_logins: e.target.checked }))}
                                    className="h-4 w-4 rounded accent-brand-primary cursor-pointer"
                                />
                                <span className="text-xs font-medium text-brand-dark">Incluir accesos (LOGIN)</span>
                                <span className="text-[10px] text-muted-foreground/70">— ocultos por default para reducir ruido</span>
                            </label>
                        </div>
                    </div>
                )}
            </div>

            {/* ═══ Tabla de logs ═══ */}
            <div className="space-y-2">
                {loading && logs.length === 0 ? (
                    <div className="space-y-2">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="h-16 bg-white rounded-2xl border border-border animate-pulse" />
                        ))}
                    </div>
                ) : logs.length === 0 ? (
                    <div className="h-40 flex flex-col items-center justify-center text-center p-8 bg-white rounded-2xl border border-border border-dashed">
                        <History className="h-8 w-8 text-border mb-2" />
                        <p className="text-sm text-muted-foreground">No hay registros con estos filtros</p>
                        {(activeFilterCount > 0 || filters.q) && (
                            <button onClick={clearFilters} className="text-xs text-brand-primary font-bold mt-2 hover:underline">
                                Limpiar filtros
                            </button>
                        )}
                    </div>
                ) : (
                    logs.map(log => {
                        const parsed = normalizeLogDetail(log.detalle);
                        const resumen = inlineResumen(parsed);
                        const showDetailButton = needsModal(parsed) || (parsed && typeof parsed === 'object' && Object.keys(parsed as any).length > 0);
                        return (
                            <div
                                key={log.id}
                                className="bg-white rounded-2xl border border-border hover:shadow-md hover:border-brand-primary/30 transition-all p-3 flex items-center gap-3"
                            >
                                <div
                                    className="h-9 w-9 rounded-full bg-background flex items-center justify-center shrink-0 border border-border/50"
                                    title={`IP: ${log.ip || '—'}\nUA: ${log.user_agent || '—'}`}
                                >
                                    <User className="h-4 w-4 text-muted-foreground" />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center flex-wrap gap-1.5">
                                        <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0", getActionDisplay(log.accion).color)}>
                                            {getActionDisplay(log.accion).label}
                                        </span>
                                        <span className="text-[11px] font-bold text-brand-dark">{log.usuario_nombre || 'Sistema'}</span>
                                        <span className="text-[10px] text-muted-foreground uppercase">{log.modulo}</span>
                                        {log.entidad_label && (
                                            <span className="text-[11px] font-bold text-brand-primary truncate max-w-[200px]" title={log.entidad_label}>
                                                → {log.entidad_label}
                                            </span>
                                        )}
                                    </div>
                                    {resumen && (
                                        <p className="text-[11px] text-muted-foreground truncate mt-0.5" title={resumen}>
                                            {resumen}
                                        </p>
                                    )}
                                </div>

                                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums" title={log.created_at}>
                                    {format(new Date(log.created_at), "HH:mm · d MMM", { locale: es })}
                                </span>

                                {showDetailButton && (
                                    <button
                                        onClick={() => setOpenLog(log)}
                                        className="text-[10px] font-extrabold text-brand-primary hover:bg-brand-primary/10 px-2 py-1 rounded-full bg-brand-primary/5 transition-all active:scale-95 shrink-0"
                                    >
                                        Detalle
                                    </button>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* ═══ Paginación ═══ */}
            {logs.length > 0 && (
                <div className="bg-white rounded-2xl border border-border p-3 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {total} {total === 1 ? 'registro' : 'registros'} · Página {page} de {totalPages}
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="glass"
                            size="sm"
                            disabled={page === 1 || loading}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            leftIcon={<ChevronLeft className="h-4 w-4" />}
                        >
                            Anterior
                        </Button>
                        <Button
                            variant="glass"
                            size="sm"
                            disabled={page >= totalPages || loading}
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            rightIcon={<ChevronRight className="h-4 w-4" />}
                        >
                            Siguiente
                        </Button>
                    </div>
                </div>
            )}

            {/* ═══ Modal detalle ═══ */}
            {openLog && (
                <Modal
                    isOpen={!!openLog}
                    onClose={() => setOpenLog(null)}
                    title={`Detalle · ${openLog.modulo.toUpperCase()}${openLog.entidad_label ? ` — ${openLog.entidad_label}` : ''}`}
                    size="lg"
                >
                    <DetailModalContent log={openLog} />
                </Modal>
            )}
        </div>
    );
};

const DetailModalContent: React.FC<{ log: Log }> = ({ log }) => {
    const parsed = normalizeLogDetail(log.detalle);
    const responsable = log.usuario_nombre || 'Sistema';

    if (!parsed) return <p className="text-sm text-muted-foreground italic">Sin detalle</p>;
    if (typeof parsed === 'string') return <p className="text-sm text-brand-dark">{parsed}</p>;

    if (typeof parsed === 'object' && (parsed as any).type === 'bulk_asistencia') {
        return <BulkAsistenciaViewer data={parsed as BulkAsistenciaPayload} responsable={responsable} />;
    }
    if (typeof parsed === 'object' && (parsed as any).type === 'compact') {
        const c = parsed as any;
        return <CompactDiffViewer cambios={c.cambios || {}} trabajador={c.trabajador} fecha={c.fecha} responsable={responsable} />;
    }
    if (typeof parsed === 'object' && (parsed as any).type === 'diff') {
        const d = parsed as any;
        return <LegacyDiffViewer antes={d.antes} nuevo={d.nuevo} responsable={responsable} />;
    }
    if (typeof parsed === 'object' && (parsed as any).type === 'summary') {
        const s = parsed as any;
        if (s.datos) return <GenericDetailView parsed={s.datos} responsable={responsable} />;
        return <p className="text-sm text-brand-dark">{s.resumen || 'Sin detalle adicional'}</p>;
    }
    return <GenericDetailView parsed={parsed} responsable={responsable} />;
};

const getActionDisplay = (accion: string) => {
    switch (accion) {
        case 'CREATE': return { label: 'CREAR', color: 'bg-brand-accent/10 text-brand-accent' };
        case 'UPDATE': return { label: 'EDITAR', color: 'bg-warning/10 text-warning' };
        case 'DELETE': return { label: 'BORRAR', color: 'bg-destructive/10 text-destructive' };
        case 'LOGIN': return { label: 'ACCESO', color: 'bg-brand-primary/10 text-brand-primary' };
        case 'UPLOAD': return { label: 'SUBIDA', color: 'bg-[#AF52DE]/10 text-[#AF52DE]' };
        case 'EMAIL': return { label: 'CORREO', color: 'bg-[#5856D6]/10 text-[#5856D6]' };
        default: return { label: accion, color: 'bg-gray-100 text-gray-500' };
    }
};
