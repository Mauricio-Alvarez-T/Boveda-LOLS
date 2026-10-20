import React, { useEffect, useId, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useReducedMotion } from 'framer-motion';
import { ArrowRight, ChevronDown, Lock, TrendingUp } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Chip } from '../../ui/Chip';
import { NumeroRodante } from '../../ui/NumeroRodante';
import {
    anchoRelativo, bloqueFecha, describirEvento, fechasPatron, fmtHoras, fmtPct, mesCorto, resumenTendencia,
    type DetalleAsistenciaApi, type MesTendencia, type TrabajadorPatron,
} from './resumenAsistenciaDetalle';

/**
 * Bloques de la fase 2 del detalle «Asistencia» del Inicio (dueño 2026-10-20): lo que viene en 14 días,
 * los descuentos del mes para remuneraciones y las horas extra por obra. Cada uno recibe su bloque de
 * GET /dashboard/asistencia ya no-null (sin permiso, el detalle ni lo monta).
 */

const CARD = 'rounded-3xl bg-card p-6 text-foreground shadow-[var(--shadow-md)]';
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

// ─── Próximos 14 días ───
/**
 * Próximos 14 días con LÍMITE (dueño 2026-10-20: «se extiende mucho y rompe la cuadrícula»). En escritorio
 * la tarjeta toma el alto de la columna de al lado (va en un contenedor absoluto que no empuja la fila) y en
 * celular un alto máximo; lo que no cabe se desvanece abajo y «Ver los N» la despliega entera.
 */
export const ProximosDias: React.FC<{ datos: NonNullable<DetalleAsistenciaApi['proximos']>; hoy: string }> = ({ datos, hoy }) => {
    const [abierto, setAbierto] = useState(false);
    const [desborda, setDesborda] = useState(false);
    const listaRef = useRef<HTMLDivElement>(null);
    const idLista = useId();
    // ¿Hay eventos cortados? Se mide al cambiar el tamaño del recorte o de la lista.
    useEffect(() => {
        const el = listaRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const medir = () => setDesborda(el.scrollHeight > el.clientHeight + 1);
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        if (el.firstElementChild) ro.observe(el.firstElementChild);
        medir();
        return () => ro.disconnect();
    }, [abierto, datos.eventos.length]);
    const n = datos.eventos.length;
    return (
        <div className={cn('relative', !abierto && 'lg:min-h-[280px] lg:flex-1')}>
            <div className={cn(!abierto && 'lg:absolute lg:inset-0')}>
                <div className={cn(CARD, 'flex flex-col py-3', !abierto && 'lg:h-full')}>
                    {n === 0 ? (
                        <p className="py-3 text-sm text-muted-foreground">Nada programado: ni licencias ni vacaciones que empiecen o terminen, ni feriados.</p>
                    ) : (
                        <div ref={listaRef} id={idLista}
                            className={cn('relative min-h-0 flex-1', !abierto && 'max-h-[520px] overflow-hidden lg:max-h-none')}>
                            <ol>
                                {datos.eventos.map((e, i) => {
                                    const f = bloqueFecha(e.fecha, hoy);
                                    const d = describirEvento(e);
                                    return (
                                        <li key={`${e.tipo}-${e.fecha}-${'rut' in e ? e.rut : e.nombre}-${i}`}
                                            className="flex gap-4 border-t border-border py-3 first:border-t-0">
                                            <span className="w-11 shrink-0 text-center">
                                                <span className="block text-label font-semibold uppercase text-muted-foreground">{f.relativo ?? f.dia}</span>
                                                <span className="block text-xl font-bold leading-tight tabular-nums">{f.num}</span>
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <Chip tone={d.tono} label={d.rotulo} />
                                                <span className="mt-1 block truncate text-sm font-semibold">{d.texto}</span>
                                                <span className="block truncate text-xs text-muted-foreground">{d.detalle}</span>
                                            </span>
                                        </li>
                                    );
                                })}
                            </ol>
                            {!abierto && desborda && (
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" aria-hidden />
                            )}
                        </div>
                    )}
                    {(desborda || abierto) && (
                        <div className="flex justify-center border-t border-border pt-2">
                            {/* eslint-disable-next-line no-restricted-syntax -- desplegar la lista */}
                            <button type="button" onClick={() => setAbierto(v => !v)} aria-expanded={abierto} aria-controls={idLista}
                                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-section font-semibold text-green-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 dark:text-green-300">
                                {abierto ? 'Ver menos' : `Ver los ${n}`}
                                <ChevronDown className={cn('h-4 w-4 transition-transform duration-200 motion-reduce:transition-none', abierto && 'rotate-180')} aria-hidden />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Descuentos del mes ───
const VISIBLES = 8;

export const DescuentosMes: React.FC<{ datos: NonNullable<DetalleAsistenciaApi['descuentos']>; onTrabajador: (rut: string) => void; onAsistencia: () => void }> = ({
    datos, onTrabajador, onAsistencia,
}) => {
    const [todos, setTodos] = useState(false);
    const filas = todos ? datos.lista : datos.lista.slice(0, VISIBLES);
    const ocultos = datos.lista.length - filas.length;
    return (
        <div className="overflow-hidden rounded-3xl bg-card text-foreground shadow-[var(--shadow-md)]">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-6 pt-5 pb-4">
                <NumeroRodante value={datos.dias} className="text-4xl font-bold leading-none tracking-tight" />
                <span className="text-sm text-muted-foreground">
                    {plural(datos.dias, 'día', 'días')} sin pago de {datos.trabajadores} {plural(datos.trabajadores, 'trabajador', 'trabajadores')}
                </span>
            </div>
            {datos.lista.length === 0 ? (
                <p className="border-t border-border px-6 py-4 text-sm text-muted-foreground">Nadie tiene días sin pago ni jornadas incompletas este mes.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm tabular-nums">
                        <thead>
                            <tr className="border-t border-border text-label font-semibold uppercase tracking-wide text-muted-foreground">
                                <th scope="col" className="px-6 py-3 text-left font-semibold">Trabajador</th>
                                {datos.columnas.map(c => <th key={c} scope="col" className="px-2.5 py-3 text-right font-semibold">{c}</th>)}
                                <th scope="col" className="px-2.5 py-3 text-right font-semibold" title="Jornada incompleta: sus horas las descuenta el Excel">JI</th>
                                <th scope="col" className="px-6 py-3 text-right font-semibold">Días sin pago</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filas.map(t => (
                                <tr key={t.trabajador_id} className="border-t border-border transition-colors hover:bg-muted/40">
                                    <td className="px-6 py-2.5">
                                        {/* eslint-disable-next-line no-restricted-syntax -- enlace de fila */}
                                        <button type="button" onClick={() => onTrabajador(t.rut)}
                                            className="rounded text-left font-semibold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                                            {t.apellido_paterno} {t.nombres}
                                        </button>
                                    </td>
                                    {datos.columnas.map(c => (
                                        <td key={c} className={cn('px-2.5 py-2.5 text-right',
                                            !t.dias[c] ? 'text-muted-foreground/60' : c === 'F' ? 'font-semibold text-red-700 dark:text-red-300' : 'text-foreground')}>
                                            {t.dias[c] ?? '—'}
                                        </td>
                                    ))}
                                    <td className={cn('px-2.5 py-2.5 text-right', t.ji ? 'text-foreground' : 'text-muted-foreground/60')}>{t.ji || '—'}</td>
                                    <td className="px-6 py-2.5 text-right text-base font-bold">{t.total}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-3">
                <p className="text-xs text-muted-foreground">
                    Referencia rápida. El cálculo oficial (base 30 y horas de JI) es el Excel del mes.
                </p>
                <div className="flex items-center gap-4">
                    {(ocultos > 0 || todos) && datos.lista.length > VISIBLES && (
                        // eslint-disable-next-line no-restricted-syntax -- alternar la lista
                        <button type="button" onClick={() => setTodos(v => !v)} aria-expanded={todos}
                            className="min-h-9 rounded text-xs font-semibold text-green-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 dark:text-green-300">
                            {todos ? 'Ver menos' : `Ver los ${datos.lista.length}`}
                        </button>
                    )}
                    {/* eslint-disable-next-line no-restricted-syntax -- enlace al módulo */}
                    <button type="button" onClick={onAsistencia}
                        className="inline-flex min-h-9 items-center gap-1 rounded text-xs font-semibold text-green-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 dark:text-green-300">
                        Excel del mes en Asistencia<ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Horas extra por obra ───
export const HorasExtraObras: React.FC<{ datos: NonNullable<DetalleAsistenciaApi['horasExtra']>; mesNombre: string }> = ({ datos, mesNombre }) => {
    const maximo = datos.porObra[0]?.horas ?? 0;
    return (
        <div className={CARD}>
            <div className="mb-5 flex items-start justify-between gap-3">
                <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold leading-none tracking-tight tabular-nums">{fmtHoras(datos.total).replace(' h', '')}</span>
                    <span className="text-sm text-muted-foreground">horas en {mesNombre}</span>
                </div>
                <span className="inline-flex items-center gap-1 text-label text-muted-foreground" title="Visible solo con el permiso de horas extra">
                    <Lock className="h-3 w-3" aria-hidden />Dato de pago
                </span>
            </div>
            {datos.porObra.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin horas extra registradas este mes.</p>
            ) : (
                <ul className="space-y-3.5">
                    {datos.porObra.map(o => (
                        <li key={o.obra_id}>
                            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-section">
                                <span className="truncate font-semibold">{o.obra}</span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                    {fmtHoras(o.horas)} · {o.trabajadores} {plural(o.trabajadores, 'persona', 'personas')}
                                </span>
                            </div>
                            <div className="h-2 rounded-full bg-muted" aria-hidden>
                                <div className="h-2 rounded-full bg-blue-600 dark:bg-blue-500" style={{ width: anchoRelativo(o.horas, maximo) }} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

// ─── Fase 3: tendencia de 6 meses ───

/** Colores del gráfico: ausentismo azul (informativo), faltas rojo (riesgo legal). Tokens no hay para ellos. */
const AZUL = '#2563EB';
const ROJO = '#DC2626';

const TooltipTendencia: React.FC<{ active?: boolean; payload?: { payload: MesTendencia }[] }> = ({ active, payload }) => {
    const m = payload?.[0]?.payload;
    if (!active || !m) return null;
    return (
        <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-[var(--shadow-md)]">
            <p className="mb-1 font-semibold capitalize text-foreground">{mesCorto(m.mes)}{m.parcial ? ' (hasta hoy)' : ''}</p>
            {m.tasa == null ? <p className="text-muted-foreground">Sin registros</p> : (
                <>
                    <p className="tabular-nums text-foreground"><span className="font-semibold">{fmtPct(m.tasa)}</span> ausentismo · {m.ausencias} días</p>
                    <p className="tabular-nums text-red-700 dark:text-red-300"><span className="font-semibold">{fmtPct(m.tasaFaltas ?? 0)}</span> faltas · {m.faltas} días</p>
                </>
            )}
        </div>
    );
};

export const TendenciaMeses: React.FC<{ meses: MesTendencia[] }> = ({ meses }) => {
    const reduce = useReducedMotion();
    const idGradiente = useId();
    const { actual, delta } = resumenTendencia(meses);
    const datos = meses.map(m => ({ ...m, etiqueta: mesCorto(m.mes) }));
    const descripcion = meses.filter(m => m.tasa != null).map(m => `${mesCorto(m.mes)} ${fmtPct(m.tasa as number)}`).join(', ');
    return (
        <div className={CARD}>
            {actual ? (
                <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-4xl font-bold leading-none tracking-tight tabular-nums">{fmtPct(actual.tasa as number)}</span>
                    <span className="text-sm text-muted-foreground">
                        ausentismo en {mesCorto(actual.mes)}{actual.parcial ? ' (hasta hoy)' : ''}
                        {delta != null && delta !== 0 && (
                            <> · <b className={cn('font-semibold', delta > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-300')}>
                                {delta > 0 ? '+' : '−'}{fmtPct(Math.abs(delta)).replace(' %', '')} pts
                            </b> vs el mes anterior</>
                        )}
                    </span>
                </div>
            ) : (
                <p className="mb-4 text-sm text-muted-foreground">Sin registros de asistencia en los últimos 6 meses.</p>
            )}
            <div className="h-[200px] w-full" role="img" aria-label={`Ausentismo por mes: ${descripcion || 'sin datos'}`}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={datos} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={AZUL} stopOpacity={0.18} />
                                <stop offset="95%" stopColor={AZUL} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="etiqueta" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                        <YAxis axisLine={false} tickLine={false} width={48} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                            tickFormatter={(v: number) => `${v} %`} domain={[0, 'auto']} allowDecimals={false} />
                        <Tooltip isAnimationActive={!reduce} content={<TooltipTendencia />} cursor={{ stroke: 'var(--border)' }} />
                        <Area type="monotone" dataKey="tasa" stroke={AZUL} strokeWidth={2.5} fill={`url(#${idGradiente})`}
                            connectNulls dot={{ r: 3.5, fill: 'var(--card)', stroke: AZUL, strokeWidth: 2 }}
                            activeDot={{ r: 5, fill: AZUL, stroke: 'var(--card)', strokeWidth: 2 }}
                            isAnimationActive={!reduce} animationDuration={600} />
                        <Line type="monotone" dataKey="tasaFaltas" stroke={ROJO} strokeWidth={2} strokeDasharray="5 4"
                            connectNulls dot={false} activeDot={{ r: 4, fill: ROJO, stroke: 'var(--card)', strokeWidth: 2 }}
                            isAnimationActive={!reduce} animationDuration={600} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-blue-600" aria-hidden />Ausentismo (sin vacaciones)</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-red-600" aria-hidden />Solo faltas (F)</span>
                <span>Días hábiles registrados</span>
            </div>
        </div>
    );
};

// ─── Fase 3: faltas por obra ───
export const FaltasPorObra: React.FC<{ obras: NonNullable<DetalleAsistenciaApi['faltasObra']>; mesNombre: string }> = ({ obras, mesNombre }) => {
    const maximo = obras[0]?.faltas ?? 0;
    const total = obras.reduce((s, o) => s + o.faltas, 0);
    return (
        <div className={CARD}>
            <div className="mb-5 flex items-baseline gap-2">
                <NumeroRodante value={total} className="text-4xl font-bold leading-none tracking-tight text-red-700 dark:text-red-300" />
                <span className="text-sm text-muted-foreground">{plural(total, 'falta', 'faltas')} en {mesNombre}</span>
            </div>
            {obras.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ninguna obra con faltas este mes.</p>
            ) : (
                <ul className="space-y-3.5">
                    {obras.slice(0, 8).map(o => (
                        <li key={o.obra_id}>
                            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-section">
                                <span className="truncate font-semibold">{o.obra}</span>
                                <span className="shrink-0 tabular-nums text-muted-foreground" title={`${o.faltas} faltas de ${o.registros} días registrados`}>
                                    {o.faltas} F · {fmtPct(o.tasa)}
                                </span>
                            </div>
                            <div className="h-2 rounded-full bg-muted" aria-hidden>
                                <div className="h-2 rounded-full bg-red-600 dark:bg-red-500" style={{ width: anchoRelativo(o.faltas, maximo) }} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {obras.length > 8 && <p className="mt-3 text-xs text-muted-foreground">y {obras.length - 8} obras más con faltas</p>}
        </div>
    );
};

// ─── Fase 3: faltas pegadas al fin de semana ───
export const PatronFinde: React.FC<{ datos: NonNullable<DetalleAsistenciaApi['patronFinde']>; onTrabajador: (rut: string) => void }> = ({ datos, onTrabajador }) => {
    const [abierto, setAbierto] = useState(false);
    const idLista = useId();
    const n = datos.lista.length;
    if (n === 0) return null;
    return (
        <div className="rounded-2xl bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
            <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <TrendingUp className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
                <p className="min-w-[240px] flex-1 text-section">
                    <b className="font-semibold">{n} {plural(n, 'trabajador falta', 'trabajadores faltan')} pegado{n === 1 ? '' : 's'} al fin de semana</b>
                    {' '}(viernes o lunes, {datos.minimo} o más veces en {datos.dias} días). No es causal del Art. 160, pero conviene conversarlo.
                </p>
                {/* eslint-disable-next-line no-restricted-syntax -- alternar la lista */}
                <button type="button" onClick={() => setAbierto(v => !v)} aria-expanded={abierto} aria-controls={idLista}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg px-1 text-section font-semibold text-amber-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 dark:text-amber-200">
                    {abierto ? 'Ocultar' : 'Ver quiénes'}
                    <ChevronDown className={cn('h-4 w-4 transition-transform duration-200 motion-reduce:transition-none', abierto && 'rotate-180')} aria-hidden />
                </button>
            </div>
            {abierto && (
                <ul id={idLista} className="border-t border-amber-200/70 px-5 py-1 dark:border-amber-500/20">
                    {datos.lista.map((t: TrabajadorPatron) => (
                        <li key={t.trabajador_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-amber-200/70 py-2.5 first:border-t-0 dark:border-amber-500/20">
                            {/* eslint-disable-next-line no-restricted-syntax -- enlace de fila */}
                            <button type="button" onClick={() => onTrabajador(t.rut)}
                                className="rounded text-left text-sm font-semibold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50">
                                {t.apellido_paterno} {t.nombres}
                            </button>
                            {t.obra && <span className="text-xs text-amber-800/80 dark:text-amber-200/80">{t.obra}</span>}
                            <span className="ml-auto text-xs tabular-nums text-amber-900 dark:text-amber-100">{fechasPatron(t.fechas)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
