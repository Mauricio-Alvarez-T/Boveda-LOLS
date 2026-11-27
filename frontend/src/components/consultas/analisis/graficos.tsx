/**
 * Piezas de la pantalla Análisis de trabajadores: tarjeta, KPI, barras horizontales (rankings) y serie
 * mensual. Colores con variables CSS (sin hex, diseno.md), `isAnimationActive={!reduce}` en cada hijo
 * animado de recharts, incluido el Tooltip (§9.1), y cada gráfico se puede ver como tabla.
 */
import React, { useState } from 'react';
import {
    Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useReducedMotion } from 'framer-motion';
import { ArrowUpRight, BarChart3, Table2 } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Button } from '../../ui/Button';
import { NumeroRodante } from '../../ui/NumeroRodante';
import { mesCorto, type Celda } from './analisis';

/** Colores de serie en orden fijo (identidad, nunca por rango). */
export const COLOR_SERIE = ['var(--brand-primary)', 'var(--brand-secondary)', 'var(--muted-foreground)'] as const;

const TICK = { fill: 'var(--muted-foreground)', fontSize: 11 };

// ─── Tarjeta ────────────────────────────────────────────────────────────────────────────────────

export interface TablaVista { columnas: string[]; filas: Celda[][]; formato?: (v: Celda, col: number) => string }

export const Tarjeta: React.FC<{
    titulo: string;
    subtitulo?: React.ReactNode;
    className?: string;
    /** Si se da, la tarjeta ofrece «Ver tabla» (el gráfico nunca es la única forma de leer el dato). */
    tabla?: TablaVista;
    children: React.ReactNode;
}> = ({ titulo, subtitulo, className, tabla, children }) => {
    const [verTabla, setVerTabla] = useState(false);
    return (
        <section className={cn('min-w-0 rounded-3xl border border-border bg-card p-4 sm:p-5', className)}>
            <header className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-section font-bold text-brand-dark">{titulo}</h3>
                    {subtitulo && <p className="mt-0.5 text-caption text-muted-foreground">{subtitulo}</p>}
                </div>
                {tabla && (
                    <Button variant="ghost" size="sm" onClick={() => setVerTabla(v => !v)} className="shrink-0 text-muted-foreground"
                        leftIcon={verTabla ? <BarChart3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
                        aria-pressed={verTabla} title={verTabla ? 'Volver al gráfico' : 'Ver los datos en una tabla'}>
                        {verTabla ? 'Gráfico' : 'Tabla'}
                    </Button>
                )}
            </header>
            {tabla && verTabla ? <TablaSimple {...tabla} /> : children}
        </section>
    );
};

const TablaSimple: React.FC<TablaVista> = ({ columnas, filas, formato }) => (
    <div className="max-h-80 overflow-auto rounded-xl border border-border">
        <table className="w-full text-caption">
            <thead className="sticky top-0 bg-muted text-muted-foreground">
                <tr>{columnas.map((c, i) => <th key={i} className={cn('px-3 py-2 font-semibold', i === 0 ? 'text-left' : 'text-right')}>{c}</th>)}</tr>
            </thead>
            <tbody>
                {filas.map((f, r) => (
                    <tr key={r} className="border-t border-border">
                        {f.map((v, c) => (
                            <td key={c} className={cn('px-3 py-1.5', c === 0 ? 'text-left text-brand-dark' : 'text-right tabular-nums')}>
                                {formato ? formato(v, c) : typeof v === 'number' ? v.toLocaleString('es-CL') : (v ?? '—')}
                            </td>
                        ))}
                    </tr>
                ))}
                {!filas.length && <tr><td colSpan={columnas.length} className="px-3 py-4 text-center text-muted-foreground">Sin datos</td></tr>}
            </tbody>
        </table>
    </div>
);

// ─── KPI ────────────────────────────────────────────────────────────────────────────────────────

export const Kpi: React.FC<{
    label: string;
    /** Número que rueda (enteros). */
    n?: number | null;
    /** Texto ya formateado (porcentajes, montos, duraciones): no rueda. */
    texto?: string;
    detalle?: React.ReactNode;
    tono?: 'neutro' | 'aviso';
    /** Lleva a la grilla de Trabajadores con el filtro que explica la cifra. */
    onVer?: () => void;
}> = ({ label, n, texto, detalle, tono = 'neutro', onVer }) => {
    const cifra = texto ?? (n == null ? '—' : null);
    const contenido = (
        <>
            <span className="block text-caption font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
            <span className={cn('mt-1 block text-display-sm font-bold tabular-nums leading-none tracking-tight',
                tono === 'aviso' && (n ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-brand-dark')}>
                {cifra ?? <NumeroRodante value={n as number} />}
            </span>
            {detalle && <span className="mt-1.5 block text-caption text-muted-foreground">{detalle}</span>}
        </>
    );
    if (!onVer) return <div className="min-w-0 rounded-2xl bg-muted/50 p-4">{contenido}</div>;
    return (
        <Button variant="ghost" onClick={onVer} title="Ver estos trabajadores"
            className="group relative h-auto min-w-0 flex-col items-start justify-start whitespace-normal rounded-2xl bg-muted/50 p-4 text-left hover:bg-muted">
            {contenido}
            <ArrowUpRight aria-hidden className="absolute right-3 top-3 h-4 w-4 text-muted-foreground opacity-60 group-hover:text-brand-primary group-hover:opacity-100" />
        </Button>
    );
};

export const FilaKpis: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
);

// ─── Tooltip ────────────────────────────────────────────────────────────────────────────────────

interface ItemTooltip { name?: string; value?: number | string; color?: string; dataKey?: string | number; payload?: Record<string, unknown> }
const CajaTooltip: React.FC<{ titulo: string; items: { nombre: string; valor: string; color?: string }[]; pie?: string }> = ({ titulo, items, pie }) => (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-caption shadow-[var(--shadow-md)]">
        <p className="mb-1 font-semibold text-brand-dark">{titulo}</p>
        {items.map(it => (
            <p key={it.nombre} className="flex items-center gap-2 text-muted-foreground">
                {it.color && <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: it.color }} />}
                <span>{it.nombre}:</span><span className="font-semibold tabular-nums text-brand-dark">{it.valor}</span>
            </p>
        ))}
        {pie && <p className="mt-1 text-micro text-muted-foreground">{pie}</p>}
    </div>
);

// ─── Barras horizontales (rankings) ─────────────────────────────────────────────────────────────

export interface Barra { id?: number | string | null; etiqueta: string; valor: number; nota?: string }

/**
 * Ranking de barras horizontales con el valor escrito al final. Si `onElegir` existe, cada barra con id
 * lleva a la grilla filtrada (cursor de mano y pista en el tooltip). Máx. `max` barras; el resto se suma
 * en «Otras» (sin destino).
 */
export const BarrasH: React.FC<{
    datos: Barra[];
    formato?: (n: number) => string;
    onElegir?: (b: Barra) => void;
    max?: number;
    color?: string;
    vacio?: string;
    /** Espacio a la derecha para el valor escrito (montos completos: más ancho; nunca se abrevian). */
    margenDerecho?: number;
}> = ({ datos, formato = n => n.toLocaleString('es-CL'), onElegir, max = 12, color = COLOR_SERIE[0], vacio = 'Sin datos con estos filtros', margenDerecho = 56 }) => {
    const reduce = useReducedMotion();
    if (!datos.length) return <p className="py-8 text-center text-caption text-muted-foreground">{vacio}</p>;
    const visibles = datos.length > max
        ? [...datos.slice(0, max - 1), { id: null, etiqueta: `Otras (${datos.length - max + 1})`, valor: datos.slice(max - 1).reduce((s, d) => s + d.valor, 0) }]
        : datos;
    const filas = visibles.map(d => ({ ...d, corto: d.etiqueta.length > 26 ? `${d.etiqueta.slice(0, 25)}…` : d.etiqueta }));
    const alto = Math.max(filas.length * 34 + 16, 80);
    const clicable = (b: Barra) => !!onElegir && b.id != null && b.id !== '';
    return (
        <div style={{ height: alto }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filas} layout="vertical" margin={{ top: 4, right: margenDerecho, bottom: 4, left: 0 }} barCategoryGap={6}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="corto" width={150} axisLine={false} tickLine={false} tick={{ ...TICK, fontSize: 12 }} interval={0} />
                    <Tooltip isAnimationActive={!reduce} cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                        content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const b = (payload[0] as ItemTooltip).payload as unknown as Barra;
                            return <CajaTooltip titulo={b.etiqueta} items={[{ nombre: 'Total', valor: formato(b.valor) }]}
                                pie={[b.nota, clicable(b) ? 'Clic para ver a estas personas' : ''].filter(Boolean).join(' · ') || undefined} />;
                        }} />
                    <Bar dataKey="valor" fill={color} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={!reduce} animationDuration={500}
                        cursor={onElegir ? 'pointer' : undefined}
                        onClick={(d: unknown) => {
                            const b = (d as { payload?: Barra })?.payload ?? (d as Barra);
                            if (b && clicable(b)) onElegir?.(b);
                        }}>
                        <LabelList dataKey="valor" position="right" formatter={(v: unknown) => formato(Number(v))}
                            style={{ fill: 'var(--foreground)', fontSize: 12, fontWeight: 600 }} />
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

// ─── Serie mensual ──────────────────────────────────────────────────────────────────────────────

export interface Serie { clave: string; nombre: string; tipo: 'barra' | 'linea'; color?: string }

/**
 * Serie por mes con UN solo eje (nunca dos escalas). Barras agrupadas y/o líneas. Con ≥ 2 series lleva
 * leyenda. El mes en curso se marca «(en curso)» en el tooltip.
 */
export const SerieMeses: React.FC<{
    datos: (Record<string, unknown> & { mes: string; parcial?: boolean })[];
    series: Serie[];
    formato?: (n: number) => string;
    formatoEje?: (n: number) => string;
    alto?: number;
}> = ({ datos, series, formato = n => n.toLocaleString('es-CL'), formatoEje, alto = 240 }) => {
    const reduce = useReducedMotion();
    const filas = datos.map(d => ({ ...d, etiqueta: mesCorto(d.mes) }));
    const colorDe = (s: Serie, i: number) => s.color ?? COLOR_SERIE[i % COLOR_SERIE.length];
    return (
        <div>
            {series.length > 1 && (
                <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
                    {series.map((s, i) => (
                        <li key={s.clave} className="flex items-center gap-1.5">
                            <span aria-hidden className={cn('inline-block', s.tipo === 'linea' ? 'h-0.5 w-4' : 'h-2.5 w-2.5 rounded-sm')} style={{ background: colorDe(s, i) }} />
                            {s.nombre}
                        </li>
                    ))}
                </ul>
            )}
            <div style={{ height: alto }} className="w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={filas} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="etiqueta" axisLine={false} tickLine={false} tick={TICK} interval="preserveStartEnd" minTickGap={8} />
                        <YAxis axisLine={false} tickLine={false} width={formatoEje ? 56 : 40} tick={TICK} allowDecimals={false}
                            tickFormatter={(v: number) => (formatoEje ?? formato)(v)} />
                        <Tooltip isAnimationActive={!reduce} cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                            content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const fila = (payload[0] as ItemTooltip).payload as { mes: string; parcial?: boolean };
                                return <CajaTooltip titulo={`${mesCorto(fila.mes)}${fila.parcial ? ' (en curso)' : ''}`}
                                    items={(payload as ItemTooltip[]).map(p => ({ nombre: String(p.name), valor: formato(Number(p.value) || 0), color: p.color }))} />;
                            }} />
                        {series.map((s, i) => s.tipo === 'barra' ? (
                            <Bar key={s.clave} dataKey={s.clave} name={s.nombre} fill={colorDe(s, i)} radius={[4, 4, 0, 0]} maxBarSize={28}
                                isAnimationActive={!reduce} animationDuration={500} />
                        ) : (
                            <Line key={s.clave} dataKey={s.clave} name={s.nombre} type="monotone" stroke={colorDe(s, i)} strokeWidth={2}
                                dot={{ r: 3.5, fill: 'var(--card)', stroke: colorDe(s, i), strokeWidth: 2 }}
                                activeDot={{ r: 5, fill: colorDe(s, i), stroke: 'var(--card)', strokeWidth: 2 }}
                                connectNulls isAnimationActive={!reduce} animationDuration={500} />
                        ))}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
