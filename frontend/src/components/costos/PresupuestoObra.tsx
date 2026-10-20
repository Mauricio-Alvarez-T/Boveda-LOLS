import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, ListPlus, Percent } from 'lucide-react';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { SearchBar } from '../ui/SearchBar';
import { EmptyState } from '../ui/EmptyState';
import { fmtMoney, fmtNumber } from '../../utils/format';
import { BarraAvance, PctGastado } from './piezas';
import { cn } from '../../utils/cn';
import type { CostoDetalleObra, CostoPartida } from '../../types/entities';

interface Props {
    detalle: CostoDetalleObra;
    onImportar: () => void;
    onAgregarPartida: () => void;
    onEditarPartida: (p: CostoPartida) => void;
    onPorcentajes: () => void;
    /** Obra cerrada: sin agregar, importar ni editar partidas (solo ver y corregir la superficie). */
    bloqueada?: boolean;
}

/**
 * El itemizado por capítulo, con lo gastado al lado de cada partida. Las
 * modificaciones (obras extra, cambios) se marcan para distinguirlas del original.
 * En el celular y la tablet cada partida es una tarjeta; en el escritorio (lg), una tabla.
 */
export const PresupuestoObra: React.FC<Props> = ({ detalle, onImportar, onAgregarPartida, onEditarPartida: editar, onPorcentajes, bloqueada = false }) => {
    const onEditarPartida = (p: CostoPartida) => { if (!bloqueada) editar(p); };
    const [busqueda, setBusqueda] = useState('');

    const grupos = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        const visibles = detalle.partidas.filter(p => !q || [p.descripcion, p.capitulo, p.codigo, p.motivo].some(t => (t || '').toLowerCase().includes(q)));
        const mapa = new Map<string, CostoPartida[]>();
        for (const p of visibles) {
            if (!mapa.has(p.capitulo)) mapa.set(p.capitulo, []);
            mapa.get(p.capitulo)!.push(p);
        }
        return [...mapa.entries()].map(([capitulo, partidas]) => ({
            capitulo,
            partidas,
            total: partidas.reduce((s, p) => s + p.total, 0),
            gastado: partidas.reduce((s, p) => s + p.gastado, 0),
        }));
    }, [detalle.partidas, busqueda]);

    const acciones = (
        <div className="flex flex-wrap items-center gap-2">
            {!bloqueada && <Button size="sm" onClick={onAgregarPartida} leftIcon={<ListPlus className="h-4 w-4" />}>Agregar partida</Button>}
            {!bloqueada && <Button size="sm" variant="glass" onClick={onImportar} leftIcon={<FileSpreadsheet className="h-4 w-4" />}>Importar Excel</Button>}
            <Button size="sm" variant="glass" onClick={onPorcentajes} leftIcon={<Percent className="h-4 w-4" />}>Datos: % y m²</Button>
        </div>
    );

    if (!detalle.partidas.length) {
        return (
            <EmptyState
                icon={FileSpreadsheet}
                title="Sin partidas todavía"
                description="Importa el Excel del presupuesto o agrega las partidas a mano. Después se pueden editar una por una."
                action={acciones}
            />
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                {acciones}
                <SearchBar value={busqueda} onChange={setBusqueda} placeholder="Buscar partida…" className="md:w-64" />
            </div>

            {!grupos.length && <EmptyState icon={ListPlus} title="Nada con esa búsqueda" />}

            {grupos.map(g => (
                <section key={g.capitulo} className="overflow-hidden rounded-card border border-border bg-card">
                    {/* Barra del capítulo: encabezado con contenedor → verde (excepción §7.3) */}
                    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-brand-primary px-4 py-2.5 text-white">
                        <h3 className="text-sm font-semibold">{g.capitulo} <span className="font-normal opacity-80">· {g.partidas.length}</span></h3>
                        <span className="text-xs tabular-nums opacity-95">{fmtMoney(g.gastado) || '$0'} de {fmtMoney(g.total) || '$0'}</span>
                    </header>

                    {/* Escritorio: tabla */}
                    <table className="hidden w-full text-xs lg:table">
                        <thead>
                            <tr className="border-b border-border text-muted-foreground">
                                <th className="w-14 px-4 py-2 text-left font-semibold">Ítem</th>
                                <th className="px-2 py-2 text-left font-semibold">Descripción</th>
                                <th className="w-24 px-2 py-2 text-right font-semibold">Cantidad</th>
                                <th className="w-24 px-2 py-2 text-right font-semibold">P. unitario</th>
                                <th className="w-28 px-2 py-2 text-right font-semibold">Total</th>
                                <th className="w-40 px-4 py-2 text-left font-semibold">Gastado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {g.partidas.map(p => (
                                <tr key={p.id} onClick={() => onEditarPartida(p)} className={cn('border-b border-border last:border-0', !bloqueada && 'cursor-pointer hover:bg-muted/40')}>
                                    <td className="px-4 py-2.5 align-top text-muted-foreground tabular-nums">{p.codigo || '—'}</td>
                                    <td className="px-2 py-2.5 align-top">
                                        {/* eslint-disable-next-line no-restricted-syntax -- acceso por teclado a la fila (la fila entera es clicable con el mouse) */}
                                        <button type="button" onClick={e => { e.stopPropagation(); onEditarPartida(p); }}
                                            className="text-left font-medium text-brand-dark hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded">
                                            {p.descripcion}
                                        </button>
                                        {p.origen === 'modificacion' && (
                                            <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                                <Chip label="Modificación" tone="info" />
                                                {p.motivo && <span className="text-caption text-muted-foreground">{p.motivo}</span>}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-2 py-2.5 text-right align-top text-muted-foreground tabular-nums">{fmtNumber(p.cantidad) || '0'} {p.unidad || ''}</td>
                                    <td className="px-2 py-2.5 text-right align-top text-muted-foreground tabular-nums">{fmtMoney(p.precio_unitario) || '$0'}</td>
                                    <td className="px-2 py-2.5 text-right align-top font-semibold text-brand-dark tabular-nums">{fmtMoney(p.total) || '$0'}</td>
                                    <td className="px-4 py-2.5 align-top">
                                        {p.gastado > 0 ? (
                                            <>
                                                <div className="mb-1 flex justify-between gap-2 tabular-nums">
                                                    <span className="text-brand-dark">{fmtMoney(p.gastado)}</span>
                                                    <PctGastado presupuestado={p.total} gastado={p.gastado} />
                                                </div>
                                                <BarraAvance presupuestado={p.total} gastado={p.gastado} className="h-1.5" />
                                            </>
                                        ) : <span className="text-muted-foreground">—</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Celular: tarjetas */}
                    <ul className="divide-y divide-border lg:hidden">
                        {g.partidas.map(p => (
                            <li key={p.id}>
                                {/* eslint-disable-next-line no-restricted-syntax -- tarjeta de partida (descripción, cantidades, total y avance); Button no soporta este layout */}
                                <button type="button" onClick={() => onEditarPartida(p)}
                                    className="flex w-full flex-col gap-1.5 px-4 py-3 text-left active:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary/40">
                                    <span className="flex items-start justify-between gap-3">
                                        <span className="min-w-0 text-sm font-medium text-brand-dark">
                                            {p.codigo && <span className="mr-1.5 text-muted-foreground tabular-nums">{p.codigo}</span>}
                                            {p.descripcion}
                                        </span>
                                        <span className="shrink-0 text-sm font-semibold text-brand-dark tabular-nums">{fmtMoney(p.total) || '$0'}</span>
                                    </span>
                                    <span className="text-caption text-muted-foreground tabular-nums">
                                        {fmtNumber(p.cantidad) || '0'} {p.unidad || ''} × {fmtMoney(p.precio_unitario) || '$0'}
                                    </span>
                                    {p.origen === 'modificacion' && (
                                        <span className="flex flex-wrap items-center gap-1.5">
                                            <Chip label="Modificación" tone="info" />
                                            {p.motivo && <span className="text-caption text-muted-foreground">{p.motivo}</span>}
                                        </span>
                                    )}
                                    {p.gastado > 0 && (
                                        <span className="mt-0.5 flex flex-col gap-1">
                                            <span className="flex justify-between text-caption tabular-nums">
                                                <span className="text-muted-foreground">Gastado {fmtMoney(p.gastado)}</span>
                                                <PctGastado presupuestado={p.total} gastado={p.gastado} />
                                            </span>
                                            <BarraAvance presupuestado={p.total} gastado={p.gastado} className="h-1.5" />
                                        </span>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
};

export default PresupuestoObra;
