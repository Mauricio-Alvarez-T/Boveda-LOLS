import React from 'react';
import { Wallet, Receipt, PiggyBank, Clock, AlertTriangle, Info, FileSpreadsheet, ListPlus, TrendingUp } from 'lucide-react';
import { Section } from '../ui/Section';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { fmtMoney, fmtNumber } from '../../utils/format';
import { pct } from './costosConfig';
import { Kpi, BarraAvance, PctGastado, Aviso } from './piezas';
import type { CostoDetalleObra } from '../../types/entities';

interface Props {
    detalle: CostoDetalleObra;
    onImportar: () => void;
    onAgregarPartida: () => void;
    onVerGastos: (filtro: 'completar' | 'pagar') => void;
    onVerPartida: (id: number) => void;
}

/**
 * Lo que se mira primero: cuánto se presupuestó (costo, sin utilidad), cuánto se
 * gastó y cuánto queda, por capítulo, y qué partidas se pasaron. Cada cifra que
 * no es exacta lo dice al lado (neto estimado, gastos sin asignar).
 */
export const ResumenObra: React.FC<Props> = ({ detalle, onImportar, onAgregarPartida, onVerGastos, onVerPartida }) => {
    const r = detalle.resumen;
    const pres = detalle.presupuesto;
    const sinPartidas = detalle.partidas.length === 0;
    const pasado = r.disponible < 0;

    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi icon={Wallet} label="Presupuesto de costo" valor={sinPartidas ? '—' : fmtMoney(r.costo_presupuestado) || '$0'}
                    nota={sinPartidas ? 'Falta cargar el presupuesto' : 'Costo directo + GG + imprevistos'} />
                <Kpi icon={Receipt} label="Gastado (neto)" valor={fmtMoney(r.gastado_neto) || '$0'}
                    tono={r.gastado_estimado ? 'aviso' : 'neutro'}
                    nota={r.pct_gastado !== null ? `${fmtNumber(r.pct_gastado, { decimals: 1 })} % del presupuesto${r.gastado_estimado ? ' · con netos estimados' : ''}` : `${fmtNumber(detalle.gastos.length)} documento${detalle.gastos.length === 1 ? '' : 's'}`} />
                <Kpi icon={PiggyBank} label={pasado ? 'Pasado del presupuesto' : 'Queda'} tono={pasado ? 'peligro' : 'neutro'}
                    valor={sinPartidas ? '—' : fmtMoney(Math.abs(r.disponible)) || '$0'}
                    nota={sinPartidas ? undefined : pasado ? 'Se gastó más de lo presupuestado' : 'Presupuesto − gastado'} />
                <Kpi icon={Clock} label="Por pagar" valor={fmtMoney(r.por_pagar.monto) || '$0'} tono={r.vencidas.n ? 'peligro' : 'neutro'} notaPeligro={r.vencidas.n > 0}
                    nota={r.vencidas.n ? `${r.vencidas.n} vencida${r.vencidas.n === 1 ? '' : 's'}: ${fmtMoney(r.vencidas.monto)}` : `${fmtNumber(r.por_pagar.n)} documento${r.por_pagar.n === 1 ? '' : 's'} · con IVA`} />
            </div>

            {/* Avisos: cuándo la cifra NO es exacta y qué falta hacer */}
            {(r.gastado_estimado || r.sin_asignar > 0 || r.por_completar > 0) && (
                <div className="flex flex-col gap-2">
                    {r.gastado_estimado && (
                        <Aviso icon={Info}>Hay facturas cargadas solo con el total: su neto se <strong>estimó</strong> (total ÷ 1,19). Si tienen exentos o impuestos específicos (combustible), el gastado real es distinto: completa el neto de esas facturas.</Aviso>
                    )}
                    {r.sin_asignar > 0 && (
                        <Aviso icon={AlertTriangle}>{fmtMoney(r.sin_asignar)} en gastos sin partida (con o sin categoría): cuentan en el total gastado, pero no en ningún capítulo.</Aviso>
                    )}
                    {r.por_completar > 0 && (
                        <Aviso icon={AlertTriangle}>
                            {r.por_completar} gasto{r.por_completar === 1 ? '' : 's'} por completar (falta proveedor o a qué corresponde).{' '}
                            <Button variant="link" size="sm" className="text-xs" onClick={() => onVerGastos('completar')}>Completar ›</Button>
                        </Aviso>
                    )}
                </div>
            )}

            {sinPartidas ? (
                <EmptyState
                    icon={FileSpreadsheet}
                    title="Esta obra aún no tiene presupuesto"
                    description="Importa el Excel del presupuesto (itemizado) o agrega las partidas a mano. Los gastos se pueden ir cargando desde ya."
                    action={
                        <div className="flex flex-wrap justify-center gap-2">
                            <Button onClick={onImportar} leftIcon={<FileSpreadsheet className="h-4 w-4" />}>Importar Excel</Button>
                            <Button variant="glass" onClick={onAgregarPartida} leftIcon={<ListPlus className="h-4 w-4" />}>Agregar partida</Button>
                        </div>
                    }
                />
            ) : (
                <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                    <Section title="Por capítulo">
                        <ul className="flex flex-col gap-3.5">
                            {r.capitulos.map(c => (
                                <li key={c.capitulo}>
                                    <div className="mb-1 flex items-baseline justify-between gap-3">
                                        <span className="min-w-0 truncate text-sm font-semibold text-brand-dark">{c.capitulo}</span>
                                        <PctGastado presupuestado={c.presupuestado} gastado={c.gastado} />
                                    </div>
                                    <BarraAvance presupuestado={c.presupuestado} gastado={c.gastado} />
                                    <div className="mt-1 flex justify-between gap-3 text-caption text-muted-foreground tabular-nums">
                                        <span>{fmtMoney(c.gastado) || '$0'} gastado</span>
                                        <span>de {fmtMoney(c.presupuestado) || '$0'}</span>
                                    </div>
                                </li>
                            ))}
                            {(r.gastos_generales > 0 || r.gastos_generales_gastado > 0) && (
                                <li className="border-t border-border pt-3">
                                    <div className="mb-1 flex items-baseline justify-between gap-3">
                                        <span className="min-w-0 truncate text-sm font-semibold text-brand-dark">Gastos generales <span className="font-normal text-muted-foreground">(sin partida)</span></span>
                                        <PctGastado presupuestado={r.gastos_generales} gastado={r.gastos_generales_gastado} />
                                    </div>
                                    <BarraAvance presupuestado={r.gastos_generales} gastado={r.gastos_generales_gastado} />
                                    <div className="mt-1 flex justify-between gap-3 text-caption text-muted-foreground tabular-nums">
                                        <span>{fmtMoney(r.gastos_generales_gastado) || '$0'} gastado</span>
                                        <span>de {fmtMoney(r.gastos_generales) || '$0'}</span>
                                    </div>
                                </li>
                            )}
                        </ul>
                    </Section>

                    <div className="flex flex-col gap-4">
                        <Section title="Desglose del presupuesto">
                            <dl className="flex flex-col gap-1.5 text-xs">
                                <Fila label="Costo directo" valor={r.costo_directo} />
                                {r.costo_directo_modificaciones !== 0 && (
                                    <>
                                        <Fila label="· original" valor={r.costo_directo_original} suave />
                                        <Fila label="· modificaciones" valor={r.costo_directo_modificaciones} suave />
                                    </>
                                )}
                                <Fila label={`Gastos generales (${pct(pres?.gg_pct ?? 0)})`} valor={r.gastos_generales} />
                                <Fila label={`Imprevistos (${pct(pres?.imprevistos_pct ?? 0)})`} valor={r.imprevistos} />
                                <Fila label="Costo presupuestado" valor={r.costo_presupuestado} fuerte />
                                <Fila label={`Utilidad (${pct(pres?.utilidad_pct ?? 0)})`} valor={r.utilidad} />
                                <Fila label="Neto" valor={r.neto} fuerte />
                                <Fila label={`IVA (${pct(pres?.iva_pct ?? 19)})`} valor={r.iva} />
                                <Fila label="Total con IVA" valor={r.total} fuerte />
                            </dl>
                        </Section>

                        {r.partidas_excedidas.length > 0 && (
                            <Section title={<span className="inline-flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-destructive" /> Partidas que se pasaron</span>}>
                                <ul className="flex flex-col divide-y divide-border">
                                    {r.partidas_excedidas.map(p => (
                                        <li key={p.id}>
                                            {/* eslint-disable-next-line no-restricted-syntax -- fila de lista que abre la partida (nombre, capítulo y montos); Button no soporta este layout */}
                                            <button type="button" onClick={() => onVerPartida(p.id)}
                                                className="flex w-full items-start justify-between gap-3 py-2 text-left hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded-lg">
                                                <span className="min-w-0">
                                                    <span className="block truncate text-xs font-semibold text-brand-dark">{p.descripcion}</span>
                                                    <span className="block truncate text-caption text-muted-foreground">{p.capitulo}</span>
                                                </span>
                                                <span className="shrink-0 text-right">
                                                    <span className="block text-xs font-semibold text-destructive tabular-nums">+{fmtMoney(p.gastado - p.presupuestado)}</span>
                                                    <span className="block text-caption text-muted-foreground tabular-nums">de {fmtMoney(p.presupuestado) || '$0'}</span>
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </Section>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const Fila: React.FC<{ label: string; valor: number; fuerte?: boolean; suave?: boolean }> = ({ label, valor, fuerte, suave }) => (
    <div className={fuerte ? 'flex items-baseline justify-between gap-3 border-t border-border pt-1.5 font-semibold text-brand-dark'
        : suave ? 'flex items-baseline justify-between gap-3 pl-2 text-caption text-muted-foreground'
            : 'flex items-baseline justify-between gap-3 text-muted-foreground'}>
        <dt>{label}</dt>
        <dd className="tabular-nums">{fmtMoney(valor) || '$0'}</dd>
    </div>
);

export default ResumenObra;
