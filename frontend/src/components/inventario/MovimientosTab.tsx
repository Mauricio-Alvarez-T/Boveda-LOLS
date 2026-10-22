import React, { useEffect, useState, useCallback } from 'react';
import { useAparecer } from '../../hooks/useAparecer';
import { SkeletonFilas } from '../ui/Skeleton';
import { ArrowUp, ArrowDown, RefreshCw, History } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { useMediaQuery } from '../../hooks/useMediaQuery';
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
    // Fundido de datos solo si antes se vio el contorno (hooks/useAparecer).
    const aparece = useAparecer(loading);
    // En el teléfono, tarjetas como las del detalle del ítem (saldo antes → diferencia → saldo actual): la tabla de
    // 9 columnas iba con scroll lateral y dejaba el ítem en una columna angosta. Tabla O tarjetas (diseno.md §8.3).
    const esDesktop = useMediaQuery('(min-width: 768px)');

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
            {/* Barra de filtros. En el teléfono, grilla de 2: Tipo + Actualizar arriba, Desde + Hasta abajo (antes eran
                4 filas y le quitaban alto a la lista). Desde md: la fila de siempre (la grilla no aplica a un flex). */}
            <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-end md:gap-3 shrink-0 bg-card border border-border rounded-2xl p-3">
                <div className="flex flex-col gap-1 min-w-0">
                    <label className="text-caption font-semibold text-muted-foreground uppercase">Tipo</label>
                    <select
                        value={tipo}
                        onChange={(e) => setTipo(e.target.value as TipoMovimiento | '')}
                        className="h-9 w-full md:w-auto bg-card border border-border rounded-xl px-3 text-sm text-brand-dark focus:outline-none focus:border-brand-primary"
                    >
                        <option value="">Todos</option>
                        {TIPOS.map(t => (
                            <option key={t} value={t}>{TIPO_META[t].label}</option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                    <label className="text-caption font-semibold text-muted-foreground uppercase">Desde</label>
                    <input
                        type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
                        className="h-9 w-full md:w-auto min-w-0 bg-card border border-border rounded-xl px-2 md:px-3 text-sm text-brand-dark focus:outline-none focus:border-brand-primary"
                    />
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                    <label className="text-caption font-semibold text-muted-foreground uppercase">Hasta</label>
                    <input
                        type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
                        className="h-9 w-full md:w-auto min-w-0 bg-card border border-border rounded-xl px-2 md:px-3 text-sm text-brand-dark focus:outline-none focus:border-brand-primary"
                    />
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cargar(page)}
                    leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                    className="text-xs font-bold col-start-2 row-start-1 self-end justify-self-end"
                >
                    Actualizar
                </Button>
            </div>

            {/* Contenido */}
            <div className={cn('flex-1 min-h-0 overflow-auto custom-scrollbar bg-card border border-border rounded-2xl', aparece)}>
                {loading ? (
                    <SkeletonFilas />
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
                ) : !esDesktop ? (
                    <ul className="divide-y divide-border">
                        {movimientos.map((m) => {
                            const meta = TIPO_META[m.tipo] || { label: m.tipo, badge: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-800/60' };
                            const delta = Number(m.delta);
                            const u = m.unidad ? ` ${m.unidad}` : '';
                            return (
                                <li key={m.id} className="px-3 py-3">
                                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                        <span className={cn('inline-block px-2 py-0.5 rounded-md text-caption font-bold border', meta.badge)}>
                                            {meta.label}
                                        </span>
                                        <span className="text-xs font-medium text-foreground break-words">{m.obra_nombre || m.bodega_nombre || '—'}</span>
                                        <span className="ml-auto text-micro text-muted-foreground tabular-nums whitespace-nowrap">{fmtFecha(m.created_at)}</span>
                                    </div>
                                    <p className="mt-1.5 text-sm break-words">
                                        <span className="font-semibold text-brand-dark">#{m.nro_item}</span>
                                        <span className="text-label text-muted-foreground ml-1.5">{m.item_descripcion}</span>
                                    </p>
                                    <div className="mt-2 grid grid-cols-3 items-center rounded-lg bg-muted/60 px-2 py-1.5 text-center tabular-nums">
                                        <span>
                                            <span className="block text-micro font-semibold uppercase tracking-wide text-muted-foreground">Saldo antes</span>
                                            <span className="block text-base font-semibold text-foreground">{fmtNum(m.cantidad_anterior)}{u}</span>
                                        </span>
                                        <span className={cn('text-2xl font-black leading-none',
                                            delta > 0 ? 'text-green-700 dark:text-green-400' : delta < 0 ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground')}>
                                            {delta > 0 ? '+' : delta < 0 ? '−' : ''}{fmtNum(Math.abs(delta))}
                                        </span>
                                        <span>
                                            <span className="block text-micro font-semibold uppercase tracking-wide text-muted-foreground">Saldo actual</span>
                                            <span className="block text-base font-bold text-foreground">{fmtNum(m.cantidad_nueva)}{u}</span>
                                        </span>
                                    </div>
                                    {m.usuario_nombre && <p className="mt-1.5 text-micro text-muted-foreground break-words">{m.usuario_nombre}</p>}
                                    {m.motivo && <p className="text-micro italic text-muted-foreground break-words">{m.motivo}</p>}
                                </li>
                            );
                        })}
                    </ul>
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
                                        {/* El motivo (p. ej. causa + nota al resolver una diferencia) parte línea, nunca «…». */}
                                        <td className="px-3 py-2 text-label text-muted-foreground min-w-[160px] max-w-[280px] break-words">{m.motivo || '—'}</td>
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
