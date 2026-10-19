import React, { useMemo, useState } from 'react';
import { ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import { Section } from '../ui/Section';
import { Chip } from '../ui/Chip';
import { PestanasElasticas } from '../ui/PestanasElasticas';
import { fmtMoney, fmtNumber } from '../../utils/format';
import { cn } from '../../utils/cn';
import { CATEGORIAS, GRUPOS_CATEGORIA, netoGasto, nombreMes } from './costosConfig';
import type { VistaDetalle } from './DetalleCostos';
import type { CostoCategoria, CostoGasto } from '../../types/entities';

type Cat = CostoCategoria | 'sin_categoria';
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const corto = (mes: string) => `${MESES_CORTO[Number(mes.slice(5, 7)) - 1]} ${mes.slice(2, 4)}`;
const mesAnterior = (mes: string) => {
    const [a, m] = mes.split('-').map(Number);
    return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
};

/** Neto por mes (AAAA-MM) y categoría, más cuántos documentos hay en cada uno. */
function agrupar(gastos: CostoGasto[]) {
    const neto = new Map<string, Map<Cat, number>>();
    const docs = new Map<string, Map<Cat, number>>();
    for (const g of gastos) {
        const mes = g.fecha.slice(0, 7);
        const cat: Cat = g.categoria || 'sin_categoria';
        if (!neto.has(mes)) { neto.set(mes, new Map()); docs.set(mes, new Map()); }
        neto.get(mes)!.set(cat, (neto.get(mes)!.get(cat) || 0) + netoGasto(g).neto);
        docs.get(mes)!.set(cat, (docs.get(mes)!.get(cat) || 0) + 1);
    }
    return { neto, docs, meses: [...neto.keys()].sort().reverse() };
}

/** Grupos de categorías (orden de costosConfig) con «Sin categoría» al final. */
const FILAS: { clave: string; nombre: string; periodicidad: string; categorias: Cat[] }[] = [
    ...GRUPOS_CATEGORIA.map(g => ({ ...g, categorias: g.categorias as Cat[] })),
    { clave: 'sin', nombre: 'Sin categoría', periodicidad: 'mensual', categorias: ['sin_categoria'] },
];
const nombre = (c: Cat) => (c === 'sin_categoria' ? 'Sin categoría' : CATEGORIAS[c]);

/**
 * Gastos mes a mes por grupo y categoría (pedido de Rodrigo, 19-10: Copec, anticipos y sueldos mes a
 * mes, hormigón, herramientas, materiales, arriendo de equipos). Neto, por la fecha del documento.
 * En el teléfono se elige el mes y se ve la lista; en el escritorio también la tabla de todos los
 * meses. Cada monto abre sus facturas.
 */
export const GastosMesAMes: React.FC<{ gastos: CostoGasto[]; onDetalle: (v: VistaDetalle) => void }> = ({ gastos, onDetalle }) => {
    const { neto, docs, meses } = useMemo(() => agrupar(gastos), [gastos]);
    const [mes, setMes] = useState<string>(() => meses[0] || 'todo');
    const [modo, setModo] = useState<'mes' | 'tabla'>('mes');

    if (!meses.length) return null;
    const elegido = mes === 'todo' || meses.includes(mes) ? mes : meses[0];

    const montoDe = (m: string | 'todo', c: Cat) => (m === 'todo' ? meses.reduce((s, x) => s + (neto.get(x)?.get(c) || 0), 0) : neto.get(m)?.get(c) || 0);
    const docsDe = (m: string | 'todo', c: Cat) => (m === 'todo' ? meses.reduce((s, x) => s + (docs.get(x)?.get(c) || 0), 0) : docs.get(m)?.get(c) || 0);
    const totalDe = (m: string | 'todo') => FILAS.reduce((s, f) => s + f.categorias.reduce((t, c) => t + montoDe(m, c), 0), 0);

    const total = totalDe(elegido);
    const anterior = elegido !== 'todo' && neto.has(mesAnterior(elegido)) ? totalDe(mesAnterior(elegido)) : null;
    const variacion = anterior ? ((total - anterior) / anterior) * 100 : null;

    const opcionesMes = [...meses.map(m => ({ key: m, label: corto(m) })), { key: 'todo', label: 'Toda la obra' }];
    const columnas = [...meses].slice(0, 6).reverse();      // tabla: hasta 6 meses, del más antiguo al más nuevo

    return (
        <Section
            title="Gastos mes a mes"
            action={
                <div className="hidden rounded-2xl border border-border bg-card p-1 md:flex">
                    <PestanasElasticas opciones={[{ key: 'mes' as const, label: 'Por mes' }, { key: 'tabla' as const, label: 'Tabla' }]} activa={modo} onCambiar={setModo}
                        aria-label="Cómo ver los gastos mes a mes" claseFila="gap-1"
                        claseOpcion="inline-flex h-8 shrink-0 items-center justify-center rounded-xl px-3 text-sm font-medium whitespace-nowrap"
                        claseInactiva="text-muted-foreground hover:bg-background hover:text-brand-dark" render={o => o.label} />
                </div>
            }
            bodyClassName="p-3 sm:p-4"
        >
            {modo === 'tabla' ? (
                <div className="hidden md:block">
                    <div className="overflow-x-auto rounded-xl border border-border">
                        <table className="w-full text-sm tabular-nums">
                            <thead className="bg-brand-primary text-white">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold">Categoría</th>
                                    {columnas.map(m => <th key={m} className="px-3 py-2 text-right font-semibold whitespace-nowrap">{corto(m)}</th>)}
                                    <th className="px-3 py-2 text-right font-semibold">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {FILAS.map(f => {
                                    const cats = f.categorias.filter(c => montoDe('todo', c) > 0);
                                    if (!cats.length) return null;
                                    return (
                                        <React.Fragment key={f.clave}>
                                            <tr className="border-t border-border bg-muted/50">
                                                <td className="px-3 py-1.5 text-xs font-bold text-brand-dark" colSpan={columnas.length + 2}>
                                                    {f.nombre}{f.periodicidad === 'por proyecto' && <span className="ml-1.5 font-normal text-muted-foreground">· por proyecto</span>}
                                                </td>
                                            </tr>
                                            {cats.map(c => (
                                                <tr key={c} className="border-t border-border">
                                                    <td className="px-3 py-1.5 text-left text-brand-dark">{nombre(c)}</td>
                                                    {columnas.map(m => {
                                                        const v = montoDe(m, c);
                                                        return (
                                                            <td key={m} className="px-1 py-1 text-right">
                                                                {v ? (
                                                                    // eslint-disable-next-line no-restricted-syntax -- celda de monto que abre sus facturas; Button no calza en una celda de tabla
                                                                    <button type="button" onClick={() => onDetalle({ tipo: 'categoria', categoria: c, mes: m })}
                                                                        className="w-full rounded-md px-2 py-1 text-right text-brand-dark hover:bg-brand-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                                                                        {fmtMoney(v)}
                                                                    </button>
                                                                ) : <span className="px-2 text-muted-foreground">—</span>}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-3 py-1.5 text-right font-semibold text-brand-dark">{fmtMoney(montoDe('todo', c))}</td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                })}
                                <tr className="border-t border-border bg-muted/60 font-bold text-brand-dark">
                                    <td className="px-3 py-2 text-left">Total del mes</td>
                                    {columnas.map(m => <td key={m} className="px-3 py-2 text-right">{fmtMoney(totalDe(m)) || '$0'}</td>)}
                                    <td className="px-3 py-2 text-right">{fmtMoney(totalDe('todo')) || '$0'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-2 text-caption text-muted-foreground">Montos netos (sin IVA), por la fecha del documento. {meses.length > 6 ? 'Se muestran los últimos 6 meses; el total es de toda la obra.' : ''} Toca un monto para ver sus facturas.</p>
                </div>
            ) : null}

            <div className={cn('flex flex-col gap-3', modo === 'tabla' && 'md:hidden')}>
                <div className="flex items-center overflow-x-auto -mx-1 px-1 [scrollbar-width:none]">
                    <div className="flex shrink-0 rounded-2xl border border-border bg-card p-1">
                        <PestanasElasticas opciones={opcionesMes} activa={elegido} onCambiar={setMes} aria-label="Mes"
                            claseFila="gap-1"
                            claseOpcion="inline-flex h-9 shrink-0 items-center justify-center rounded-xl px-3 text-sm font-medium whitespace-nowrap"
                            claseInactiva="text-muted-foreground hover:bg-background hover:text-brand-dark" render={o => o.label} />
                    </div>
                </div>

                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-2xl bg-muted/50 px-3.5 py-3">
                    <span>
                        <span className="block text-caption font-semibold uppercase tracking-wider text-muted-foreground">{elegido === 'todo' ? 'Toda la obra' : nombreMes(elegido)}</span>
                        <span className="text-lg font-bold text-brand-dark tabular-nums">{fmtMoney(total) || '$0'}</span>
                        <span className="ml-1.5 text-caption text-muted-foreground">neto</span>
                    </span>
                    {variacion !== null && (
                        <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', variacion > 0 ? 'text-destructive' : 'text-brand-primary')}>
                            {variacion > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                            {variacion > 0 ? '+' : ''}{fmtNumber(variacion, { decimals: 0 })} % vs {nombreMes(mesAnterior(elegido)).split(' ')[0]}
                        </span>
                    )}
                </div>

                <div className="flex flex-col gap-3">
                    {FILAS.map(f => {
                        const cats = f.categorias.filter(c => montoDe(elegido, c) > 0);
                        if (!cats.length) return null;
                        const sub = cats.reduce((s, c) => s + montoDe(elegido, c), 0);
                        return (
                            <section key={f.clave} className="overflow-hidden rounded-2xl border border-border">
                                <header className="flex items-baseline justify-between gap-3 bg-muted/50 px-3.5 py-2">
                                    <h4 className="min-w-0 text-xs font-bold text-brand-dark">
                                        {f.nombre}{f.periodicidad === 'por proyecto' && <Chip className="ml-1.5 align-middle" label="por proyecto" />}
                                    </h4>
                                    <span className="shrink-0 text-xs font-bold text-brand-dark tabular-nums">{fmtMoney(sub)}</span>
                                </header>
                                <ul className="divide-y divide-border">
                                    {cats.map(c => {
                                        const v = montoDe(elegido, c);
                                        const n = docsDe(elegido, c);
                                        return (
                                            <li key={c}>
                                                {/* eslint-disable-next-line no-restricted-syntax -- fila de categoría que abre sus facturas (nombre, documentos, monto y barra); Button no soporta este layout */}
                                                <button type="button" onClick={() => onDetalle({ tipo: 'categoria', categoria: c, mes: elegido === 'todo' ? null : elegido })}
                                                    className="flex min-h-11 w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary/40">
                                                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                                                        <span className="flex items-baseline justify-between gap-3">
                                                            <span className="min-w-0 truncate text-sm text-brand-dark">{nombre(c)}</span>
                                                            <span className="shrink-0 text-sm font-semibold text-brand-dark tabular-nums">{fmtMoney(v)}</span>
                                                        </span>
                                                        <span className="flex items-center gap-2">
                                                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-brand-primary/70" style={{ width: `${total ? Math.max(2, (v / total) * 100) : 0}%` }} /></span>
                                                            <span className="shrink-0 text-caption text-muted-foreground tabular-nums">{n} doc{n === 1 ? '' : 's'} · {total ? fmtNumber((v / total) * 100, { decimals: 0 }) : 0} %</span>
                                                        </span>
                                                    </span>
                                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        );
                    })}
                </div>
                <p className="text-caption text-muted-foreground">Montos netos (sin IVA), por la fecha del documento. Toca una categoría para ver sus facturas.</p>
            </div>
        </Section>
    );
};

export default GastosMesAMes;
