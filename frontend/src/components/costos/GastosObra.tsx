import React, { useMemo, useState } from 'react';
import { Receipt, Paperclip, Plus, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { SearchBar } from '../ui/SearchBar';
import { EmptyState } from '../ui/EmptyState';
import { PestanasElasticas } from '../ui/PestanasElasticas';
import { fmtMoney, fmtFechaCorta } from '../../utils/format';
import { CATEGORIAS, TIPOS_DOC, hoyISO, netoGasto, porCompletar, nombreGasto } from './costosConfig';
import type { CostoGasto } from '../../types/entities';

export type FiltroGastos = 'todos' | 'completar' | 'pagar' | 'estimados';

interface Props {
    gastos: CostoGasto[];
    filtro: FiltroGastos;
    onFiltro: (f: FiltroGastos) => void;
    onNuevo: () => void;
    onAbrir: (g: CostoGasto) => void;
}

/**
 * Facturas y boletas de la obra, de la más nueva a la más antigua. «Por pagar» va por vencimiento
 * (lo vencido primero, sin fecha al final). «Neto estimado» aparece solo si hay facturas cargadas
 * solo con el total: son las que hay que completar para que el gastado sea exacto.
 */
export const GastosObra: React.FC<Props> = ({ gastos, filtro, onFiltro, onNuevo, onAbrir }) => {
    const [busqueda, setBusqueda] = useState('');
    const hoy = hoyISO();

    const conteo = useMemo(() => ({
        todos: gastos.length,
        completar: gastos.filter(porCompletar).length,
        pagar: gastos.filter(g => g.estado_pago === 'por_pagar').length,
        estimados: gastos.filter(g => netoGasto(g).estimado).length,
    }), [gastos]);

    const opciones: { key: FiltroGastos; label: string }[] = [
        { key: 'todos', label: 'Todos' },
        { key: 'completar', label: 'Por completar' },
        { key: 'pagar', label: 'Por pagar' },
        ...(conteo.estimados || filtro === 'estimados' ? [{ key: 'estimados' as const, label: 'Neto estimado' }] : []),
    ];

    const visibles = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        const pasa = (g: CostoGasto) => filtro === 'todos'
            || (filtro === 'completar' && porCompletar(g))
            || (filtro === 'pagar' && g.estado_pago === 'por_pagar')
            || (filtro === 'estimados' && netoGasto(g).estimado);
        const lista = gastos.filter(g => pasa(g) &&
            (!q || [g.proveedor, g.folio, g.partida_descripcion, g.observacion, g.categoria ? CATEGORIAS[g.categoria] : ''].some(t => (t || '').toLowerCase().includes(q))));
        if (filtro === 'pagar') {
            lista.sort((a, b) => (a.fecha_vencimiento || '9999').localeCompare(b.fecha_vencimiento || '9999'));
        }
        return lista;
    }, [gastos, filtro, busqueda]);

    const totalVisible = visibles.reduce((s, g) => s + (Number(g.monto_total) || 0), 0);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="flex items-center overflow-x-auto -mx-1 px-1 md:mx-0 md:px-0 [scrollbar-width:none]">
                    <div className="flex shrink-0 rounded-2xl border border-border bg-card p-1">
                        <PestanasElasticas
                            opciones={opciones}
                            activa={filtro}
                            onCambiar={onFiltro}
                            aria-label="Filtrar gastos"
                            claseFila="gap-1"
                            claseOpcion="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 font-medium whitespace-nowrap"
                            claseInactiva="text-muted-foreground hover:bg-background hover:text-brand-dark"
                            render={o => (<>{o.label}<span className="ml-1.5 opacity-70 tabular-nums">{conteo[o.key]}</span></>)}
                        />
                    </div>
                </div>
                {/* «Cargar gasto» vive en la cabecera de la obra: siempre a mano, sin repetirlo aquí. */}
                <SearchBar value={busqueda} onChange={setBusqueda} placeholder="Proveedor, folio, partida…" className="md:ml-auto md:w-64" />
            </div>

            {!gastos.length ? (
                <EmptyState icon={Receipt} title="Sin gastos cargados"
                    description="Toma la foto de la factura y anota el total: con eso basta para empezar. Lo demás se completa después."
                    action={<Button onClick={onNuevo} leftIcon={<Plus className="h-4 w-4" />}>Cargar el primero</Button>} />
            ) : !visibles.length ? (
                <EmptyState icon={Receipt} title={filtro === 'completar' ? 'Todo completo' : filtro === 'pagar' ? 'Nada por pagar' : filtro === 'estimados' ? 'Todas las facturas tienen su neto' : 'Nada con esa búsqueda'} />
            ) : (
                <>
                    <ul className="flex flex-col gap-2">
                        {visibles.map(g => {
                            const { neto, estimado } = netoGasto(g);
                            const falta = porCompletar(g);
                            const vencida = g.estado_pago === 'por_pagar' && !!g.fecha_vencimiento && g.fecha_vencimiento.slice(0, 10) < hoy;
                            const imputado = g.partida_descripcion || (g.categoria ? CATEGORIAS[g.categoria] : null);
                            return (
                                <li key={g.id}>
                                    {/* eslint-disable-next-line no-restricted-syntax -- tarjeta de gasto (proveedor, imputación, montos y estado); Button no soporta este layout */}
                                    <button type="button" onClick={() => onAbrir(g)}
                                        className="flex w-full items-start gap-3 rounded-card border border-border bg-card p-3.5 text-left transition-colors hover:border-muted-foreground/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                                            {g.tiene_foto ? <Paperclip className="h-4 w-4 text-muted-foreground" aria-label="Con foto" /> : <Receipt className="h-4 w-4 text-muted-foreground" />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-start justify-between gap-3">
                                                <span className={g.proveedor || g.tipo_documento === 'planilla' ? 'min-w-0 truncate text-sm font-semibold text-brand-dark' : 'min-w-0 truncate text-sm font-semibold text-muted-foreground'}>
                                                    {nombreGasto(g)}
                                                </span>
                                                <span className="shrink-0 text-sm font-bold text-brand-dark tabular-nums">{fmtMoney(g.monto_total)}</span>
                                            </span>
                                            <span className="mt-0.5 flex items-start justify-between gap-3 text-caption text-muted-foreground">
                                                <span className="min-w-0 truncate">
                                                    {fmtFechaCorta(g.fecha)} · {TIPOS_DOC[g.tipo_documento]}{g.folio ? ` N° ${g.folio}` : ''}
                                                </span>
                                                <span className="shrink-0 tabular-nums">{estimado ? 'neto ≈ ' : 'neto '}{fmtMoney(neto)}</span>
                                            </span>
                                            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                {imputado
                                                    ? <span className="max-w-full truncate text-caption text-brand-dark">{imputado}</span>
                                                    : <span className="text-caption text-muted-foreground">Sin asignar</span>}
                                                {falta && <Chip tone="warning" icon={<AlertTriangle className="h-3 w-3" />} label="Por completar" />}
                                                {g.estado_pago === 'pagada'
                                                    ? <Chip tone="success" label="Pagada" />
                                                    : vencida
                                                        ? <Chip tone="danger" label={`Vencida ${fmtFechaCorta(g.fecha_vencimiento)}`} />
                                                        : <Chip tone="warning" label={g.fecha_vencimiento ? `Por pagar · vence ${fmtFechaCorta(g.fecha_vencimiento)}` : 'Por pagar'} />}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    <p className="text-right text-caption text-muted-foreground tabular-nums">
                        {visibles.length} documento{visibles.length === 1 ? '' : 's'} · {fmtMoney(totalVisible)} con IVA
                    </p>
                </>
            )}
        </div>
    );
};

export default GastosObra;
