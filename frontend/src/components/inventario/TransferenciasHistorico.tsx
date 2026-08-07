import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, RefreshCw, History, Search, ArrowRight } from 'lucide-react';
import api from '../../services/api';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import { SearchableSelect } from '../ui/SearchableSelect';
import { transferenciaRoute } from '../../utils/formatBodega';
import { transferenciaEstadoConfig } from '../../utils/statusConfig';
import type { Transferencia } from '../../types/entities';

/**
 * Histórico general de solicitudes — tabla paginada server-side sobre
 * GET /transferencias (mismo endpoint y scoping que la lista master: sin
 * `ver_todas` el backend devuelve solo las propias + destinadas a su bodega).
 * Manda `incluir_finalizadas=true` SIEMPRE: la razón de ser del histórico es
 * incluir obras concluidas, que la lista normal oculta por política.
 */

const PAGE_SIZE = 50;

const fmtFecha = (s: string) => {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString('es-CL', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
};

interface Props {
    canVerTodas: boolean;
    solicitantes: { id: number; nombre: string }[];
    onOpenDetail: (id: number) => void;
}

const TransferenciasHistorico: React.FC<Props> = ({ canVerTodas, solicitantes, onOpenDetail }) => {
    // Estado y fetch 100% locales: usar useTransferencias clobbearía la lista master.
    const [rows, setRows] = useState<Transferencia[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [estado, setEstado] = useState('');
    const [desde, setDesde] = useState('');
    const [hasta, setHasta] = useState('');
    const [solicitanteId, setSolicitanteId] = useState<number | null>(null);
    const [q, setQ] = useState('');
    const [page, setPage] = useState(1);

    // Debounce de la búsqueda por código (patrón ActivityLogsPanel).
    const qDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [debouncedQ, setDebouncedQ] = useState('');
    useEffect(() => {
        if (qDebounceRef.current) clearTimeout(qDebounceRef.current);
        qDebounceRef.current = setTimeout(() => setDebouncedQ(q), 300);
        return () => {
            if (qDebounceRef.current) clearTimeout(qDebounceRef.current);
        };
    }, [q]);

    const cargar = useCallback(async (p: number) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (estado) params.set('estado', estado);
            if (desde) params.set('fecha_desde', desde);
            if (hasta) params.set('fecha_hasta', hasta);
            if (canVerTodas && solicitanteId) params.set('solicitante_id', String(solicitanteId));
            if (debouncedQ.trim()) params.set('q', debouncedQ.trim());
            params.set('incluir_finalizadas', 'true');
            params.set('page', String(p));
            params.set('limit', String(PAGE_SIZE));
            const res = await api.get<{ data: Transferencia[]; total: number }>(`/transferencias?${params}`);
            setRows(res.data.data);
            setTotal(res.data.total);
        } catch {
            setRows([]);
            setTotal(0);
            setError('No se pudo cargar el histórico. Intenta nuevamente.');
        } finally {
            setLoading(false);
        }
    }, [estado, desde, hasta, solicitanteId, debouncedQ, canVerTodas]);

    // Cambio de filtro → volver a página 1 (si no, un filtro en página 3 muestra vacío).
    useEffect(() => {
        setPage(1);
        cargar(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [estado, desde, hasta, solicitanteId, debouncedQ]);

    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const irPagina = (p: number) => {
        setPage(p);
        cargar(p);
    };

    return (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
            {/* Barra de filtros (patrón MovimientosTab) */}
            <div className="flex flex-wrap items-end gap-3 shrink-0 bg-card border border-border rounded-2xl p-3">
                <div className="flex flex-col gap-1">
                    <label className="text-caption font-semibold text-muted-foreground uppercase">Estado</label>
                    <select
                        value={estado}
                        onChange={(e) => setEstado(e.target.value)}
                        className="h-9 bg-card border border-border rounded-xl px-3 text-sm text-brand-dark focus:outline-none focus:border-brand-primary"
                    >
                        <option value="">Todos</option>
                        {Object.entries(transferenciaEstadoConfig).map(([value, cfg]) => (
                            <option key={value} value={value}>{cfg.label}</option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-caption font-semibold text-muted-foreground uppercase">Desde</label>
                    <input
                        type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
                        className="h-9 bg-card border border-border rounded-xl px-3 text-sm text-brand-dark focus:outline-none focus:border-brand-primary"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-caption font-semibold text-muted-foreground uppercase">Hasta</label>
                    <input
                        type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
                        className="h-9 bg-card border border-border rounded-xl px-3 text-sm text-brand-dark focus:outline-none focus:border-brand-primary"
                    />
                </div>
                {canVerTodas && (
                    <div className="flex flex-col gap-1 min-w-[200px]">
                        <label className="text-caption font-semibold text-muted-foreground uppercase">Solicitante</label>
                        <SearchableSelect
                            placeholder="Todos los solicitantes"
                            value={solicitanteId ?? null}
                            onChange={v => setSolicitanteId(v == null || v === '' ? null : Number(v))}
                            options={solicitantes.map(u => ({ value: u.id, label: u.nombre }))}
                        />
                    </div>
                )}
                <div className="flex flex-col gap-1">
                    <label className="text-caption font-semibold text-muted-foreground uppercase">Código</label>
                    <div className="relative flex items-center">
                        <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <input
                            type="text"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="TRF-..."
                            className="h-9 w-40 bg-card border border-border rounded-xl pl-8 pr-3 text-sm text-brand-dark focus:outline-none focus:border-brand-primary"
                        />
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cargar(page)}
                    leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                    className="text-xs font-bold"
                >
                    Actualizar
                </Button>
            </div>

            {/* Tabla */}
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar bg-card border border-border rounded-2xl">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
                        <p className="mt-3 text-sm text-muted-foreground">Cargando histórico...</p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                        <History className="h-10 w-10 text-muted-foreground/40" />
                        <p className="mt-3 text-sm text-muted-foreground">{error}</p>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                        <History className="h-10 w-10 text-muted-foreground/40" />
                        <p className="mt-3 text-sm font-semibold text-brand-dark">Sin solicitudes</p>
                        <p className="text-xs text-muted-foreground">No hay registros para los filtros seleccionados.</p>
                    </div>
                ) : (
                    <table className="w-full min-w-[760px] text-sm">
                        <thead className="sticky top-0 bg-brand-primary border-b border-border z-10">
                            <tr className="text-caption font-bold text-white uppercase tracking-wide">
                                <th className="text-left px-3 py-2.5">Código</th>
                                <th className="text-left px-3 py-2.5">Estado</th>
                                <th className="text-left px-3 py-2.5">Tipo</th>
                                <th className="text-left px-3 py-2.5">Origen → Destino</th>
                                <th className="text-left px-3 py-2.5">Solicitante</th>
                                <th className="text-left px-3 py-2.5">Fecha</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((t) => {
                                const ruta = transferenciaRoute(t);
                                return (
                                    <tr
                                        key={t.id}
                                        onClick={() => onOpenDetail(t.id)}
                                        className="border-b border-border cursor-pointer hover:bg-muted transition-colors"
                                        title="Ver detalle"
                                    >
                                        <td className="px-3 py-2 font-bold text-brand-dark whitespace-nowrap">{t.codigo}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <StatusBadge domain="transferencia" status={t.estado} showIcon />
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <StatusBadge domain="tipoFlujo" status={t.tipo_flujo || 'solicitud'} />
                                        </td>
                                        <td className="px-3 py-2 text-label">
                                            <span className="inline-flex items-center gap-1 text-foreground font-medium">
                                                <span>{ruta.origen}</span>
                                                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                                <span>{ruta.destino}</span>
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-label text-muted-foreground whitespace-nowrap">{t.solicitante_nombre || '—'}</td>
                                        <td className="px-3 py-2 text-label text-muted-foreground whitespace-nowrap">{fmtFecha(t.fecha_solicitud)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Paginación (patrón MovimientosTab) */}
            {total > 0 && (
                <div className="flex items-center justify-between shrink-0 text-xs text-muted-foreground px-1">
                    <span>{total} {total === 1 ? 'solicitud' : 'solicitudes'} · página {page} de {pages}</span>
                    {pages > 1 && (
                        <div className="flex gap-1">
                            {/* eslint-disable-next-line no-restricted-syntax -- paginación */}
                            <button
                                disabled={page <= 1}
                                onClick={() => irPagina(page - 1)}
                                className="px-3 py-1.5 rounded-lg border border-border font-bold disabled:opacity-40 hover:bg-muted transition-all"
                            >Anterior</button>
                            {/* eslint-disable-next-line no-restricted-syntax -- paginación */}
                            <button
                                disabled={page >= pages}
                                onClick={() => irPagina(page + 1)}
                                className="px-3 py-1.5 rounded-lg border border-border font-bold disabled:opacity-40 hover:bg-muted transition-all"
                            >Siguiente</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TransferenciasHistorico;
