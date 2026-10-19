import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, AlertTriangle, Wallet, ChevronDown, ChevronRight, CalendarClock, Info } from 'lucide-react';
import api from '../../services/api';
import { Button } from '../ui/Button';
import { CurrencyInput } from '../ui/CurrencyInput';
import { EmptyState } from '../ui/EmptyState';
import { PestanasElasticas } from '../ui/PestanasElasticas';
import { fmtMoney, fmtMoneyCompacto, fmtFechaCorta } from '../../utils/format';
import { cn } from '../../utils/cn';
import { CAMPO } from './costosConfig';
import { Kpi, Aviso } from './piezas';
import type { CostoBaldeFlujo, CostoFlujo, CostoObraLista } from '../../types/entities';

type Horizonte = '8' | '12' | '26';
const HORIZONTES: { key: Horizonte; label: string }[] = [
    { key: '8', label: '8 semanas' },
    { key: '12', label: '12 semanas' },
    { key: '26', label: '6 meses' },
];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** "19 – 25 oct" o "27 oct – 2 nov". */
function rango(desde: string | null, hasta: string | null) {
    if (!desde || !hasta) return '';
    const [, m1, d1] = desde.split('-').map(Number);
    const [, m2, d2] = hasta.split('-').map(Number);
    return m1 === m2 ? `${d1} – ${d2} ${MESES[m2 - 1]}` : `${d1} ${MESES[m1 - 1]} – ${d2} ${MESES[m2 - 1]}`;
}
const conSigno = (n: number) => (n < 0 ? `−${fmtMoney(Math.abs(n))}` : fmtMoney(n) || '$0');

interface Fila { balde: CostoBaldeFlujo; titulo: string; saldo: number }

/**
 * Flujo de caja de las próximas semanas: lo que entra (cobros por cobrar, por fecha esperada) contra
 * lo que sale (facturas por pagar, por vencimiento, con IVA). Lo atrasado se suma primero, como si
 * se pagara/cobrara ya. El saldo del banco es opcional y no se guarda.
 */
export const FlujoCaja: React.FC<{ obras: CostoObraLista[]; onIrObra: (obraId: number, tab: 'gastos' | 'cobros') => void }> = ({ obras, onIrObra }) => {
    const [horizonte, setHorizonte] = useState<Horizonte>('8');
    const [obraId, setObraId] = useState<number | ''>('');
    const [saldoInicial, setSaldoInicial] = useState(0);
    const [flujo, setFlujo] = useState<CostoFlujo | null>(null);
    const [falla, setFalla] = useState(false);
    const [abierta, setAbierta] = useState<string | null>(null);

    useEffect(() => {
        let cancelado = false;
        api.get<{ data: CostoFlujo }>('/costos/flujo', { params: { semanas: horizonte, ...(obraId ? { obra_id: obraId } : {}) } })
            .then(res => { if (!cancelado) { setFlujo(res.data.data); setFalla(false); } })
            .catch(() => { if (!cancelado) setFalla(true); });
        return () => { cancelado = true; };
    }, [horizonte, obraId]);

    const filas: Fila[] = useMemo(() => {
        if (!flujo) return [];
        let saldo = saldoInicial;
        const out: Fila[] = [];
        if (flujo.atrasado.items.length) {
            saldo += flujo.atrasado.neto;
            out.push({ balde: flujo.atrasado, titulo: 'Atrasado', saldo });
        }
        flujo.semanas.forEach((b, i) => {
            saldo += b.neto;
            out.push({ balde: b, titulo: i === 0 ? `Esta semana · ${rango(b.desde, b.hasta)}` : rango(b.desde, b.hasta), saldo });
        });
        return out;
    }, [flujo, saldoInicial]);

    if (falla && !flujo) return <EmptyState icon={Wallet} title="No se pudo cargar el flujo de caja" description="Vuelve a intentarlo en un momento." />;
    if (!flujo) return <div className="h-96 animate-pulse rounded-card border border-border bg-card" />;

    const vacio = !filas.some(f => f.balde.items.length) && !flujo.sin_fecha.items.length && !flujo.mas_adelante.items.length;
    const peor = filas.reduce<Fila | null>((m, f) => (!m || f.saldo < m.saldo ? f : m), null);
    const atrasoPagos = flujo.atrasado.salidas;
    const atrasoCobros = flujo.atrasado.entradas;

    return (
        <div className="flex flex-col gap-4">
            {/* Controles */}
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
                <div className="flex items-center overflow-x-auto -mx-1 px-1 md:mx-0 md:px-0 [scrollbar-width:none]">
                    <div className="flex shrink-0 rounded-2xl border border-border bg-card p-1">
                        <PestanasElasticas
                            opciones={HORIZONTES}
                            activa={horizonte}
                            onCambiar={setHorizonte}
                            aria-label="Horizonte del flujo"
                            claseFila="gap-1"
                            claseOpcion="inline-flex h-8 shrink-0 items-center justify-center rounded-xl px-3 font-medium whitespace-nowrap"
                            claseInactiva="text-muted-foreground hover:bg-background hover:text-brand-dark"
                            render={o => o.label}
                        />
                    </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:ml-auto xl:w-[34rem]">
                    <div>
                        <label htmlFor="flujo-obra" className="ml-0.5 text-sm font-medium text-muted-foreground">Obra</label>
                        <select id="flujo-obra" value={obraId} onChange={e => setObraId(e.target.value ? Number(e.target.value) : '')} className={CAMPO + ' mt-1.5'}>
                            <option value="">Todas las obras</option>
                            {obras.map(o => <option key={o.obra_id} value={o.obra_id}>{o.obra_nombre}</option>)}
                        </select>
                    </div>
                    <CurrencyInput label="Saldo en el banco hoy (opcional)" value={saldoInicial} onChange={setSaldoInicial} placeholder="No se guarda" />
                </div>
            </div>

            {vacio ? (
                <EmptyState icon={CalendarClock} title="Nada por pagar ni por cobrar"
                    description="El flujo se arma con las facturas «por pagar» (según su vencimiento) y los cobros «por cobrar» de cada obra (pestaña Cobros)." />
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Kpi icon={ArrowDownLeft} label="Entra" valor={fmtMoney(flujo.totales.entradas) || '$0'} nota="cobros esperados en el periodo" />
                        <Kpi icon={ArrowUpRight} label="Sale" valor={fmtMoney(flujo.totales.salidas) || '$0'} nota="facturas por pagar, con IVA" />
                        <Kpi icon={AlertTriangle} label="Atrasado" tono={atrasoPagos || atrasoCobros ? 'peligro' : 'neutro'} notaPeligro={!!(atrasoPagos || atrasoCobros)}
                            valor={fmtMoney(atrasoPagos) || '$0'}
                            nota={atrasoPagos || atrasoCobros ? `vencido sin pagar${atrasoCobros ? ` · ${fmtMoney(atrasoCobros)} sin cobrar` : ''}` : 'nada vencido'} />
                        <Kpi icon={Wallet} label="Semana más justa" tono={peor && peor.saldo < 0 ? 'peligro' : 'neutro'} notaPeligro={!!peor && peor.saldo < 0}
                            valor={peor ? conSigno(peor.saldo) : '—'}
                            nota={peor ? `${peor.titulo.replace('Esta semana · ', '')}${saldoInicial ? '' : ' · sin saldo del banco'}` : ''} />
                    </div>

                    {!saldoInicial && (
                        <Aviso icon={Info} tono="neutro">El saldo parte en $0: muestra si lo que entra alcanza para lo que sale. Escribe el saldo del banco para ver con cuánto quedaría la cuenta cada semana.</Aviso>
                    )}

                    <Grafico filas={filas} />

                    <section className="overflow-hidden rounded-card border border-border bg-card">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm tabular-nums">
                                <thead className="bg-brand-primary text-white">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left font-semibold">Semana</th>
                                        <th className="px-3 py-2.5 text-right font-semibold">Entra</th>
                                        <th className="px-3 py-2.5 text-right font-semibold">Sale</th>
                                        <th className="px-3 py-2.5 text-right font-semibold">Neto</th>
                                        <th className="px-4 py-2.5 text-right font-semibold">{saldoInicial ? 'Saldo' : 'Acumulado'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filas.map(f => {
                                        const abiertaEsta = abierta === f.balde.clave;
                                        const tiene = f.balde.items.length > 0;
                                        return (
                                            <React.Fragment key={f.balde.clave}>
                                                <tr className={cn('border-t border-border', f.balde.clave === 'atrasado' && 'bg-destructive/5', tiene && 'cursor-pointer hover:bg-muted/40')}
                                                    onClick={() => tiene && setAbierta(abiertaEsta ? null : f.balde.clave)}>
                                                    <td className="px-4 py-2.5 text-left">
                                                        {/* eslint-disable-next-line no-restricted-syntax -- disparador de la fila desplegable (la fila entera también responde al clic) */}
                                                        <button type="button" disabled={!tiene} aria-expanded={abiertaEsta} onClick={e => { e.stopPropagation(); setAbierta(abiertaEsta ? null : f.balde.clave); }}
                                                            className="inline-flex items-center gap-1.5 rounded text-left font-medium text-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 disabled:cursor-default">
                                                            {tiene ? (abiertaEsta ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />) : <span className="w-3.5" />}
                                                            <span className={f.balde.clave === 'atrasado' ? 'text-destructive' : ''}>{f.titulo}</span>
                                                            {tiene && <span className="text-caption font-normal text-muted-foreground">· {f.balde.items.length}</span>}
                                                        </button>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right text-brand-dark">{f.balde.entradas ? fmtMoney(f.balde.entradas) : '—'}</td>
                                                    <td className="px-3 py-2.5 text-right text-brand-dark">{f.balde.salidas ? fmtMoney(f.balde.salidas) : '—'}</td>
                                                    <td className={cn('px-3 py-2.5 text-right font-medium', f.balde.neto < 0 ? 'text-destructive' : 'text-brand-dark')}>{f.balde.neto ? conSigno(f.balde.neto) : '—'}</td>
                                                    <td className={cn('px-4 py-2.5 text-right font-semibold', f.saldo < 0 ? 'text-destructive' : 'text-brand-dark')}>{conSigno(f.saldo)}</td>
                                                </tr>
                                                {abiertaEsta && (
                                                    <tr className="bg-muted/30">
                                                        <td colSpan={5} className="px-4 py-2">
                                                            <Movimientos balde={f.balde} onIrObra={onIrObra} />
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {(flujo.sin_fecha.items.length > 0 || flujo.mas_adelante.items.length > 0) && (
                        <div className="grid gap-3 md:grid-cols-2">
                            {flujo.sin_fecha.items.length > 0 && (
                                <Pendiente icon={AlertTriangle} titulo={`Sin fecha de vencimiento · ${flujo.sin_fecha.items.length}`}
                                    texto={`${fmtMoney(flujo.sin_fecha.salidas)} por pagar${flujo.sin_fecha.entradas ? ` y ${fmtMoney(flujo.sin_fecha.entradas)} por cobrar` : ''} que no se pueden ubicar en ninguna semana. Ponles fecha para que entren al flujo.`}
                                    balde={flujo.sin_fecha} onIrObra={onIrObra} />
                            )}
                            {flujo.mas_adelante.items.length > 0 && (
                                <Pendiente icon={CalendarClock} titulo={`Más adelante · ${flujo.mas_adelante.items.length}`}
                                    texto={`Después del periodo: entra ${fmtMoney(flujo.mas_adelante.entradas) || '$0'} y sale ${fmtMoney(flujo.mas_adelante.salidas) || '$0'}.`}
                                    balde={flujo.mas_adelante} onIrObra={onIrObra} />
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

const Movimientos: React.FC<{ balde: CostoBaldeFlujo; onIrObra: (obraId: number, tab: 'gastos' | 'cobros') => void }> = ({ balde, onIrObra }) => (
    <ul className="flex flex-col divide-y divide-border">
        {balde.items.map(m => (
            <li key={`${m.tipo}-${m.id}`} className="flex items-center gap-3 py-2">
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', m.tipo === 'cobro' ? 'bg-brand-primary/10' : 'bg-muted')}>
                    {m.tipo === 'cobro' ? <ArrowDownLeft className="h-3.5 w-3.5 text-brand-primary" /> : <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-brand-dark">{m.detalle}</span>
                    <span className="block truncate text-caption text-muted-foreground">{m.obra_nombre}{m.fecha ? ` · ${m.tipo === 'cobro' ? 'se espera' : 'vence'} ${fmtFechaCorta(m.fecha)}` : ''}</span>
                </span>
                <span className={cn('shrink-0 text-xs font-semibold tabular-nums', m.tipo === 'cobro' ? 'text-brand-dark' : 'text-muted-foreground')}>
                    {m.tipo === 'cobro' ? '+' : '−'}{fmtMoney(m.monto)}
                </span>
                <Button variant="link" size="sm" className="shrink-0 text-xs" onClick={() => onIrObra(m.obra_id, m.tipo === 'cobro' ? 'cobros' : 'gastos')}>Ver ›</Button>
            </li>
        ))}
    </ul>
);

const Pendiente: React.FC<{ icon: React.ElementType; titulo: string; texto: string; balde: CostoBaldeFlujo; onIrObra: (obraId: number, tab: 'gastos' | 'cobros') => void }> = ({ icon: Icon, titulo, texto, balde, onIrObra }) => {
    const [ver, setVer] = useState(false);
    return (
        <section className="rounded-card border border-border bg-card px-4 py-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-brand-dark"><Icon className="h-4 w-4 text-muted-foreground" />{titulo}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{texto}</p>
            <Button variant="link" size="sm" className="mt-1 text-xs" onClick={() => setVer(v => !v)}>{ver ? 'Ocultar' : 'Ver cuáles'} ›</Button>
            {ver && <div className="mt-1"><Movimientos balde={balde} onIrObra={onIrObra} /></div>}
        </section>
    );
};

/** Neto de cada semana (barras) y saldo acumulado (línea), a una sola escala. */
const Grafico: React.FC<{ filas: Fila[] }> = ({ filas }) => {
    if (filas.length < 2) return null;
    const W = 760, H = 220, L = 70, R = 16, T = 14, B = 28;
    const valores = filas.flatMap(f => [f.balde.neto, f.saldo, 0]);
    let min = Math.min(...valores), max = Math.max(...valores);
    if (min === max) { min -= 1; max += 1; }
    const paso = (W - L - R) / filas.length;
    const y = (v: number) => T + ((max - v) / (max - min)) * (H - T - B);
    // El $0 siempre a la vista cuando el rango lo cruza: es la línea que importa.
    const ticks = min < 0 && max > 0 ? [max, 0, min] : [max, (max + min) / 2, min];
    const linea = filas.map((f, i) => `${i ? 'L' : 'M'}${(L + paso * i + paso / 2).toFixed(1)} ${y(f.saldo).toFixed(1)}`).join(' ');
    return (
        <section className="rounded-card border border-border bg-card px-2 pb-1 pt-3">
            <div className="flex flex-wrap gap-4 px-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-primary" />Entra más de lo que sale</span>
                <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-destructive" />Sale más de lo que entra</span>
                <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-5 rounded bg-brand-dark" />Acumulado</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 block h-auto w-full" role="img" aria-label="Neto de cada semana y saldo acumulado">
                {ticks.map((v, i) => (
                    <g key={i}>
                        <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
                        <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={11} className="fill-muted-foreground">{v < 0 ? `−${fmtMoneyCompacto(-v)}` : fmtMoneyCompacto(v)}</text>
                    </g>
                ))}
                <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="stroke-muted-foreground" strokeWidth={1} />
                {filas.map((f, i) => {
                    const x = L + paso * i + paso * 0.2;
                    const top = Math.min(y(f.balde.neto), y(0));
                    const alto = Math.max(1, Math.abs(y(f.balde.neto) - y(0)));
                    return (
                        <g key={f.balde.clave}>
                            {f.balde.neto !== 0 && <rect x={x} y={top} width={paso * 0.6} height={alto} rx={3} className={f.balde.neto >= 0 ? 'fill-brand-primary' : 'fill-destructive'} opacity={0.85} />}
                            <text x={L + paso * i + paso / 2} y={H - 10} textAnchor="middle" fontSize={11} className="fill-muted-foreground">
                                {f.balde.clave === 'atrasado' ? 'Atras.' : (f.balde.desde || '').slice(8, 10) + '/' + (f.balde.desde || '').slice(5, 7)}
                            </text>
                        </g>
                    );
                })}
                <path d={linea} fill="none" className="stroke-brand-dark" strokeWidth={2} />
                {filas.map((f, i) => <circle key={f.balde.clave} cx={L + paso * i + paso / 2} cy={y(f.saldo)} r={3} className={f.saldo < 0 ? 'fill-destructive' : 'fill-brand-dark'} />)}
            </svg>
        </section>
    );
};

export default FlujoCaja;
