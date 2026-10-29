import React, { useState } from 'react';
import { toast } from 'sonner';
import { Lock, LockOpen, AlertTriangle, CheckCircle2, Wallet, Receipt, Percent, Ruler, TrendingUp, Lightbulb } from 'lucide-react';
import api from '../../services/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Section } from '../ui/Section';
import { FormError } from '../ui/FormError';
import { Cargando, Skeleton } from '../ui/Skeleton';
import { fmtMoney, fmtNumber, fmtFechaCorta } from '../../utils/format';
import { cn } from '../../utils/cn';
import { nombreCategoria, CAMPO, ETIQUETA, mensajeError } from './costosConfig';
import { Kpi, Aviso, BarraAvance, PctGastado } from './piezas';
import { aNumero } from './excelPresupuesto';
import type { CostoDetalleObra, CostoCierreResumen } from '../../types/entities';

const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${fmtNumber(n, { decimals: 1 })} %`);
const conSigno = (n: number) => (n < 0 ? `−${fmtMoney(Math.abs(n))}` : `+${fmtMoney(n) || '$0'}`);

/** Lo que conviene revisar antes de cerrar (avisos, no bloquean). */
function pendientesDe(d: CostoDetalleObra) {
    const r = d.resumen;
    const lista: string[] = [];
    if (!d.obra.finalizada) lista.push('La obra todavía no está marcada como finalizada en Bóveda.');
    if (r.por_completar) lista.push(`${r.por_completar} gasto${r.por_completar === 1 ? '' : 's'} por completar (falta proveedor o a qué corresponde).`);
    if (r.por_pagar.n) lista.push(`${r.por_pagar.n} factura${r.por_pagar.n === 1 ? '' : 's'} por pagar: ${fmtMoney(r.por_pagar.monto)}.`);
    if (r.cobros.por_cobrar.n) lista.push(`${r.cobros.por_cobrar.n} cobro${r.cobros.por_cobrar.n === 1 ? '' : 's'} por cobrar: ${fmtMoney(r.cobros.por_cobrar.total)}.`);
    if (!d.cobros.length) lista.push('No hay cobros cargados: la venta se tomará del presupuesto, no de lo que se cobró de verdad.');
    if (r.gastado_estimado) lista.push('Hay facturas con el neto estimado (total ÷ 1,19).');
    return lista;
}

/**
 * La pestaña «Cierre» mientras llega la obra (diseno.md §9.17). Hasta tener los datos no se sabe si la obra está
 * cerrada, y eso cambia todo lo que se ve: va la forma del informe (tarjeta de estado y cifras) con los rótulos en
 * gris, para no anunciar «Venta», «Margen»… en una obra que resulta estar abierta.
 */
export const CierreSilueta: React.FC = () => (
    <Cargando que="el cierre" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 md:flex-row md:items-center md:justify-between" aria-hidden="true">
            <div className="flex min-w-0 items-start gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                    <Skeleton className="h-3.5 w-56 max-w-full" />
                    <Skeleton className="h-3 w-72 max-w-full" />
                </div>
            </div>
            <Skeleton className="h-9 w-28 shrink-0 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
            {[0, 1, 2, 3].map(i => (
                <div key={i} className="flex min-w-0 flex-col gap-1 rounded-card border border-border bg-card p-4">
                    <Skeleton className="h-3 w-24 max-w-full" />
                    <Skeleton className="my-0.5 h-6 w-28 max-w-full md:h-7" />
                    <Skeleton className="mt-0.5 h-3 w-3/4" />
                </div>
            ))}
        </div>
    </Cargando>
);

/**
 * Pestaña «Cierre». Abierta: explica qué hace cerrar y lo que conviene revisar antes. Cerrada: el
 * informe final (venta, costo real, margen, costo por m², capítulos, categorías y lo aprendido) y la
 * opción de reabrir con un motivo.
 */
export const CierreObra: React.FC<{ detalle: CostoDetalleObra; onCambio: () => void }> = ({ detalle, onCambio }) => {
    const [cerrando, setCerrando] = useState(false);
    const [reabriendo, setReabriendo] = useState(false);

    if (!detalle.cierre) {
        const pendientes = pendientesDe(detalle);
        const sinPresupuesto = !detalle.partidas.length;
        return (
            <div className="flex flex-col gap-4">
                <Section title="Cerrar la obra">
                    <div className="flex flex-col gap-3 text-sm text-brand-dark">
                        <p>Al cerrar se guardan los números finales de la obra (lo presupuestado, lo gastado, lo cobrado y el margen real) y los montos quedan <strong>congelados</strong>: no se pueden agregar ni cambiar partidas, gastos ni cobros. Si después aparece algo, se reabre con un motivo.</p>
                        <p className="text-muted-foreground">Con la superficie construida, la obra entra a «Comparar obras» con su costo por m², que sirve de base para cotizar las próximas.</p>
                    </div>
                </Section>
                {pendientes.length > 0 ? (
                    <Aviso icon={AlertTriangle}>
                        <strong>Antes de cerrar, revisa:</strong>
                        <ul className="mt-1 list-disc pl-4">{pendientes.map(p => <li key={p}>{p}</li>)}</ul>
                        <span className="mt-1 block text-muted-foreground">No impide cerrar, pero los números finales quedarían con eso.</span>
                    </Aviso>
                ) : (
                    <Aviso icon={CheckCircle2} tono="neutro">Todo al día: no hay gastos por completar, facturas por pagar ni cobros pendientes.</Aviso>
                )}
                <div>
                    <Button onClick={() => setCerrando(true)} disabled={sinPresupuesto} leftIcon={<Lock className="h-4 w-4" />}>Cerrar obra…</Button>
                    {sinPresupuesto && <p className="mt-1.5 text-caption text-muted-foreground">Primero carga el presupuesto: sin partidas no hay contra qué comparar.</p>}
                </div>
                {cerrando && <CierreModal detalle={detalle} pendientes={pendientes} onClose={() => setCerrando(false)} onListo={() => { setCerrando(false); onCambio(); }} />}
            </div>
        );
    }

    const c = detalle.cierre;
    const r = c.resumen;
    const m2 = detalle.presupuesto?.superficie_m2 ? Number(detalle.presupuesto.superficie_m2) : (r?.superficie_m2 ?? null);
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted"><Lock className="h-4 w-4 text-muted-foreground" /></span>
                    <div>
                        <p className="text-sm font-semibold text-brand-dark">Obra cerrada el {fmtFechaCorta(c.cerrado_at)}{c.cerrado_por_nombre ? ` por ${c.cerrado_por_nombre}` : ''}</p>
                        <p className="text-caption text-muted-foreground">Estos son los números finales. Los montos quedaron congelados.</p>
                    </div>
                </div>
                <Button variant="glass" size="sm" onClick={() => setReabriendo(true)} leftIcon={<LockOpen className="h-4 w-4" />}>Reabrir</Button>
            </div>
            {r ? <InformeCierre r={r} m2={m2} lecciones={c.lecciones} /> : <Aviso icon={AlertTriangle}>No se encontraron los números del cierre. Reabre y vuelve a cerrar la obra.</Aviso>}
            {reabriendo && <ReabrirModal obraId={detalle.obra.id} onClose={() => setReabriendo(false)} onListo={() => { setReabriendo(false); onCambio(); }} />}
        </div>
    );
};

const InformeCierre: React.FC<{ r: CostoCierreResumen; m2: number | null; lecciones: string | null }> = ({ r, m2, lecciones }) => {
    const totalGastado = r.real.gastado_neto || 0;
    const categorias = Object.entries(r.real.por_categoria).sort((a, b) => b[1] - a[1]);
    const margenBajo = (r.margen.pct_real ?? 0) < (r.margen.pct_presupuestado ?? 0);
    return (
        <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi icon={Wallet} label="Venta (neta)" valor={fmtMoney(r.venta.neto) || '$0'}
                    tono={r.venta.fuente === 'presupuesto' ? 'aviso' : 'neutro'}
                    nota={r.venta.fuente === 'cobros' ? `según los cobros${r.venta.por_cobrar_neto ? ` · ${fmtMoney(r.venta.por_cobrar_neto)} sin cobrar` : ''}` : 'según el presupuesto: no había cobros cargados'} />
                <Kpi icon={Receipt} label="Costo real" valor={fmtMoney(r.real.gastado_neto) || '$0'} tono={r.desviacion_costo > 0 ? 'peligro' : 'neutro'} notaPeligro={r.desviacion_costo > 0}
                    nota={`${conSigno(r.desviacion_costo)} (${pct(r.desviacion_pct)}) vs ${fmtMoney(r.presupuesto.costo_presupuestado)}`} />
                <Kpi icon={Percent} label="Margen real" valor={pct(r.margen.pct_real)} tono={margenBajo ? 'peligro' : 'neutro'} notaPeligro={margenBajo}
                    nota={`${fmtMoney(r.margen.real) || '$0'} · presupuestado ${pct(r.margen.pct_presupuestado)}`} />
                <Kpi icon={Ruler} label="Costo real por m²" valor={m2 ? fmtMoney(r.real.gastado_neto / m2) || '$0' : '—'}
                    tono={m2 ? 'neutro' : 'aviso'} nota={m2 ? `${fmtNumber(m2)} m² · presupuestado ${fmtMoney(r.presupuesto.costo_presupuestado / m2)}` : 'falta la superficie (Presupuesto › Datos)'} />
            </div>

            {r.real.gastado_estimado && <Aviso icon={AlertTriangle}>El costo real incluye facturas con el neto estimado (total ÷ 1,19): puede diferir un poco del real.</Aviso>}
            {(r.pendientes.por_pagar.n > 0 || r.pendientes.por_cobrar.n > 0 || r.pendientes.por_completar > 0) && (
                <Aviso icon={AlertTriangle}>
                    Al cerrar quedaban pendientes:{' '}
                    {[r.pendientes.por_completar ? `${r.pendientes.por_completar} gastos por completar` : '',
                        r.pendientes.por_pagar.n ? `${r.pendientes.por_pagar.n} facturas por pagar (${fmtMoney(r.pendientes.por_pagar.monto)})` : '',
                        r.pendientes.por_cobrar.n ? `${r.pendientes.por_cobrar.n} cobros por cobrar (${fmtMoney(r.pendientes.por_cobrar.total)})` : ''].filter(Boolean).join(' · ')}.
                </Aviso>
            )}

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <Section title="Por capítulo · presupuestado vs real">
                    <ul className="flex flex-col gap-3.5">
                        {r.capitulos.map(c => (
                            <li key={c.capitulo}>
                                <div className="mb-1 flex items-baseline justify-between gap-3">
                                    <span className="min-w-0 truncate text-sm font-semibold text-brand-dark">{c.capitulo}</span>
                                    <PctGastado presupuestado={c.presupuestado} gastado={c.gastado} />
                                </div>
                                <BarraAvance presupuestado={c.presupuestado} gastado={c.gastado} />
                                <div className="mt-1 flex justify-between gap-3 text-caption text-muted-foreground tabular-nums">
                                    <span>{fmtMoney(c.gastado) || '$0'} real</span>
                                    <span className={cn(c.gastado > c.presupuestado && 'font-semibold text-destructive')}>{conSigno(c.gastado - c.presupuestado)} de {fmtMoney(c.presupuestado) || '$0'}</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </Section>
                <div className="flex flex-col gap-4">
                    <Section title="En qué se fue la plata">
                        <ul className="flex flex-col gap-2 text-xs">
                            {categorias.map(([k, v]) => (
                                <li key={k} className="flex items-baseline justify-between gap-3">
                                    <span className="text-brand-dark">{nombreCategoria(k)}</span>
                                    <span className="tabular-nums text-muted-foreground">{fmtMoney(v)} · {totalGastado ? `${fmtNumber((v / totalGastado) * 100, { decimals: 0 })} %` : '—'}</span>
                                </li>
                            ))}
                        </ul>
                    </Section>
                    {r.excedidas.length > 0 && (
                        <Section title={<span className="inline-flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-destructive" /> Partidas que se pasaron</span>}>
                            <ul className="flex flex-col divide-y divide-border">
                                {r.excedidas.map(p => (
                                    <li key={p.id} className="flex items-start justify-between gap-3 py-2">
                                        <span className="min-w-0"><span className="block truncate text-xs font-semibold text-brand-dark">{p.descripcion}</span><span className="block truncate text-caption text-muted-foreground">{p.capitulo}</span></span>
                                        <span className="shrink-0 text-xs font-semibold text-destructive tabular-nums">+{fmtMoney(p.gastado - p.presupuestado)}</span>
                                    </li>
                                ))}
                            </ul>
                        </Section>
                    )}
                </div>
            </div>

            <Section title={<span className="inline-flex items-center gap-1.5"><Lightbulb className="h-4 w-4 text-muted-foreground" /> Qué aprendimos</span>}>
                {lecciones ? <p className="whitespace-pre-line text-sm text-brand-dark">{lecciones}</p> : <p className="text-sm text-muted-foreground">No se anotó nada al cerrar.</p>}
            </Section>
        </>
    );
};

const CierreModal: React.FC<{ detalle: CostoDetalleObra; pendientes: string[]; onClose: () => void; onListo: () => void }> = ({ detalle, pendientes, onClose, onListo }) => {
    const actual = detalle.presupuesto?.superficie_m2;
    const [m2, setM2] = useState(actual ? String(Number(actual)).replace('.', ',') : '');
    const [lecciones, setLecciones] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cerrar = async () => {
        const valor = m2.trim() ? aNumero(m2) : null;
        if (m2.trim() && (valor === null || valor <= 0)) { setError('La superficie tiene que ser un número mayor que cero.'); return; }
        setGuardando(true);
        setError(null);
        try {
            await api.post(`/costos/obras/${detalle.obra.id}/cerrar`, { superficie_m2: valor ?? '', lecciones });
            toast.success('Obra cerrada');
            onListo();
        } catch (e) {
            setError(mensajeError(e, 'No se pudo cerrar la obra.'));
            setGuardando(false);
        }
    };

    return (
        <Modal isOpen onClose={onClose} size="md" icon={Lock} title={`Cerrar ${detalle.obra.nombre}`}
            description="Se guardan los números finales y los montos quedan congelados."
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button onClick={cerrar} isLoading={guardando} leftIcon={!guardando ? <Lock className="h-4 w-4" /> : undefined}>Cerrar obra</Button>
                </div>
            }>
            <div className="flex flex-col gap-4">
                {pendientes.length > 0 && (
                    <Aviso icon={AlertTriangle}>
                        <ul className="list-disc pl-4">{pendientes.map(p => <li key={p}>{p}</li>)}</ul>
                    </Aviso>
                )}
                <div className="max-w-[14rem]">
                    <label htmlFor="cierre-m2" className={ETIQUETA}>Superficie construida</label>
                    <div className="relative">
                        <input id="cierre-m2" value={m2} onChange={e => setM2(e.target.value)} inputMode="decimal" placeholder="Ej.: 1.250" className={CAMPO + ' pr-10 tabular-nums'} />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">m²</span>
                    </div>
                    <p className="mt-1 text-caption text-muted-foreground">Para el costo por m². Se puede corregir después.</p>
                </div>
                <div>
                    <label htmlFor="cierre-lecciones" className={ETIQUETA}>Qué aprendimos de esta obra</label>
                    <textarea id="cierre-lecciones" value={lecciones} onChange={e => setLecciones(e.target.value)} maxLength={3000} rows={4}
                        placeholder="Ej.: el fierro subió 18 % a mitad de obra: comprarlo al inicio. La excavación salió más cara por napa de agua." className={CAMPO} />
                </div>
                <FormError message={error} />
            </div>
        </Modal>
    );
};

const ReabrirModal: React.FC<{ obraId: number; onClose: () => void; onListo: () => void }> = ({ obraId, onClose, onListo }) => {
    const [motivo, setMotivo] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const reabrir = async () => {
        if (!motivo.trim()) { setError('Escribe por qué se reabre (queda en el historial).'); return; }
        setGuardando(true);
        setError(null);
        try {
            await api.post(`/costos/obras/${obraId}/reabrir`, { motivo });
            toast.success('Obra reabierta');
            onListo();
        } catch (e) {
            setError(mensajeError(e, 'No se pudo reabrir la obra.'));
            setGuardando(false);
        }
    };
    return (
        <Modal isOpen onClose={onClose} size="sm" icon={LockOpen} title="Reabrir la obra"
            description="Los montos se pueden volver a cambiar. Para dejar los números finales, ciérrala de nuevo."
            footer={<div className="flex w-full justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={reabrir} isLoading={guardando}>Reabrir</Button></div>}>
            <div className="flex flex-col gap-3">
                <label htmlFor="reabrir-motivo" className={ETIQUETA}>Por qué se reabre *</label>
                <input id="reabrir-motivo" value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={300} autoFocus
                    placeholder="Ej.: llegó una factura atrasada del subcontratista" className={CAMPO} />
                <FormError message={error} />
            </div>
        </Modal>
    );
};

export default CierreObra;
