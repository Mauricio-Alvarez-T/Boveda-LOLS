import React, { useState, useEffect } from 'react';
import { Search, History, User, Globe, Cpu, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { cn } from '../../utils/cn';
import { normalizeLogDetail, getLabel } from '../../utils/logNormalizer';

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
        <div className="flex flex-col items-center justify-center p-8 text-center bg-[#F5F5F7] rounded-2xl border border-dashed border-[#D2D2D7]">
            <History className="h-8 w-8 text-[#8E8E93] mb-2 opacity-50" />
            <p className="text-sm text-[#6E6E73] font-medium italic">Sin cambios detectados en este registro</p>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header contextual estilo Apple Card */}
            <div className="bg-white p-4 rounded-2xl border border-[#D2D2D7] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-[#0071E3]/5 rounded-full flex items-center justify-center">
                        <History className="h-5 w-5 text-[#0071E3]" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-[#1D1D1F] uppercase tracking-tight">Detalle de Cambios</h4>
                        <p className="text-xs text-[#6E6E73] font-medium">Comparativa de valores modificados</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {responsable && (
                        <div className="flex items-center gap-2 bg-[#0071E3]/5 px-3 py-1.5 rounded-full border border-[#0071E3]/10">
                            <span className="text-[10px] font-bold text-[#0071E3] uppercase tracking-tighter">Hecho por:</span>
                            <span className="text-xs font-bold text-[#1D1D1F]">{responsable}</span>
                        </div>
                    )}
                    {trabajador && (
                        <div className="flex items-center gap-2 bg-[#F5F5F7] px-3 py-1.5 rounded-full border border-[#D2D2D7]/50">
                            <User className="h-3.5 w-3.5 text-[#6E6E73]" />
                            <span className="text-xs font-semibold text-[#1D1D1F]">{trabajador}</span>
                        </div>
                    )}
                    {fecha && (
                        <div className="flex items-center gap-2 bg-[#F5F5F7] px-3 py-1.5 rounded-full border border-[#D2D2D7]/50">
                            <Clock className="h-3.5 w-3.5 text-[#6E6E73]" />
                            <span className="text-xs font-semibold text-[#1D1D1F]">{fecha}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Lista de cambios */}
            <div className="space-y-3">
                {keys.map(key => (
                    <div key={key} className="bg-white rounded-2xl border border-[#D2D2D7] overflow-hidden">
                        <div className="px-5 py-3 bg-[#F5F5F7] border-b border-[#D2D2D7] flex items-center justify-between">
                            <span className="text-xs font-black text-[#1D1D1F] uppercase tracking-widest opacity-80">{getLabel(key)}</span>
                            <div className="h-2 w-2 rounded-full bg-[#0071E3] opacity-50" />
                        </div>

                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* Estado Anterior */}
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <div className="h-2 w-2 rounded-full bg-[#FF3B30] opacity-40" />
                                    <span className="text-[10px] font-black text-[#1D1D1F] uppercase tracking-widest">Valor Anterior</span>
                                </div>
                                <div className="bg-[#FF3B30]/5 p-4 rounded-xl border border-[#FF3B30]/10 min-h-[56px] flex items-center">
                                    <span className="text-base text-[#FF3B30] font-medium line-through decoration-[#FF3B30]/30 underline-offset-4 decoration-2">
                                        {cambios[key].de ?? '—'}
                                    </span>
                                </div>
                            </div>

                            {/* Estado Actual */}
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <div className="h-2 w-2 rounded-full bg-[#34C759] opacity-40" />
                                    <span className="text-[10px] font-black text-[#1D1D1F] uppercase tracking-widest">Valor Actualizado</span>
                                </div>
                                <div className="bg-[#34C759]/5 p-4 rounded-xl border border-[#34C759]/10 min-h-[56px] flex items-center">
                                    <span className="text-base text-[#1D1D1F] font-bold">
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

    if (changedKeys.length === 0) return <p className="text-sm font-medium text-[#6E6E73] italic">Sin cambios detectados</p>;

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
            <div className="bg-white p-5 rounded-2xl border border-[#D2D2D7] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="h-12 w-12 bg-[#8E8E93]/10 rounded-full flex items-center justify-center">
                        <History className="h-6 w-6 text-[#8E8E93]" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-[#1D1D1F] uppercase tracking-tight">Datos del Registro</h4>
                        <p className="text-xs text-[#6E6E73] font-medium">Información completa almacenada</p>
                    </div>
                </div>
                {responsable && (
                    <div className="bg-[#0071E3]/5 px-3 py-1.5 rounded-full border border-[#0071E3]/10 flex items-center gap-2">
                        <span className="text-[10px] font-bold text-[#0071E3] uppercase tracking-tighter">Registrado por:</span>
                        <span className="text-xs font-bold text-[#1D1D1F]">{responsable}</span>
                    </div>
                )}
            </div>

            <div className="bg-white rounded-2xl border border-[#D2D2D7] overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2">
                    {Object.entries(parsed).map(([key, value], index) => {
                        if (typeof value === 'object' && value !== null && !Array.isArray(value)) return null;
                        return (
                            <div key={key} className={cn(
                                "p-5 flex flex-col gap-2 border-[#F5F5F7]",
                                index % 2 === 0 ? "md:border-r" : "",
                                index < Object.entries(parsed).length - 2 ? "border-b" : ""
                            )}>
                                <span className="text-xs font-black text-[#8E8E93] uppercase tracking-widest leading-none mb-0.5">
                                    {getLabel(key)}
                                </span>
                                <span className="text-base text-[#1D1D1F] font-semibold tracking-tight">
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

// ─── Componente principal de detalle por log ───
const LogDetails: React.FC<{ detail: string, modulo: string, responsable: string }> = ({ detail, modulo, responsable }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    if (!detail) return <span className="text-xs text-[#6E6E73] italic">Sin detalle</span>;

    const parsed = normalizeLogDetail(detail);
    if (typeof parsed === 'string') return <p className="text-[11px] text-[#1D1D1F] leading-snug break-all">{parsed}</p>;
    if (!parsed || Object.keys(parsed).length === 0) return <span className="text-xs text-[#6E6E73] italic">—</span>;

    // ── NUEVO FORMATO COMPACTO: { type: 'compact', cambios, resumen } ──
    if (parsed.type === 'compact') {
        const changedKeys = Object.keys(parsed.cambios || {}).slice(0, 3);
        return (
            <>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[9px] font-bold bg-[#FF9F0A]/10 text-[#FF9F0A] px-1 rounded">CAMBIO EN:</span>
                    {changedKeys.map(key => (
                        <span key={key} className="text-[10px] font-semibold text-[#1D1D1F]">{getLabel(key)}</span>
                    ))}
                    {parsed.trabajador && <span className="text-[10px] text-[#6E6E73]">• {parsed.trabajador}</span>}
                    <button onClick={() => setIsModalOpen(true)} className="text-[10px] font-extrabold text-[#0071E3] hover:bg-[#0071E3]/10 px-2 py-0.5 rounded-full bg-[#0071E3]/5 ml-1 transition-all active:scale-95">
                        Ver cambios
                    </button>
                </div>
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Cambios - ${modulo.toUpperCase()}`} size="lg">
                    <CompactDiffViewer cambios={parsed.cambios} trabajador={parsed.trabajador} fecha={parsed.fecha} responsable={responsable} />
                </Modal>
            </>
        );
    }

    // ── NUEVO FORMATO RESUMEN: { type: 'summary', resumen } ──
    if (parsed.type === 'summary') {
        const hasData = !!parsed.datos;
        return (
            <>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-[11px] text-[#1D1D1F] leading-snug">{parsed.resumen || 'Sin resumen'}</p>
                    {hasData && (
                        <button onClick={() => setIsModalOpen(true)} className="text-[10px] font-extrabold text-[#0071E3] hover:bg-[#0071E3]/10 px-2 py-0.5 rounded-full bg-[#0071E3]/5 ml-1 transition-all active:scale-95">
                            Ver detalles
                        </button>
                    )}
                </div>
                {hasData && (
                    <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Detalle - ${modulo.toUpperCase()}`} size="lg">
                        <GenericDetailView parsed={parsed.datos} responsable={responsable} />
                    </Modal>
                )}
            </>
        );
    }

    // ── LEGACY DIFF: { type: 'diff', antes, nuevo } ──
    if (parsed.type === 'diff') {
        const ignoredKeys = new Set(['id', 'created_at', 'updated_at', 'usuario_id', 'password', 'password_hash']);
        const normalize = (v: any) => (v === null || v === undefined || v === '') ? null : v;
        const allKeys = Array.from(new Set([...Object.keys(parsed.antes || {}), ...Object.keys(parsed.nuevo || {})]));
        const changedKeys = allKeys.filter(k => {
            if (ignoredKeys.has(k)) return false;
            return JSON.stringify(normalize(parsed.antes?.[k])) !== JSON.stringify(normalize(parsed.nuevo?.[k]));
        });
        const displayKeys = changedKeys.slice(0, 3);

        return (
            <>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[9px] font-bold bg-[#FF9F0A]/10 text-[#FF9F0A] px-1 rounded">CAMBIO EN:</span>
                    {displayKeys.length > 0 ? displayKeys.map(key => (
                        <span key={key} className="text-[10px] font-semibold text-[#1D1D1F]">{getLabel(key)}</span>
                    )) : (
                        <span className="text-[10px] text-[#6E6E73] italic">Sin diferencias</span>
                    )}
                    <button onClick={() => setIsModalOpen(true)} className="text-[10px] font-extrabold text-[#0071E3] hover:bg-[#0071E3]/10 px-2 py-0.5 rounded-full bg-[#0071E3]/5 ml-1 transition-all active:scale-95">
                        Ver cambios
                    </button>
                </div>
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Cambios - ${modulo.toUpperCase()}`} size="lg">
                    <LegacyDiffViewer antes={parsed.antes} nuevo={parsed.nuevo} responsable={responsable} />
                </Modal>
            </>
        );
    }

    // ── LEGACY PLAIN OBJECT (CREATE antiguo) ──
    const entries = Object.entries(parsed);
    const summaryEntries = entries.slice(0, 3);

    return (
        <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {summaryEntries.map(([key, value]) => (
                    <div key={key} className="flex items-center gap-1.5 min-w-fit">
                        <span className="text-[10px] font-bold text-[#6E6E73] uppercase tracking-tight">{getLabel(key)}:</span>
                        <span className="text-[11px] text-[#1D1D1F]">
                            {value === null || value === undefined ? '—' : (Array.isArray(value) ? `${value.length} elem.` : (typeof value === 'object' ? '{...}' : String(value)))}
                        </span>
                    </div>
                ))}
                {entries.length > 3 && (
                    <button onClick={() => setIsModalOpen(true)} className="text-[10px] font-extrabold text-[#0071E3] hover:bg-[#0071E3]/10 px-2 py-0.5 rounded-full bg-[#0071E3]/5 ml-1 transition-all active:scale-95">
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
            case 'CREATE': return { label: 'CREAR', color: 'bg-[#34C759]/10 text-[#34C759]' };
            case 'UPDATE': return { label: 'EDITAR', color: 'bg-[#FF9F0A]/10 text-[#FF9F0A]' };
            case 'DELETE': return { label: 'BORRAR', color: 'bg-[#FF3B30]/10 text-[#FF3B30]' };
            case 'LOGIN': return { label: 'ACCESO', color: 'bg-[#0071E3]/10 text-[#0071E3]' };
            case 'UPLOAD': return { label: 'SUBIDA', color: 'bg-[#AF52DE]/10 text-[#AF52DE]' };
            case 'EMAIL': return { label: 'CORREO', color: 'bg-[#5856D6]/10 text-[#5856D6]' };
            default: return { label: accion, color: 'bg-gray-100 text-gray-500' };
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-[#D2D2D7] p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6E6E73]" />
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
                    <span className="text-sm font-medium text-[#6E6E73] px-2">Página {page}</span>
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
                    <div key={log.id} className="bg-white rounded-2xl border border-[#D2D2D7] overflow-hidden hover:shadow-md transition-shadow">
                        <div className="p-4 flex flex-col md:flex-row gap-4 items-start md:items-center">
                            <div className="flex items-center gap-3 min-w-[150px]">
                                <div className="h-8 w-8 bg-[#F5F5F7] rounded-full flex items-center justify-center shrink-0">
                                    <User className="h-4 w-4 text-[#6E6E73]" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-[#1D1D1F] truncate">{log.usuario_nombre || 'Sistema'}</p>
                                    <div className="flex items-center gap-1 text-[10px] text-[#6E6E73]">
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
                                    <span className="text-[11px] font-bold text-[#6E6E73] uppercase tracking-tight">{log.modulo}</span>
                                </div>
                                <div className="mt-1">
                                    <LogDetails detail={log.detalle} modulo={log.modulo} responsable={log.usuario_nombre} />
                                </div>
                            </div>

                            <div className="flex items-center gap-4 text-[#6E6E73] shrink-0">
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
                    <div className="h-40 flex flex-col items-center justify-center text-center p-8 bg-white rounded-2xl border border-[#D2D2D7] border-dashed">
                        <History className="h-8 w-8 text-[#D2D2D7] mb-2" />
                        <p className="text-sm text-[#6E6E73]">No hay registros encontrados</p>
                    </div>
                )}
            </div>
        </div>
    );
};
