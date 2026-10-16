import React, { useMemo, useState } from 'react';
import {
    ChevronLeft, Wallet, Clock, Lock, Undo2, Gauge, Receipt, TrendingUp, Percent, FileDown, Wand2,
    HardHat, CalendarDays, AlertTriangle, CheckCircle2, Users, ShoppingCart, ListChecks, Stamp, Info,
} from 'lucide-react';
import { Button } from '../../ui/Button';
import { Chip, type ChipTone } from '../../ui/Chip';
import { PestanasElasticas } from '../../ui/PestanasElasticas';
import { fmtMoney, fmtMoneyCompacto, fmtNumber } from '../../../utils/format';
import { Kpi, Aviso } from '../piezas';
import { cn } from '../../../utils/cn';
import {
    CAPITULOS, EPS_BASE, FACTURAS_SII, CARGOS_MO, MESES, PLAN_PCT, REAL_HASTA_SEP, MO_PRESUPUESTO_MES,
    ANTICIPO, RETENCION, LEYES_SOCIALES, suma, avanceGlobal, montosEP, proyeccion, costoDiario, type Capitulo,
} from './datosPropuesta';

/**
 * «Lo que viene» en Presupuestos — SOLO staging (Costos.tsx lo gatea con VITE_ENTORNO). Prototipo con
 * datos inventados para la reunión con Rodrigo (16-10-2026): cómo se verían las mejoras propuestas
 * tras comparar con MásConstruye. No llama a la API ni guarda nada.
 */

type Clave = 'ep' | 'avance' | 'sii' | 'mano' | 'curva' | 'despues';
const PESTANAS: { key: Clave; label: string; n?: number }[] = [
    { key: 'ep', label: 'Estados de pago', n: 1 },
    { key: 'avance', label: 'Avance vs costo', n: 2 },
    { key: 'sii', label: 'Facturas del SII', n: 3 },
    { key: 'mano', label: 'Mano de obra', n: 4 },
    { key: 'curva', label: 'Curva de inversión', n: 5 },
    { key: 'despues', label: 'Después' },
];

const pct = (n: number, d = 0) => `${fmtNumber(n, { decimals: d })} %`;
const plata = (n: number) => fmtMoney(n) || '$0';

const TH = 'px-3 py-2.5 font-semibold whitespace-nowrap text-right first:text-left';
const TD = 'px-3 py-2.5 whitespace-nowrap text-right first:text-left border-t border-border';

const Tabla: React.FC<{ cabeza: React.ReactNode[]; izquierda?: number[]; children: React.ReactNode }> = ({ cabeza, izquierda = [], children }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
            <thead className="bg-brand-primary text-white">
                <tr>{cabeza.map((c, i) => <th key={i} className={cn(TH, izquierda.includes(i) && 'text-left')}>{c}</th>)}</tr>
            </thead>
            <tbody>{children}</tbody>
        </table>
    </div>
);

const Tarjeta: React.FC<{ titulo: string; detalle?: string; nota?: React.ReactNode; children: React.ReactNode }> = ({ titulo, detalle, nota, children }) => (
    <section className="overflow-hidden rounded-card border border-border bg-card">
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3">
            <h3 className="text-base font-bold text-brand-dark">{titulo}</h3>
            {detalle && <span className="text-xs text-muted-foreground">{detalle}</span>}
        </header>
        {children}
        {nota && <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{nota}</p>}
    </section>
);

const ParaQue: React.FC<{ para: React.ReactNode; necesita: React.ReactNode }> = ({ para, necesita }) => (
    <div className="grid gap-3 md:grid-cols-2">
        {[['Para qué sirve', para], ['Qué necesitamos de ustedes', necesita]].map(([t, c]) => (
            <div key={t as string} className="rounded-2xl border border-border bg-card px-4 py-3">
                <h4 className="mb-1 text-label font-bold uppercase tracking-wider text-muted-foreground">{t}</h4>
                <p className="text-sm text-brand-dark">{c}</p>
            </div>
        ))}
    </div>
);

/** Avance de un capítulo en el EP 8: se escribe libre y se aplica al salir del campo. */
const InputAvance: React.FC<{ id: string; valor: number; minimo: number; nombre: string; onCambio: (v: number) => void }> = ({ id, valor, minimo, nombre, onCambio }) => {
    const [texto, setTexto] = useState(String(valor));
    const aplicar = () => {
        const v = Math.round(Number(texto.replace(',', '.')));
        const ok = Number.isFinite(v) ? Math.min(100, Math.max(minimo, v)) : valor;
        setTexto(String(ok));
        onCambio(ok);
    };
    return (
        <span className="inline-flex items-center gap-1">
            <input id={id} aria-label={`Avance de ${nombre} en el EP 8`} value={texto} inputMode="numeric"
                onChange={e => setTexto(e.target.value)} onBlur={aplicar} onKeyDown={e => { if (e.key === 'Enter') aplicar(); }}
                className="w-16 rounded-lg border border-border bg-card px-2 py-1 text-right text-sm tabular-nums text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
            %
        </span>
    );
};

export const PropuestaCostos: React.FC<{ onVolver: () => void }> = ({ onVolver }) => {
    const [tab, setTab] = useState<Clave>('ep');
    const [av8, setAv8] = useState<number[]>(() => CAPITULOS.map(c => c.av8));
    const caps: Capitulo[] = useMemo(() => CAPITULOS.map((c, i) => ({ ...c, av8: av8[i] })), [av8]);

    const contrato = suma(caps, 'venta');
    const costo = suma(caps, 'costo');
    const gastado = suma(caps, 'gastado');
    const av7Global = avanceGlobal(caps, 'av7');
    const av8Global = avanceGlobal(caps, 'av8');

    const eps = useMemo(() => {
        const avs = EPS_BASE.map(ep => ep.av ?? av7Global);
        return EPS_BASE.map((ep, i) => ({ ...ep, av: avs[i], ...montosEP(contrato, i ? avs[i - 1] : 0, avs[i]) }));
    }, [contrato, av7Global]);
    const totEP = eps.reduce((s, e) => ({ bruto: s.bruto + e.bruto, anticipo: s.anticipo + e.anticipo, retencion: s.retencion + e.retencion, liquido: s.liquido + e.liquido }),
        { bruto: 0, anticipo: 0, retencion: 0, liquido: 0 });
    const ep8 = montosEP(contrato, av7Global, av8Global);

    const proys = caps.map(proyeccion);
    const proyTotal = proys.reduce((s, p) => s + p.proy, 0);
    const peor = caps.map((c, i) => ({ c, ...proys[i] })).filter(p => p.confiable && p.dif > 0).sort((a, b) => b.dif - a.dif)[0];

    return (
        <div className="flex flex-col gap-4">
            {/* Cabecera */}
            <div className="flex flex-col gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={onVolver} leftIcon={<ChevronLeft className="h-4 w-4" />} className="-ml-2 shrink-0">Presupuestos</Button>
                    <h2 className="min-w-0 text-lg font-bold tracking-headline text-brand-dark">Lo que viene</h2>
                    <Chip tone="warning" label="Ejemplo" />
                </div>
                <Aviso icon={Info}>
                    <strong>Datos inventados</strong> para mostrar cómo se verían las mejoras. «Obra de ejemplo» no es una obra real y nada de esto se guarda.
                </Aviso>
            </div>

            <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0">
                    <h3 className="text-title font-bold tracking-headline text-brand-dark">Obra de ejemplo</h3>
                    <p className="text-sm text-muted-foreground">Edificio habitacional de 5 pisos · mes 8 de 10 · corte al 20-10-2026</p>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-left">
                    {[['Contrato (neto)', plata(contrato)], ['Costo presupuestado', plata(costo)], ['Margen esperado', pct(((contrato - costo) / contrato) * 100, 1)]].map(([l, v]) => (
                        <div key={l} className="min-w-0 rounded-xl bg-muted/50 px-3 py-2">
                            <dt className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">{l}</dt>
                            <dd className="text-sm font-bold text-brand-dark tabular-nums break-all">{v}</dd>
                        </div>
                    ))}
                </dl>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs font-semibold text-muted-foreground">Ya está en test:</span>
                {['Presupuesto por partidas', 'Importar el Excel', 'Gastos con foto', 'Gastado por capítulo', 'Historial'].map(t => <Chip key={t} tone="success" label={t} />)}
            </div>

            <div className="flex items-center overflow-x-auto -mx-1 px-1 md:mx-0 md:px-0 [scrollbar-width:none]">
                <div className="flex shrink-0 rounded-2xl border border-border bg-card p-1">
                    <PestanasElasticas
                        opciones={PESTANAS}
                        activa={tab}
                        onCambiar={setTab}
                        aria-label="Mejoras propuestas"
                        claseFila="gap-1"
                        claseOpcion="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 font-medium whitespace-nowrap"
                        claseInactiva="text-muted-foreground hover:bg-background hover:text-brand-dark"
                        render={o => (<>{o.n && <span className="tabular-nums opacity-70">{o.n}</span>}{o.label}</>)}
                    />
                </div>
            </div>
            <p className="-mt-2 text-caption text-muted-foreground">Las pestañas numeradas van en el orden en que propongo hacerlas.</p>

            {/* 1 · Estados de pago */}
            {tab === 'ep' && (
                <div className="flex flex-col gap-4">
                    <ParaQue
                        para="Llevar los estados de pago al mandante: cuánto se cobra cada mes según el avance, cuánto queda retenido y cuánto del anticipo se va devolviendo. Así se ve lo cobrado al lado de lo gastado."
                        necesita="Un estado de pago real (el formato que usan), el porcentaje de retención y de anticipo de los contratos, y si la retención tiene tope." />
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Kpi icon={Wallet} label="Cobrado y pagado" valor={plata(eps.filter(e => e.estado === 'Pagado').reduce((s, e) => s + e.liquido, 0))} nota="EP 1 a 6" />
                        <Kpi icon={Clock} label="Aprobado, por pagar" valor={plata(eps.filter(e => e.estado === 'Aprobado').reduce((s, e) => s + e.liquido, 0))} nota="EP 7" />
                        <Kpi icon={Lock} label="Retenido por el mandante" valor={plata(totEP.retencion)} nota="se devuelve al recibir la obra" />
                        <Kpi icon={Undo2} label="Anticipo por devolver" valor={plata(contrato * ANTICIPO - totEP.anticipo)} nota={`de ${plata(contrato * ANTICIPO)} recibido`} />
                    </div>
                    <Tarjeta titulo="Estados de pago presentados" detalle="Montos netos, sin IVA">
                        <Tabla cabeza={['Estado de pago', 'Avance acumulado', 'Avance del mes', 'Devolución anticipo', 'Retención', 'Líquido a pagar', 'Estado']} izquierda={[6]}>
                            {eps.map(e => (
                                <tr key={e.n}>
                                    <td className={TD}><span className="font-semibold text-brand-dark">EP {e.n}</span><span className="block text-caption text-muted-foreground">{e.fecha}</span></td>
                                    <td className={TD}>{pct(e.av, 1)}</td>
                                    <td className={TD}>{plata(e.bruto)}</td>
                                    <td className={TD}>−{plata(e.anticipo)}</td>
                                    <td className={TD}>−{plata(e.retencion)}</td>
                                    <td className={cn(TD, 'font-semibold text-brand-dark')}>{plata(e.liquido)}</td>
                                    <td className={cn(TD, 'text-left')}><Chip tone={e.estado === 'Pagado' ? 'success' : 'info'} label={e.estado === 'Pagado' ? 'Pagado' : 'Aprobado · por pagar'} /></td>
                                </tr>
                            ))}
                            <tr className="bg-muted/60 font-bold text-brand-dark">
                                <td className={TD}>Total</td><td className={TD}>{pct(av7Global, 1)}</td><td className={TD}>{plata(totEP.bruto)}</td>
                                <td className={TD}>−{plata(totEP.anticipo)}</td><td className={TD}>−{plata(totEP.retencion)}</td><td className={TD}>{plata(totEP.liquido)}</td><td className={TD} />
                            </tr>
                        </Tabla>
                    </Tarjeta>
                    <Tarjeta titulo="Estado de pago N° 8 · en preparación" detalle="Prueba: cambia el avance de un capítulo y se recalcula todo"
                        nota={`Ejemplo: retención ${pct(RETENCION * 100)} de cada estado de pago y anticipo ${pct(ANTICIPO * 100)} del contrato, devuelto en proporción al avance. Las reglas reales salen de cada contrato.`}>
                        <Tabla cabeza={['Capítulo', 'Avance EP 7', 'Avance EP 8', 'Monto del mes']}>
                            {caps.map((c, i) => (
                                <tr key={c.nombre}>
                                    <td className={cn(TD, 'whitespace-normal')}><span className="font-medium text-brand-dark">{c.nombre}</span><span className="block text-caption text-muted-foreground">{plata(c.venta)} del contrato</span></td>
                                    <td className={TD}>{pct(c.av7)}</td>
                                    <td className={TD}>
                                        <InputAvance id={`ep8-${i}`} valor={c.av8} minimo={c.av7} nombre={c.nombre}
                                            onCambio={v => setAv8(prev => prev.map((x, j) => (j === i ? v : x)))} />
                                    </td>
                                    <td className={TD}>{plata(c.venta * (c.av8 - c.av7) / 100)}</td>
                                </tr>
                            ))}
                            <tr className="bg-muted/60 font-bold text-brand-dark"><td className={TD}>Avance del mes</td><td className={TD}>{pct(av7Global, 1)}</td><td className={TD}>{pct(av8Global, 1)}</td><td className={TD}>{plata(ep8.bruto)}</td></tr>
                            <tr><td className={TD}>Devolución anticipo</td><td className={TD} /><td className={TD} /><td className={TD}>−{plata(ep8.anticipo)}</td></tr>
                            <tr><td className={TD}>Retención</td><td className={TD} /><td className={TD} /><td className={TD}>−{plata(ep8.retencion)}</td></tr>
                            <tr className="bg-muted/60 font-bold text-brand-dark"><td className={TD}>Líquido a pagar EP 8</td><td className={TD} /><td className={TD} /><td className={TD}>{plata(ep8.liquido)}</td></tr>
                        </Tabla>
                    </Tarjeta>
                </div>
            )}

            {/* 2 · Avance vs costo */}
            {tab === 'avance' && (
                <div className="flex flex-col gap-4">
                    <ParaQue
                        para="Saber si la obra va bien. «Se gastó el 60 %» no dice nada solo: importa compararlo con cuánto de la obra está hecho. Si la obra gruesa va en 80 % y ya se gastó el 84 % de su costo, se va a pasar."
                        necesita="Quién mide el avance de cada partida y cada cuánto. El mismo avance del estado de pago sirve." />
                    {peor ? (
                        <Aviso icon={AlertTriangle} tono="peligro">
                            <strong>{peor.c.nombre}:</strong> va en {pct(peor.c.av8)} de avance y ya se gastó el {pct((peor.c.gastado / peor.c.costo) * 100)} de su costo. Si sigue así termina en {plata(peor.proy)}, {plata(peor.dif)} más de lo presupuestado.
                        </Aviso>
                    ) : (
                        <Aviso icon={CheckCircle2} tono="neutro">Ningún capítulo con avance suficiente va camino a pasarse.</Aviso>
                    )}
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Kpi icon={Gauge} label="Avance físico de la obra" valor={pct(av8Global, 1)} nota="ponderado por el contrato" />
                        <Kpi icon={Receipt} label="Costo gastado" valor={pct((gastado / costo) * 100, 1)} nota={`${plata(gastado)} de ${plata(costo)}`} />
                        <Kpi icon={TrendingUp} label="Costo proyectado al término" valor={plata(proyTotal)} tono={proyTotal > costo ? 'peligro' : 'neutro'} notaPeligro={proyTotal > costo}
                            nota={`${proyTotal > costo ? '+' : '−'}${plata(Math.abs(proyTotal - costo))} vs presupuesto`} />
                        <Kpi icon={Percent} label="Margen proyectado" valor={pct(((contrato - proyTotal) / contrato) * 100, 1)} nota={`era ${pct(((contrato - costo) / contrato) * 100, 1)}`} />
                    </div>
                    <Tarjeta titulo="Por capítulo" detalle="Avance físico (gris) contra costo gastado (color)"
                        nota="Proyección al término = gastado ÷ avance. Con menos de 25 % de avance no es confiable (se compran materiales antes de usarlos): ahí se deja el costo presupuestado.">
                        <Tabla cabeza={['Capítulo', 'Avance y gastado', 'Gastado', 'Proyección al término', 'Cómo va']} izquierda={[1, 4]}>
                            {caps.map((c, i) => {
                                const p = proys[i];
                                const gp = c.costo ? (c.gastado / c.costo) * 100 : 0;
                                const color = gp > 100 ? 'bg-destructive' : gp > c.av8 + 2 ? 'bg-warning' : 'bg-brand-primary';
                                const estado: [ChipTone, string] = !c.gastado && !c.av8 ? ['neutral', 'Sin empezar']
                                    : !p.confiable ? ['neutral', 'Poco avance: no confiable']
                                        : p.dif > c.costo * 0.02 ? ['danger', `Se va a pasar ${plata(p.dif)}`]
                                            : p.dif < -c.costo * 0.02 ? ['success', 'Bajo lo presupuestado'] : ['success', 'En línea'];
                                return (
                                    <tr key={c.nombre}>
                                        <td className={cn(TD, 'whitespace-normal')}><span className="font-medium text-brand-dark">{c.nombre}</span><span className="block text-caption text-muted-foreground">Costo {plata(c.costo)}</span></td>
                                        <td className={cn(TD, 'text-left')}>
                                            <div className="flex min-w-[150px] flex-col gap-1">
                                                <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-muted-foreground/60" style={{ width: `${Math.min(100, c.av8)}%` }} /></div>
                                                <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', color)} style={{ width: `${Math.min(100, gp)}%` }} /></div>
                                                <span className="flex justify-between gap-3 text-caption text-muted-foreground"><span>avance {pct(c.av8)}</span><span>gastado {pct(gp)}</span></span>
                                            </div>
                                        </td>
                                        <td className={TD}>{plata(c.gastado)}</td>
                                        <td className={TD}>{p.confiable && c.av8 > 0 ? plata(p.proy) : <span className="text-muted-foreground">{plata(c.costo)}</span>}</td>
                                        <td className={cn(TD, 'text-left')}><Chip tone={estado[0]} label={estado[1]} /></td>
                                    </tr>
                                );
                            })}
                            <tr className="bg-muted/60 font-bold text-brand-dark">
                                <td className={TD}>Obra completa</td><td className={TD} /><td className={TD}>{plata(gastado)}</td><td className={TD}>{plata(proyTotal)}</td>
                                <td className={cn(TD, 'text-left')}>{proyTotal > costo ? '+' : '−'}{plata(Math.abs(proyTotal - costo))}</td>
                            </tr>
                        </Tabla>
                    </Tarjeta>
                </div>
            )}

            {/* 3 · Facturas del SII */}
            {tab === 'sii' && (() => {
                const n = { auto: 0, pendiente: 0, duplicada: 0 };
                FACTURAS_SII.forEach(f => { n[f.estado]++; });
                const neto = FACTURAS_SII.filter(f => f.estado !== 'duplicada').reduce((s, f) => s + f.neto, 0);
                return (
                    <div className="flex flex-col gap-4">
                        <ParaQue
                            para="Dejar de tipear facturas. Toda factura electrónica aparece en el Registro de Compras del SII: se baja el archivo del mes, se sube y Bóveda propone a qué obra y partida va cada una según el proveedor. La foto queda para boletas y vales."
                            necesita="Quién tiene acceso al SII de la empresa para bajar el archivo una vez al mes. Bóveda nunca guarda la clave del SII." />
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            <Kpi icon={Receipt} label="Facturas del mes" valor={String(FACTURAS_SII.length)} nota={`${plata(neto)} neto nuevo`} />
                            <Kpi icon={CheckCircle2} label="Asignadas solas" valor={String(n.auto)} nota="por el proveedor" />
                            <Kpi icon={AlertTriangle} label="Por asignar" valor={String(n.pendiente)} tono={n.pendiente ? 'aviso' : 'neutro'} nota="una persona elige obra y partida" />
                            <Kpi icon={ListChecks} label="Ya cargadas con foto" valor={String(n.duplicada)} nota="se reconocen y no se duplican" />
                        </div>
                        <Tarjeta titulo="Registro de Compras · octubre 2026" detalle="Archivo bajado del SII y subido a Bóveda">
                            <Tabla cabeza={['Fecha', 'Proveedor', 'Neto', 'IVA', 'Obra y partida propuesta', 'Estado']} izquierda={[1, 4, 5]}>
                                {FACTURAS_SII.map(f => (
                                    <tr key={f.folio}>
                                        <td className={TD}>{f.fecha}</td>
                                        <td className={cn(TD, 'whitespace-normal text-left')}><span className="font-medium text-brand-dark">{f.proveedor}</span><span className="block text-caption text-muted-foreground">Factura N° {f.folio}</span></td>
                                        <td className={TD}>{plata(f.neto)}</td>
                                        <td className={TD}>{plata(Math.round(f.neto * 0.19))}</td>
                                        <td className={cn(TD, 'min-w-[200px] whitespace-normal text-left')}>
                                            {f.estado === 'pendiente'
                                                ? <span className="text-xs text-muted-foreground">Compra mixta o proveedor nuevo: elegir obra y partida</span>
                                                : <><span className="text-brand-dark">{f.asignacion}</span><span className="block text-caption text-muted-foreground">{f.estado === 'duplicada' ? 'ya se había cargado con foto el 16-10' : 'por el proveedor, como las anteriores'}</span></>}
                                        </td>
                                        <td className={cn(TD, 'text-left')}>
                                            <Chip tone={f.estado === 'auto' ? 'success' : f.estado === 'duplicada' ? 'info' : 'warning'}
                                                label={f.estado === 'auto' ? 'Asignada sola' : f.estado === 'duplicada' ? 'Ya estaba' : 'Por asignar'} />
                                        </td>
                                    </tr>
                                ))}
                            </Tabla>
                        </Tarjeta>
                    </div>
                );
            })()}

            {/* 4 · Mano de obra desde Asistencia */}
            {tab === 'mano' && (() => {
                const filas = CARGOS_MO.map(c => ({ ...c, diario: costoDiario(c.sueldo), total: costoDiario(c.sueldo) * c.dias }));
                const total = filas.reduce((s, f) => s + f.total, 0);
                const dias = filas.reduce((s, f) => s + f.dias, 0);
                const personas = filas.reduce((s, f) => s + f.personas, 0);
                const bajo = total <= MO_PRESUPUESTO_MES;
                return (
                    <div className="flex flex-col gap-4">
                        <ParaQue
                            para="Bóveda ya sabe quién trabajó cada día en cada obra. Con el sueldo de cada cargo sale una estimación del costo de mano de obra, sin que nadie cargue nada."
                            necesita="Si la estimación les sirve así o prefieren el costo real de remuneraciones (hoy está en iContador), y qué porcentaje usar por leyes sociales." />
                        <Aviso icon={AlertTriangle}><strong>Es una estimación.</strong> Usa el sueldo base del cargo, no la liquidación real: no incluye horas extra, bonos ni descuentos. Sirve para ver la tendencia, no para pagar.</Aviso>
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            <Kpi icon={HardHat} label="Mano de obra estimada" valor={plata(total)} nota={`octubre · ${fmtNumber(dias)} días trabajados`} />
                            <Kpi icon={CalendarDays} label="Presupuestada para el mes" valor={plata(MO_PRESUPUESTO_MES)} nota="según el programa" />
                            <Kpi icon={TrendingUp} label="Diferencia" valor={`${bajo ? '−' : '+'}${plata(Math.abs(MO_PRESUPUESTO_MES - total))}`} nota={bajo ? 'bajo lo presupuestado' : 'sobre lo presupuestado'} tono={bajo ? 'neutro' : 'peligro'} />
                            <Kpi icon={Users} label="Faltas y licencias" valor="23 días" nota="del mes, desde Asistencia" />
                        </div>
                        <Tarjeta titulo="Octubre 2026 · desde Asistencia" detalle="Días trabajados × costo diario del cargo"
                            nota={`Costo diario de ejemplo = sueldo base del cargo ÷ 30, más ${pct(LEYES_SOCIALES * 100)} de leyes sociales.`}>
                            <Tabla cabeza={['Cargo', 'Personas', 'Días trabajados', 'Sueldo base', 'Costo diario', 'Costo estimado']}>
                                {filas.map(f => (
                                    <tr key={f.cargo}>
                                        <td className={cn(TD, 'font-medium text-brand-dark')}>{f.cargo}</td><td className={TD}>{f.personas}</td><td className={TD}>{f.dias}</td>
                                        <td className={TD}>{plata(f.sueldo)}</td><td className={TD}>{plata(f.diario)}</td><td className={cn(TD, 'font-semibold text-brand-dark')}>{plata(f.total)}</td>
                                    </tr>
                                ))}
                                <tr className="bg-muted/60 font-bold text-brand-dark">
                                    <td className={TD}>Total</td><td className={TD}>{personas}</td><td className={TD}>{fmtNumber(dias)}</td><td className={TD} /><td className={TD} /><td className={TD}>{plata(total)}</td>
                                </tr>
                            </Tabla>
                        </Tarjeta>
                    </div>
                );
            })()}

            {/* 5 · Curva de inversión */}
            {tab === 'curva' && <Curva costo={costo} contrato={contrato} gastado={gastado} eps={eps.map(e => e.av)} av8={av8Global} />}

            {/* Después */}
            {tab === 'despues' && (
                <div className="flex flex-col gap-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {[
                            [HardHat, 'Subcontratos', 'Si trabajan con subcontratistas', 'Contrato de cada subcontratista, su avance, sus propios estados de pago, retenciones y anticipos.'],
                            [ShoppingCart, 'Órdenes de compra', 'Antes de la factura', 'Ver lo comprometido además de lo gastado: lo pedido que todavía no llega facturado.'],
                            [ListChecks, 'Análisis de precio unitario', 'Para entender las alzas', 'Materiales, mano de obra y equipos de cada partida. Dice si una partida se pasó por precio (subió el cemento) o por cantidad.'],
                            [Stamp, 'Aprobación de pagos', 'Orden en los pagos', 'La secretaria carga la factura y Rodrigo la aprueba antes de pagar, con el respaldo adjunto.'],
                            [Wand2, 'Leer la foto con IA', 'Menos tipeo', 'Al subir la foto de una boleta se llenan solos el proveedor, el número y los montos; la persona solo revisa.'],
                            [FileDown, 'Exportar a PDF y Excel', 'Para el mandante', 'El presupuesto y cada estado de pago listos para enviar, con el formato de LOLS.'],
                        ].map(([Icono, titulo, eti, texto]) => {
                            const I = Icono as React.ElementType;
                            return (
                                <div key={titulo as string} className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card px-4 py-3.5">
                                    <span className="flex items-center gap-2"><I className="h-4 w-4 text-muted-foreground" /><span className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">{eti as string}</span></span>
                                    <h4 className="text-base font-bold text-brand-dark">{titulo as string}</h4>
                                    <p className="text-sm text-muted-foreground">{texto as string}</p>
                                </div>
                            );
                        })}
                    </div>
                    <Tarjeta titulo="Preguntas para la reunión">
                        <ol className="flex list-decimal flex-col gap-2 py-3 pl-9 pr-4 text-sm text-brand-dark marker:font-bold marker:text-brand-primary">
                            <li>¿Cómo arman hoy los estados de pago al mandante? ¿Nos pueden pasar uno?</li>
                            <li>¿Qué retención y qué anticipo tienen los contratos? ¿La retención tiene tope?</li>
                            <li>¿Quién mide el avance de las partidas y cada cuánto?</li>
                            <li>¿Alguien baja hoy el Registro de Compras del SII?</li>
                            <li>¿Trabajan mucho con subcontratistas?</li>
                            <li>¿Quién aprueba los pagos? ¿La secretaria también cargaría gastos?</li>
                            <li>Las facturas de materiales ya se ingresan en Inventario: ¿cuál queda como la fuente, para no cargarlas dos veces?</li>
                            <li>¿Algún presupuesto se trabaja en UF?</li>
                        </ol>
                    </Tarjeta>
                </div>
            )}
        </div>
    );
};

/** Curva de inversión: costo programado, costo real y cobrado, acumulados por mes (SVG a escala). */
const Curva: React.FC<{ costo: number; contrato: number; gastado: number; eps: number[]; av8: number }> = ({ costo, contrato, gastado, eps, av8 }) => {
    const W = 760, H = 340, L = 64, R = 20, T = 16, B = 40, MAX = 900e6;
    const x = (i: number) => L + (i * (W - L - R)) / (MESES.length - 1);
    const y = (v: number) => T + (H - T - B) * (1 - v / MAX);
    const real = [...REAL_HASTA_SEP, gastado];
    const cobrado = [...eps.map(a => (contrato * a) / 100), (contrato * av8) / 100];
    const plan = PLAN_PCT.map(p => (costo * p) / 100);
    const linea = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const u = real.length - 1;
    const ticks = Array.from({ length: 7 }, (_, i) => i * 150e6);
    return (
        <div className="flex flex-col gap-4">
            <ParaQue
                para="Ver mes a mes, en un solo gráfico, lo que se programó gastar, lo que de verdad se gastó y lo que se ha cobrado. Si lo gastado pasa por encima de lo cobrado, la obra se está financiando con plata de la empresa."
                necesita="Las fechas de inicio y término de cada capítulo (o la carta Gantt que usen)." />
            <Tarjeta titulo="Acumulado por mes · 2026" detalle="Netos"
                nota={`A octubre se programó gastar ${fmtMoney(plan[7])} y se gastó ${fmtMoney(gastado)}, con ${pct(av8, 1)} de avance. Lo cobrado con el EP 8 (${fmtMoney(cobrado[u])}) ${cobrado[u] >= gastado
                    ? 'va sobre lo gastado: la obra no se está financiando con plata de la empresa.'
                    : 'va bajo lo gastado: la diferencia la está poniendo la empresa.'}`}>
                <div className="flex flex-wrap gap-4 px-4 pt-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-5 rounded bg-muted-foreground" />Costo programado</span>
                    <span className="inline-flex items-center gap-1.5"><i className="inline-block h-1 w-5 rounded bg-brand-primary" />Costo real</span>
                    <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-5 rounded bg-brand-dark" />Cobrado (estados de pago)</span>
                </div>
                <div className="px-2 pb-1 pt-2">
                    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Curva de inversión de la obra de ejemplo">
                        {ticks.map(v => (
                            <g key={v}>
                                <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
                                <text x={L - 10} y={y(v) + 4} textAnchor="end" fontSize={12} className="fill-muted-foreground">{fmtMoneyCompacto(v)}</text>
                            </g>
                        ))}
                        {MESES.map((m, i) => <text key={m} x={x(i)} y={H - 14} textAnchor="middle" fontSize={12} className="fill-muted-foreground">{m}</text>)}
                        <line x1={x(7)} x2={x(7)} y1={T} y2={H - B} className="stroke-muted-foreground" strokeDasharray="3 4" strokeWidth={1} />
                        <text x={x(7) + 6} y={T + 12} fontSize={12} className="fill-muted-foreground">hoy</text>
                        <path d={`${linea(real)} L${x(u)} ${y(0)} L${x(0)} ${y(0)} Z`} className="fill-brand-primary" opacity={0.1} />
                        <path d={linea(plan)} fill="none" className="stroke-muted-foreground" strokeWidth={2} strokeDasharray="6 5" />
                        <path d={linea(cobrado)} fill="none" className="stroke-brand-dark" strokeWidth={2.25} />
                        <path d={linea(real)} fill="none" className="stroke-brand-primary" strokeWidth={3} />
                        <circle cx={x(u)} cy={y(real[u])} r={4.5} className="fill-brand-primary" />
                        <circle cx={x(u)} cy={y(cobrado[u])} r={4} className="fill-brand-dark" />
                    </svg>
                </div>
            </Tarjeta>
        </div>
    );
};

export default PropuestaCostos;
