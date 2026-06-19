import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, ArrowUp, ArrowDown, RefreshCw, History } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { useMovimientos, type TipoMovimiento } from '../../hooks/inventario/useMovimientos';

// Etiquetas + estilos por tipo de movimiento (kardex).
const TIPO_META: Record<TipoMovimiento, { label: string; badge: string }> = {
    ajuste_manual:          { label: 'Ajuste manual',     badge: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-800/60' },
    transferencia_salida:   { label: 'Transf. salida',    badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-800/60' },
    transferencia_entrada:  { label: 'Transf. entrada',   badge: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-800/60' },
    discrepancia:           { label: 'Diferencia',        badge: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-800/60' },
    factura:                { label: 'Factura',           badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-800/60' },
    recepcion:              { label: 'Recepción',         badge: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-800/60' },
};

const TIPOS: TipoMovimiento[] = [
    'ajuste_manual', 'transferencia_salida', 'transferencia_entrada',
    'discrepancia', 'factura', 'recepcion',
];

const fmtFecha = (s: string) => {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString('es-CL', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
};

const fmtNum = (n: number | string) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return String(n);
    // Mostrar decimales solo si los hay (kg/m³ pueden tener fracción).
    return Number.isInteger(v) ? v.toLocaleString('es-CL') : v.toLocaleString('es-CL', { maximumFractionDigits: 4 });
};

interface Props {
    /** Filtro opcional por ubicación preseleccionada. */
    obraIdInicial?: number | null;
    bodegaIdInicial?: number | null;
}

const MovimientosTab: React.FC<Props> = ({ obraIdInicial = null, bodegaIdInicial = null }) => {
    const { movimientos, pagination, loading, error, fetchMovimientos } = useMovimientos();

    const [tipo, setTipo] = useState<TipoMovimiento | ''>('');
    const [desde, setDesde] = useState('');
    const [hasta, setHasta] = useState('');
    const [page, setPage] = useState(1);

    const cargar = useCallback((p = page) => {
        fetchMovimientos({
            tipo: tipo || undefined,
            desde: desde || undefined,
            hasta: hasta || undefined,
            obra_id: obraIdInicial || undefined,
            bodega_id: bodegaIdInicial || undefined,
            page: p,
            limit: 50,
        });
    }, [fetchMovimientos, tipo, desde, hasta, obraIdInicial, bodegaIdInicial, page]);

    // Carga inicial + cuando cambian filtros (reset a página 1).
    useEffect(() => {
        setPage(1);
        cargar(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tipo, desde, hasta, obraIdInicial, bodegaIdInicial]);

    const irPagina = (p: number) => {
        setPage(p);
        cargar(p);
    };

    return (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
            {/* Barra de filtros */}
            <div className="flex flex-wrap items-end gap-3 shrink-0 bg-card border border-border rounded-2xl p-3">
                <div className="flex flex-col gap-1">
                    <label className="text-caption font-semibold text-muted-foreground uppercase">Tipo</label>
                    <select
                        value={tipo}
                        onChange={(e) => setTipo(e.target.value as TipoMovimiento | '')}
                        className="h-9 bg-card border border-border rounded-xl px-3 text-sm text-brand-dark focus:outline-none focus:border-brand-primary"
                    >
                        <option value="">Todos</option>
                        {TIPOS.map(t => (
                            <option key={t} value={t}>{TIPO_META[t].label}</option>
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

            {/* Contenido */}
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar bg-card border border-border rounded-2xl">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
                        <p className="mt-3 text-sm text-muted-foreground">Cargando movimientos...</p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                        <History className="h-10 w-10 text-muted-foreground/40" />
                        <p className="mt-3 text-sm text-muted-foreground">{error}</p>
                    </div>
                ) : movimientos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                        <History className="h-10 w-10 text-muted-foreground/40" />
                        <p className="mt-3 text-sm font-semibold text-brand-dark">Sin movimientos</p>
                        <p className="text-xs text-muted-foreground">No hay registros para los filtros seleccionados.</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-brand-primary border-b border-border z-10">
                            <tr className="text-caption font-bold text-white uppercase tracking-wide">
                                <th className="text-left px-3 py-2.5">Fecha</th>
                                <th className="text-left px-3 py-2.5">Tipo</th>
                                <th className="text-left px-3 py-2.5">Ítem</th>
                                <th className="text-left px-3 py-2.5">Ubicación</th>
                                <th className="text-right px-3 py-2.5">Antes</th>
                                <th className="text-right px-3 py-2.5">Después</th>
                                <th className="text-right px-3 py-2.5">Δ</th>
                                <th className="text-left px-3 py-2.5">Motivo</th>
                                <th className="text-left px-3 py-2.5">Usuario</th>
                            </tr>
                        </thead>
                        <tbody>
                            {movimientos.map((m) => {
                                const meta = TIPO_META[m.tipo] || { label: m.tipo, badge: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-800/60' };
                                const delta = Number(m.delta);
                                const ubic = m.obra_nombre || m.bodega_nombre || '—';
                                return (
                                    <tr key={m.id} className="border-b border-border hover:bg-muted transition-colors">
                                        <td className="px-3 py-2 text-label text-muted-foreground whitespace-nowrap">{fmtFecha(m.created_at)}</td>
                                        <td className="px-3 py-2">
                                            <span className={cn('inline-block px-2 py-0.5 rounded-md text-caption font-bold border', meta.badge)}>
                                                {meta.label}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className="font-semibold text-brand-dark">#{m.nro_item}</span>
                                            <span className="text-label text-muted-foreground ml-1.5">{m.item_descripcion}</span>
                                        </td>
                                        <td className="px-3 py-2 text-label">
                                            {m.obra_nombre
                                                ? <span className="text-foreground font-medium">{ubic}</span>
                                                : <span className="text-foreground font-medium">{ubic}</span>}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtNum(m.cantidad_anterior)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-brand-dark">{fmtNum(m.cantidad_nueva)}</td>
                                        <td className={cn(
                                            'px-3 py-2 text-right tabular-nums font-bold flex items-center justify-end gap-0.5',
                                            delta > 0 ? 'text-green-700 dark:text-green-300' : delta < 0 ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground'
                                        )}>
                                            {delta > 0 && <ArrowUp className="h-3 w-3" />}
                                            {delta < 0 && <ArrowDown className="h-3 w-3" />}
                                            {fmtNum(Math.abs(delta))}
                                        </td>
                                        <td className="px-3 py-2 text-label text-muted-foreground max-w-[200px] truncate" title={m.motivo || ''}>{m.motivo || '—'}</td>
                                        <td className="px-3 py-2 text-label text-muted-foreground">{m.usuario_nombre || '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Paginación */}
            {pagination && pagination.pages > 1 && (
                <div className="flex items-center justify-between shrink-0 text-xs text-muted-foreground px-1">
                    <span>{pagination.total} movimientos · página {pagination.page} de {pagination.pages}</span>
                    <div className="flex gap-1">
                        {/* eslint-disable-next-line no-restricted-syntax -- paginación */}
                        <button
                            disabled={page <= 1}
                            onClick={() => irPagina(page - 1)}
                            className="px-3 py-1.5 rounded-lg border border-border font-bold disabled:opacity-40 hover:bg-muted transition-all"
                        >Anterior</button>
                        {/* eslint-disable-next-line no-restricted-syntax -- paginación */}
                        <button
                            disabled={page >= pagination.pages}
                            onClick={() => irPagina(page + 1)}
                            className="px-3 py-1.5 rounded-lg border border-border font-bold disabled:opacity-40 hover:bg-muted transition-all"
                        >Siguiente</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MovimientosTab;
