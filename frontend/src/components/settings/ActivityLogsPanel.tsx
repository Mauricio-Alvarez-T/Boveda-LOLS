import React, { useState, useEffect } from 'react';
import { Search, History, User, Globe, Cpu, Clock, ChevronLeft, ChevronRight, Building2, Users, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { cn } from '../../utils/cn';
import { normalizeLogDetail, getLabel, type LogDetail, type BulkAsistenciaTrabajador } from '../../utils/logNormalizer';

interface Log {
    id: number;
    usuario_id: number;
    usuario_nombre: string;
    modulo: string;
    accion: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'UPLOAD' | 'EMAIL';
    item_id: string;
    detalle: string;
    ip: string;
    user_agent: string;
    created_at: string;
}

// ─── Visualizador de Cambios (formato compacto: { campo: { de, a } }) ───
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
            {/* Header contextual estilo Apple Card */}
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

            {/* Lista de cambios */}
            <div className="space-y-3">
                {keys.map(key => (
                    <div key={key} className="bg-white rounded-2xl border border-border overflow-hidden">
                        <div className="px-5 py-3 bg-background border-b border-border flex items-center justify-between">
                            <span className="text-xs font-black text-brand-dark uppercase tracking-widest opacity-80">{getLabel(key)}</span>
                            <div className="h-2 w-2 rounded-full bg-brand-primary opacity-50" />
                        </div>

                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* Estado Anterior */}
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

                            {/* Estado Actual */}
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

// ─── Legacy Diff Viewer (formato { antes, nuevo }) ───
const LegacyDiffViewer: React.FC<{ antes: any, nuevo: any, responsable?: string }> = ({ antes, nuevo, responsable }) => {
    const ignoredKeys = new Set(['id', 'created_at', 'updated_at', 'usuario_id', 'password', 'password_hash']);
    const allKeys = Array.from(new Set([...Object.keys(antes || {}), ...Object.keys(nuevo || {})]));
    const normalize = (v: any) => (v === null || v === undefined || v === '') ? null : v;
    const changedKeys = allKeys.filter(k => {
        if (ignoredKeys.has(k)) return false;
        return JSON.stringify(normalize(antes?.[k])) !== JSON.stringify(normalize(nuevo?.[k]));
    });

    if (changedKeys.length === 0) return <p className="text-sm font-medium text-muted-foreground italic">Sin cambios detectados</p>;

    // Convert to compact format and reuse viewer
    const cambios: Record<string, { de: any, a: any }> = {};
    for (const k of changedKeys) {
        cambios[k] = { de: antes?.[k] ?? null, a: nuevo?.[k] ?? null };
    }
    return <CompactDiffViewer cambios={cambios} responsable={responsable} />;
};

// ─── Vista expandida genérica (para CREATEs legacy con datos planos) ───
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

// ─── Viewer para bulk_asistencia (toma masiva agrupada por obra) ───
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
            {/* Header */}
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

            {/* Contadores */}
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

            {/* Lista de trabajadores */}
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

// ─── Componente principal de detalle por log ───
const LogDetails: React.FC<{ detail: string, modulo: string, responsable: string }> = ({ detail, modulo, responsable }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    if (!detail) return <span className="text-xs text-muted-foreground italic">Sin detalle</span>;

    const parsed = normalizeLogDetail(detail);
    if (typeof parsed === 'string') return <p className="text-[11px] text-brand-dark leading-snug break-all">{parsed}</p>;
    if (!parsed || (typeof parsed === 'object' && Object.keys(parsed).length === 0)) return <span className="text-xs text-muted-foreground italic">—</span>;

    // ── BULK ASISTENCIA: { type: 'bulk_asistencia', ... } ──
    if (typeof parsed === 'object' && 'type' in parsed && parsed.type === 'bulk_asistencia') {
        const bulk = parsed as BulkAsistenciaPayload;
        return (
            <>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[9px] font-bold bg-brand-primary/10 text-brand-primary px-1 rounded">TOMA MASIVA:</span>
                    <span className="text-[11px] font-bold text-brand-dark">{bulk.obra_nombre}</span>
                    <span className="text-[10px] text-muted-foreground">· {bulk.total} trabajadores</span>
                    {bulk.actualizados > 0 && (
                        <span className="text-[9px] font-bold bg-warning/10 text-warning px-1.5 py-0.5 rounded">
                            {bulk.actualizados} modif.
                        </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">• {formatFechaAsistencia(bulk.fecha_asistencia)}</span>
                    <button onClick={() => setIsModalOpen(true)} className="text-[10px] font-extrabold text-brand-primary hover:bg-brand-primary/10 px-2 py-0.5 rounded-full bg-brand-primary/5 ml-1 transition-all active:scale-95">
                        Ver toma completa
                    </button>
                </div>
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Toma de asistencia — ${bulk.obra_nombre}`} size="lg">
                    <BulkAsistenciaViewer data={bulk} responsable={responsable} />
                </Modal>
            </>
        );
    }

    // ── NUEVO FORMATO COMPACTO: { type: 'compact', cambios, resumen } ──
    if (typeof parsed === 'object' && 'type' in parsed && parsed.type === 'compact') {
        const compact = parsed as { type: 'compact'; cambios: Record<string, { de: any; a: any }>; resumen?: string; trabajador?: string; fecha?: string };
        const changedKeys = Object.keys(compact.cambios || {}).slice(0, 3);
        return (
            <>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[9px] font-bold bg-warning/10 text-warning px-1 rounded">CAMBIO EN:</span>
                    {changedKeys.map(key => (
                        <span key={key} className="text-[10px] font-semibold text-brand-dark">{getLabel(key)}</span>
                    ))}
                    {compact.trabajador && <span className="text-[10px] text-muted-foreground">• {compact.trabajador}</span>}
                    <button onClick={() => setIsModalOpen(true)} className="text-[10px] font-extrabold text-brand-primary hover:bg-brand-primary/10 px-2 py-0.5 rounded-full bg-brand-primary/5 ml-1 transition-all active:scale-95">
                        Ver cambios
                    </button>
                </div>
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Cambios - ${modulo.toUpperCase()}`} size="lg">
                    <CompactDiffViewer cambios={compact.cambios} trabajador={compact.trabajador} fecha={compact.fecha} responsable={responsable} />
                </Modal>
            </>
        );
    }

    // ── NUEVO FORMATO RESUMEN: { type: 'summary', resumen } ──
    if (typeof parsed === 'object' && 'type' in parsed && parsed.type === 'summary') {
        const summary = parsed as { type: 'summary'; resumen: string; datos?: Record<string, unknown> };
        const hasData = !!summary.datos;
        return (
            <>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-[11px] text-brand-dark leading-snug">{summary.resumen || 'Sin resumen'}</p>
                    {hasData && (
                        <button onClick={() => setIsModalOpen(true)} className="text-[10px] font-extrabold text-brand-primary hover:bg-brand-primary/10 px-2 py-0.5 rounded-full bg-brand-primary/5 ml-1 transition-all active:scale-95">
                            Ver detalles
                        </button>
                    )}
                </div>
                {hasData && (
                    <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Detalle - ${modulo.toUpperCase()}`} size="lg">
                        <GenericDetailView parsed={summary.datos} responsable={responsable} />
                    </Modal>
                )}
            </>
        );
    }

    // ── LEGACY DIFF: { type: 'diff', antes, nuevo } ──
    if (typeof parsed === 'object' && 'type' in parsed && parsed.type === 'diff') {
        const diff = parsed as { type: 'diff'; antes: Record<string, any>; nuevo: Record<string, any> };
        const ignoredKeys = new Set(['id', 'created_at', 'updated_at', 'usuario_id', 'password', 'password_hash']);
        const normalize = (v: any) => (v === null || v === undefined || v === '') ? null : v;
        const allKeys = Array.from(new Set([...Object.keys(diff.antes || {}), ...Object.keys(diff.nuevo || {})]));
        const changedKeys = allKeys.filter(k => {
            if (ignoredKeys.has(k)) return false;
            return JSON.stringify(normalize(diff.antes?.[k])) !== JSON.stringify(normalize(diff.nuevo?.[k]));
        });
        const displayKeys = changedKeys.slice(0, 3);

        return (
            <>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[9px] font-bold bg-warning/10 text-warning px-1 rounded">CAMBIO EN:</span>
                    {displayKeys.length > 0 ? displayKeys.map(key => (
                        <span key={key} className="text-[10px] font-semibold text-brand-dark">{getLabel(key)}</span>
                    )) : (
                        <span className="text-[10px] text-muted-foreground italic">Sin diferencias</span>
                    )}
                    <button onClick={() => setIsModalOpen(true)} className="text-[10px] font-extrabold text-brand-primary hover:bg-brand-primary/10 px-2 py-0.5 rounded-full bg-brand-primary/5 ml-1 transition-all active:scale-95">
                        Ver cambios
                    </button>
                </div>
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Cambios - ${modulo.toUpperCase()}`} size="lg">
                    <LegacyDiffViewer antes={diff.antes} nuevo={diff.nuevo} responsable={responsable} />
                </Modal>
            </>
        );
    }

    // ── LEGACY PLAIN OBJECT (CREATE antiguo) ──
    const entries = Object.entries(parsed as Record<string, unknown>);
    const summaryEntries = entries.slice(0, 3);

    return (
        <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {summaryEntries.map(([key, value]) => (
                    <div key={key} className="flex items-center gap-1.5 min-w-fit">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">{getLabel(key)}:</span>
                        <span className="text-[11px] text-brand-dark">
                            {value === null || value === undefined ? '—' : (Array.isArray(value) ? `${value.length} elem.` : (typeof value === 'object' ? '{...}' : String(value)))}
                        </span>
                    </div>
                ))}
                {entries.length > 3 && (
                    <button onClick={() => setIsModalOpen(true)} className="text-[10px] font-extrabold text-brand-primary hover:bg-brand-primary/10 px-2 py-0.5 rounded-full bg-brand-primary/5 ml-1 transition-all active:scale-95">
                        Ver todos (+{entries.length - 3})
                    </button>
                )}
            </div>
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Detalle - ${modulo.toUpperCase()}`} size="lg">
                <GenericDetailView parsed={parsed} responsable={responsable} />
            </Modal>
        </>
    );
};

export const ActivityLogsPanel: React.FC = () => {
    const [logs, setLogs] = useState<Log[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [hasMore, setHasMore] = useState(false);

    const fetchLogs = async (pageNum: number) => {
        setLoading(true);
        try {
            const res = await api.get(`/logs?page=${pageNum}&q=${search}&limit=20`);
            setLogs(res.data.data);
            setHasMore(res.data.data.length === 20);
        } catch (err) {
            console.error('Error fetching logs', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs(page);
    }, [page, search]);

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

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-border p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por módulo o detalle..."
                        className="pl-10"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="glass"
                        size="sm"
                        disabled={page === 1}
                        onClick={() => setPage(prev => prev - 1)}
                        leftIcon={<ChevronLeft className="h-4 w-4" />}
                    >
                        Anterior
                    </Button>
                    <span className="text-sm font-medium text-muted-foreground px-2">Página {page}</span>
                    <Button
                        variant="glass"
                        size="sm"
                        disabled={!hasMore}
                        onClick={() => setPage(prev => prev + 1)}
                        rightIcon={<ChevronRight className="h-4 w-4" />}
                    >
                        Siguiente
                    </Button>
                </div>
            </div>

            <div className="space-y-3">
                {logs.map(log => (
                    <div key={log.id} className="bg-white rounded-2xl border border-border overflow-hidden hover:shadow-md transition-shadow">
                        <div className="p-4 flex flex-col md:flex-row gap-4 items-start md:items-center">
                            <div className="flex items-center gap-3 min-w-[150px]">
                                <div className="h-8 w-8 bg-background rounded-full flex items-center justify-center shrink-0">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-brand-dark truncate">{log.usuario_nombre || 'Sistema'}</p>
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <Clock className="h-3 w-3" />
                                        {format(new Date(log.created_at), "HH:mm 'del' d 'de' MMM", { locale: es })}
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider", getActionDisplay(log.accion).color)}>
                                        {getActionDisplay(log.accion).label}
                                    </span>
                                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight">{log.modulo}</span>
                                </div>
                                <div className="mt-1">
                                    <LogDetails detail={log.detalle} modulo={log.modulo} responsable={log.usuario_nombre} />
                                </div>
                            </div>

                            <div className="flex items-center gap-4 text-muted-foreground shrink-0">
                                <div className="flex items-center gap-1" title={log.ip}>
                                    <Globe className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-medium">{log.ip}</span>
                                </div>
                                <div className="flex items-center gap-1 max-w-[100px]" title={log.user_agent}>
                                    <Cpu className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-medium truncate">{log.user_agent?.split(' ')[0]}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {!loading && logs.length === 0 && (
                    <div className="h-40 flex flex-col items-center justify-center text-center p-8 bg-white rounded-2xl border border-border border-dashed">
                        <History className="h-8 w-8 text-border mb-2" />
                        <p className="text-sm text-muted-foreground">No hay registros encontrados</p>
                    </div>
                )}
            </div>
        </div>
    );
};
