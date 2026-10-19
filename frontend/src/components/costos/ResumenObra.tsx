import React from 'react';
import { Wallet, Receipt, PiggyBank, Clock, AlertTriangle, Info, FileSpreadsheet, ListPlus, TrendingUp, ChevronRight } from 'lucide-react';
import { Section } from '../ui/Section';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { fmtMoney, fmtNumber } from '../../utils/format';
import { pct } from './costosConfig';
import { Kpi, BarraAvance, PctGastado, Aviso } from './piezas';
import type { VistaDetalle } from './DetalleCostos';
import type { FiltroGastos } from './GastosObra';
import type { CostoDetalleObra } from '../../types/entities';

interface Props {
    detalle: CostoDetalleObra;
    onImportar: () => void;
    onAgregarPartida: () => void;
    /** Ir a otra pestaña (Presupuesto, o Gastos con un filtro). */
    onIr: (tab: 'presupuesto' | 'gastos', filtro?: FiltroGastos) => void;
    /** Abrir el detalle de un número (capítulo, partida, gastos generales, sin partida, modificaciones). */
    onDetalle: (v: VistaDetalle) => void;
    /** Quitar la obra del módulo: solo se ofrece si está vacía (sin partidas ni gastos). */
    onQuitar: () => void;
}

/**
 * Lo que se mira primero: cuánto se presupuestó (costo, sin utilidad), cuánto se gastó y cuánto
 * queda, por capítulo, y qué partidas se pasaron. Cada cifra que no es exacta lo dice al lado (neto
 * estimado, gastos sin asignar). Cada número con detalle se puede tocar («Ver ›»): las tarjetas
 * llevan a su lista, y cada capítulo abre sus partidas con las facturas que las componen. «Queda»
 * y las líneas del desglose son cuentas a la vista: no se tocan (salvo las modificaciones).
 */
export const ResumenObra: React.FC<Props> = ({ detalle, onImportar, onAgregarPartida, onIr, onDetalle, onQuitar }) => {
    const r = detalle.resumen;
    const pres = detalle.presupuesto;
    const sinPartidas = detalle.partidas.length === 0;
    const pasado = r.disponible < 0;

    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi icon={Wallet} label="Presupuesto de costo" valor={sinPartidas ? '—' : fmtMoney(r.costo_presupuestado) || '$0'}
                    nota={sinPartidas ? 'Falta cargar el presupuesto' : 'Costo directo + GG + imprevistos'}
                    onClick={sinPartidas ? undefined : () => onIr('presupuesto')} accion="Ver partidas" />
                <Kpi icon={Receipt} label="Gastado (neto)" valor={fmtMoney(r.gastado_neto) || '$0'}
                    tono={r.gastado_estimado ? 'aviso' : 'neutro'}
                    nota={r.pct_gastado !== null ? `${fmtNumber(r.pct_gastado, { decimals: 1 })} % del presupuesto${r.gastado_estimado ? ' · con netos estimados' : ''}` : `${fmtNumber(detalle.gastos.length)} documento${detalle.gastos.length === 1 ? '' : 's'}`}
                    onClick={detalle.gastos.length ? () => onIr('gastos') : undefined} accion="Ver facturas" />
                <Kpi icon={PiggyBank} label={pasado ? 'Pasado del presupuesto' : 'Queda'} tono={pasado ? 'peligro' : 'neutro'}
                    valor={sinPartidas ? '—' : fmtMoney(Math.abs(r.disponible)) || '$0'}
                    nota={sinPartidas ? undefined : pasado ? 'Se gastó más de lo presupuestado' : 'Presupuesto − gastado'} />
                <Kpi icon={Clock} label="Por pagar" valor={fmtMoney(r.por_pagar.monto) || '$0'} tono={r.vencidas.n ? 'peligro' : 'neutro'} notaPeligro={r.vencidas.n > 0}
                    nota={r.vencidas.n ? `${r.vencidas.n} vencida${r.vencidas.n === 1 ? '' : 's'}: ${fmtMoney(r.vencidas.monto)}` : `${fmtNumber(r.por_pagar.n)} documento${r.por_pagar.n === 1 ? '' : 's'} · con IVA`}
                    onClick={r.por_pagar.n ? () => onIr('gastos', 'pagar') : undefined} accion={r.vencidas.n ? 'Ver vencidas' : 'Ver'} />
            </div>

            {/* Avisos: cuándo la cifra NO es exacta y qué falta hacer */}
            {(r.gastado_estimado || r.sin_asignar > 0 || r.por_completar > 0) && (
                <div className="flex flex-col gap-2">
                    {r.gastado_estimado && (
                        <Aviso icon={Info}>
                            Hay facturas cargadas solo con el total: su neto se <strong>estimó</strong> (total ÷ 1,19). Si tienen exentos o impuestos específicos (combustible), el gastado real es distinto: completa el neto de esas facturas.{' '}
                            <Button variant="link" size="sm" className="text-xs" onClick={() => onIr('gastos', 'estimados')}>Ver cuáles</Button>
                        </Aviso>
                    )}
                    {r.sin_asignar > 0 && (
                        <Aviso icon={AlertTriangle}>
                            {fmtMoney(r.sin_asignar)} en gastos sin partida (con o sin categoría): cuentan en el total gastado, pero no en ningún capítulo.{' '}
                            <Button variant="link" size="sm" className="text-xs" onClick={() => onDetalle({ tipo: 'sin_asignar' })}>Ver cuáles</Button>
                        </Aviso>
                    )}
                    {r.por_completar > 0 && (
                        <Aviso icon={AlertTriangle}>
                            {r.por_completar} gasto{r.por_completar === 1 ? '' : 's'} por completar (falta proveedor o a qué corresponde).{' '}
                            <Button variant="link" size="sm" className="text-xs" onClick={() => onIr('gastos', 'completar')}>Completar</Button>
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
                        <div className="flex flex-col items-center gap-3">
                            <div className="flex flex-wrap justify-center gap-2">
                                <Button onClick={onImportar} leftIcon={<FileSpreadsheet className="h-4 w-4" />}>Importar Excel</Button>
                                <Button variant="glass" onClick={onAgregarPartida} leftIcon={<ListPlus className="h-4 w-4" />}>Agregar partida</Button>
                            </div>
                            {!detalle.gastos.length && (
                                <Button variant="link" size="sm" className="text-xs text-muted-foreground" onClick={onQuitar}>¿La agregaste por error? Quitarla de Presupuestos</Button>
                            )}
                        </div>
                    }
                />
            ) : (
                <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                    <Section title="Por capítulo" bodyClassName="p-2 sm:p-3">
                        <p className="px-2 pb-2 text-caption text-muted-foreground">Toca un capítulo para ver sus partidas y las facturas de cada una.</p>
                        <ul className="flex flex-col gap-1">
                            {r.capitulos.map(c => (
                                <li key={c.capitulo}>
                                    <FilaCapitulo nombre={c.capitulo} presupuestado={c.presupuestado} gastado={c.gastado}
                                        nota={`${c.partidas} partida${c.partidas === 1 ? '' : 's'}`}
                                        onClick={() => onDetalle({ tipo: 'capitulo', capitulo: c.capitulo })} />
                                </li>
                            ))}
                            {(r.gastos_generales > 0 || r.gastos_generales_gastado > 0) && (
                                <li className="mt-1 border-t border-border pt-1">
                                    <FilaCapitulo nombre="Gastos generales" sufijo="(sin partida)" presupuestado={r.gastos_generales} gastado={r.gastos_generales_gastado}
                                        onClick={() => onDetalle({ tipo: 'gastos_generales' })} />
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
                                        {/* La única línea con detalle: qué se agregó después del original y por qué. */}
                                        <div className="flex items-baseline justify-between gap-3 pl-2 text-caption">
                                            <dt>
                                                <Button variant="link" size="sm" className="text-caption font-semibold" onClick={() => onDetalle({ tipo: 'modificaciones' })}>· modificaciones</Button>
                                            </dt>
                                            <dd className="tabular-nums text-muted-foreground">{fmtMoney(r.costo_directo_modificaciones) || '$0'}</dd>
                                        </div>
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
                            <Section title={<span className="inline-flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-destructive" /> Partidas que se pasaron</span>} bodyClassName="p-2 sm:p-3">
                                <ul className="flex flex-col gap-1">
                                    {r.partidas_excedidas.map(p => (
                                        <li key={p.id}>
                                            {/* eslint-disable-next-line no-restricted-syntax -- fila que abre la partida con sus facturas (nombre, capítulo y montos); Button no soporta este layout */}
                                            <button type="button" onClick={() => onDetalle({ tipo: 'capitulo', capitulo: p.capitulo, partidaId: p.id })}
                                                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                                                <span className="min-w-0">
                                                    <span className="block truncate text-xs font-semibold text-brand-dark">{p.descripcion}</span>
                                                    <span className="block truncate text-caption text-muted-foreground">{p.capitulo}</span>
                                                </span>
                                                <span className="flex shrink-0 items-center gap-1.5 text-right">
                                                    <span>
                                                        <span className="block text-xs font-semibold text-destructive tabular-nums">+{fmtMoney(p.gastado - p.presupuestado)}</span>
                                                        <span className="block text-caption text-muted-foreground tabular-nums">de {fmtMoney(p.presupuestado) || '$0'}</span>
                                                    </span>
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
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

/** Capítulo como fila tocable de 44 px o más: nombre, %, barra y montos, con flecha. */
const FilaCapitulo: React.FC<{ nombre: string; sufijo?: string; nota?: string; presupuestado: number; gastado: number; onClick: () => void }> = ({ nombre, sufijo, nota, presupuestado, gastado, onClick }) => (
    // eslint-disable-next-line no-restricted-syntax -- fila de capítulo que abre su detalle (nombre, %, barra y montos); Button no soporta este layout
    <button type="button" onClick={onClick}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-semibold text-brand-dark">{nombre}{sufijo && <span className="font-normal text-muted-foreground"> {sufijo}</span>}</span>
                <PctGastado presupuestado={presupuestado} gastado={gastado} />
            </span>
            <BarraAvance presupuestado={presupuestado} gastado={gastado} />
            <span className="flex justify-between gap-3 text-caption text-muted-foreground tabular-nums">
                <span>{fmtMoney(gastado) || '$0'} gastado{nota ? ` · ${nota}` : ''}</span>
                <span>de {fmtMoney(presupuestado) || '$0'}</span>
            </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
);

const Fila: React.FC<{ label: string; valor: number; fuerte?: boolean; suave?: boolean }> = ({ label, valor, fuerte, suave }) => (
    <div className={fuerte ? 'flex items-baseline justify-between gap-3 border-t border-border pt-1.5 font-semibold text-brand-dark'
        : suave ? 'flex items-baseline justify-between gap-3 pl-2 text-caption text-muted-foreground'
            : 'flex items-baseline justify-between gap-3 text-muted-foreground'}>
        <dt>{label}</dt>
        <dd className="tabular-nums">{fmtMoney(valor) || '$0'}</dd>
    </div>
);

export default ResumenObra;
