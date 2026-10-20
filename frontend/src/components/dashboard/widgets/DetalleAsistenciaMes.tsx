import React, { useState } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Chip } from '../../ui/Chip';
import { NumeroRodante } from '../../ui/NumeroRodante';
import {
    anchoRelativo, bloqueFecha, describirEvento, fmtHoras,
    type DetalleAsistenciaApi,
} from './resumenAsistenciaDetalle';

/**
 * Bloques de la fase 2 del detalle «Asistencia» del Inicio (dueño 2026-10-20): lo que viene en 14 días,
 * los descuentos del mes para remuneraciones y las horas extra por obra. Cada uno recibe su bloque de
 * GET /dashboard/asistencia ya no-null (sin permiso, el detalle ni lo monta).
 */

const CARD = 'rounded-3xl bg-card p-6 text-foreground shadow-[var(--shadow-md)]';
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

// ─── Próximos 14 días ───
export const ProximosDias: React.FC<{ datos: NonNullable<DetalleAsistenciaApi['proximos']>; hoy: string }> = ({ datos, hoy }) => (
    <div className={cn(CARD, 'py-3')}>
        {datos.eventos.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Nada programado: ni licencias ni vacaciones que empiecen o terminen, ni feriados.</p>
        ) : (
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
        )}
    </div>
);

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
