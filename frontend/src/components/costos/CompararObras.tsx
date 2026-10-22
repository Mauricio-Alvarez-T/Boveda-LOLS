import React, { useEffect, useState } from 'react';
import { Scale, Ruler, Percent, Info, AlertTriangle } from 'lucide-react';
import api from '../../services/api';
import { Chip } from '../ui/Chip';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { fmtMoney, fmtNumber } from '../../utils/format';
import { cn } from '../../utils/cn';
import { GRUPOS_CATEGORIA, grupoDe } from './costosConfig';
import { Kpi, Aviso } from './piezas';
import type { CostoComparacion } from '../../types/entities';

const pct = (n: number | null | undefined, signo = false) =>
    n === null || n === undefined ? '—' : `${signo && n > 0 ? '+' : ''}${fmtNumber(n, { decimals: 1 })} %`;

/** Categorías de cierres viejos (mig 122) → su grupo de hoy. */
const GRUPO_ANTIGUO: Record<string, string> = { mano_obra: 'mano_obra', maquinaria: 'faenas' };

/** Gasto de una obra sumado por GRUPO de categoría (16 categorías no caben en una tabla de teléfono). */
function porGrupo(porCategoria: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(porCategoria)) {
        const g = grupoDe(k)?.clave || GRUPO_ANTIGUO[k] || 'sin_categoria';
        out[g] = (out[g] || 0) + v;
    }
    return out;
}
const COLUMNAS: { clave: string; nombre: string }[] = [...GRUPOS_CATEGORIA.map(g => ({ clave: g.clave, nombre: g.nombre })), { clave: 'sin_categoria', nombre: 'Sin categoría' }];

/**
 * Obras lado a lado con su costo por m². Las CERRADAS usan sus números finales y forman el promedio
 * (la base para cotizar); las en curso muestran lo de hoy, marcado como PARCIAL.
 */
export const CompararObras: React.FC<{ onIrObra: (obraId: number) => void }> = ({ onIrObra }) => {
    const [datos, setDatos] = useState<CostoComparacion | null>(null);
    const [falla, setFalla] = useState(false);

    useEffect(() => {
        api.get<{ data: CostoComparacion }>('/costos/comparacion')
            .then(res => setDatos(res.data.data))
            .catch(() => setFalla(true));
    }, []);

    if (falla) return <EmptyState icon={Scale} title="No se pudo cargar la comparación" description="Vuelve a intentarlo en un momento." />;
    if (!datos) return <div className="h-96 rounded-card border border-border bg-card" />;
    if (!datos.obras.length) return <EmptyState icon={Scale} title="Todavía no hay obras para comparar" description="Agrega obras a Presupuestos y carga su presupuesto." />;

    const p = datos.promedio_cerradas;
    const maxM2 = Math.max(1, ...datos.obras.map(o => Math.max(o.por_m2.real || 0, o.por_m2.presupuestado || 0)));
    const sinSuperficie = datos.obras.filter(o => !o.superficie_m2).length;
    const enCurso = datos.obras.filter(o => !o.cerrada).length;
    const grupos = datos.obras.map(o => porGrupo(o.por_categoria));
    const columnas = COLUMNAS.filter(c => grupos.some(g => (g[c.clave] || 0) > 0));

    return (
        <div className="flex flex-col gap-4">
            {p ? (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                    <Kpi icon={Ruler} label="Costo real promedio por m²" valor={fmtMoney(p.costo_real_m2) || '—'} nota={`${p.obras} obra${p.obras === 1 ? '' : 's'} cerrada${p.obras === 1 ? '' : 's'}, ponderado por superficie`} />
                    <Kpi icon={Ruler} label="Presupuestado promedio por m²" valor={fmtMoney(p.costo_presupuestado_m2) || '—'} nota="lo que se había calculado para esas obras" />
                    <Kpi icon={Percent} label="Margen real promedio" valor={pct(p.margen_pct_real)} nota="de las obras cerradas" />
                </div>
            ) : (
                <Aviso icon={Info} tono="neutro">Todavía no hay obras <strong>cerradas</strong> con superficie: el promedio por m² (la base para cotizar) aparece cuando se cierre la primera desde su pestaña Cierre.</Aviso>
            )}
            {(enCurso > 0 || sinSuperficie > 0) && (
                <Aviso icon={AlertTriangle}>
                    {enCurso > 0 && <>Las obras <strong>en curso</strong> muestran su costo por m² de hoy, que es parcial porque todavía sube; la desviación y el margen real aparecen al cerrarlas. </>}
                    {sinSuperficie > 0 && <>{sinSuperficie} obra{sinSuperficie === 1 ? '' : 's'} sin superficie: sin m² no hay costo por m² (se pone en Presupuesto › Datos).</>}
                </Aviso>
            )}

            <section className="overflow-hidden rounded-card border border-border bg-card">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm tabular-nums">
                        <thead className="bg-brand-primary text-white">
                            <tr>
                                <th className="px-4 py-2.5 text-left font-semibold">Obra</th>
                                <th className="px-3 py-2.5 text-right font-semibold">m²</th>
                                <th className="px-3 py-2.5 text-left font-semibold">Costo por m² · presupuestado vs real</th>
                                <th className="px-3 py-2.5 text-right font-semibold">Desviación</th>
                                <th className="px-3 py-2.5 text-right font-semibold">Margen presupuestado</th>
                                <th className="px-4 py-2.5 text-right font-semibold">Margen real</th>
                            </tr>
                        </thead>
                        <tbody>
                            {datos.obras.map(o => (
                                <tr key={o.obra_id} className="border-t border-border">
                                    <td className="min-w-[11rem] px-4 py-2.5 text-left">
                                        <Button variant="link" size="sm" className="whitespace-nowrap text-sm font-semibold" onClick={() => onIrObra(o.obra_id)}>{o.nombre}</Button>
                                        <span className="mt-0.5 flex flex-wrap gap-1">
                                            {o.cerrada ? <Chip tone="success" label="Cerrada" /> : <Chip tone="neutral" label="En curso · parcial" />}
                                            {o.venta_fuente === 'presupuesto' && <Chip tone="warning" label="Venta del presupuesto" />}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-brand-dark">{o.superficie_m2 ? fmtNumber(o.superficie_m2) : <span className="text-muted-foreground">—</span>}</td>
                                    <td className="min-w-[17rem] px-3 py-2.5 text-left">
                                        {o.superficie_m2 ? (
                                            <div className="flex flex-col gap-1">
                                                <Barra valor={o.por_m2.presupuestado || 0} max={maxM2} clase="bg-muted-foreground/40" texto={`${fmtMoney(o.por_m2.presupuestado) || '$0'} presupuestado`} />
                                                <Barra valor={o.por_m2.real || 0} max={maxM2}
                                                    clase={(o.por_m2.real || 0) > (o.por_m2.presupuestado || 0) ? 'bg-destructive' : 'bg-brand-primary'}
                                                    texto={`${fmtMoney(o.por_m2.real) || '$0'} real${o.cerrada ? '' : ' (parcial)'}`} />
                                            </div>
                                        ) : <span className="text-caption text-muted-foreground">Falta la superficie</span>}
                                    </td>
                                    {/* En curso: lo gastado hasta hoy contra el presupuesto completo no es una desviación ni un margen. */}
                                    <td className={cn('px-3 py-2.5 text-right', o.cerrada && (o.desviacion_pct ?? 0) > 0 ? 'font-semibold text-destructive' : 'text-brand-dark')}>
                                        {o.cerrada ? pct(o.desviacion_pct, true) : <span className="text-caption text-muted-foreground">al cerrar</span>}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-muted-foreground">{pct(o.margen_pct_presupuestado)}</td>
                                    <td className={cn('px-4 py-2.5 text-right font-semibold', o.cerrada && (o.margen_pct_real ?? 0) < (o.margen_pct_presupuestado ?? 0) ? 'text-destructive' : 'text-brand-dark')}>
                                        {o.cerrada ? pct(o.margen_pct_real) : <span className="text-caption font-normal text-muted-foreground">al cerrar</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                    Desviación = costo real contra costo presupuestado. Margen real = venta (lo cobrado; sin cobros, el presupuesto) menos el costo real. Los dos se calculan al cerrar la obra.
                </p>
            </section>

            {columnas.length > 0 && (
                <section className="overflow-hidden rounded-card border border-border bg-card">
                    <header className="border-b border-border px-4 py-3">
                        <h3 className="text-base font-bold text-brand-dark">En qué se fue la plata</h3>
                        <p className="text-xs text-muted-foreground">Porcentaje del costo real de cada obra, por grupo de gasto.</p>
                    </header>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm tabular-nums">
                            <thead className="bg-brand-primary text-white">
                                <tr>
                                    <th className="px-4 py-2.5 text-left font-semibold">Obra</th>
                                    {columnas.map(c => <th key={c.clave} className="px-3 py-2.5 text-right font-semibold">{c.nombre}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {datos.obras.map((o, i) => {
                                    const g = grupos[i];
                                    const total = Object.values(g).reduce((s, v) => s + v, 0);
                                    return (
                                        <tr key={o.obra_id} className="border-t border-border">
                                            <td className="px-4 py-2.5 text-left font-medium text-brand-dark">{o.nombre}</td>
                                            {columnas.map(c => (
                                                <td key={c.clave} className="px-3 py-2.5 text-right text-brand-dark">
                                                    {total && g[c.clave] ? `${fmtNumber((g[c.clave] / total) * 100, { decimals: 0 })} %` : <span className="text-muted-foreground">—</span>}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </div>
    );
};

const Barra: React.FC<{ valor: number; max: number; clase: string; texto: string }> = ({ valor, max, clase, texto }) => (
    <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', clase)} style={{ width: `${Math.min(100, (valor / max) * 100)}%` }} /></div>
        <span className="shrink-0 whitespace-nowrap text-caption text-muted-foreground">{texto}</span>
    </div>
);

export default CompararObras;
