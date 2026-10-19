import React, { useState } from 'react';
import { toast } from 'sonner';
import { HandCoins, Trash2, Loader2 } from 'lucide-react';
import api from '../../services/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { CurrencyInput } from '../ui/CurrencyInput';
import { FormError } from '../ui/FormError';
import { fmtMoney } from '../../utils/format';
import { CAMPO, ETIQUETA, hoyISO, mensajeError } from './costosConfig';
import { Opciones } from './piezas';
import type { CostoCobro } from '../../types/entities';

const ESTADOS = { por_cobrar: 'Por cobrar', cobrado: 'Cobrado' } as const;
const SUGERENCIAS = ['Anticipo', 'EP 1', 'Factura de venta', 'Devolución de retenciones'];

const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);

/**
 * Un cobro al mandante: lo que se espera que entre a la caja (estado de pago, factura, anticipo o
 * devolución de retenciones). Lo que entra = neto + IVA − retención; es lo que usa el flujo de caja.
 */
export const CobroModal: React.FC<{
    obraId: number;
    cobro: CostoCobro | null;
    /** Glosas de los cobros que ya tiene la obra, para sugerir el número del siguiente EP. */
    glosas: string[];
    onClose: () => void;
    onGuardado: () => void;
}> = ({ obraId, cobro, glosas, onClose, onGuardado }) => {
    const editando = !!cobro;
    // «EP 3» → sugiere «EP 4»; sin estados de pago todavía, «EP 1».
    const ultimoEP = Math.max(0, ...glosas.map(g => Number(/^EP\s*(\d+)/i.exec(g.trim())?.[1] || 0)));
    const [glosa, setGlosa] = useState(cobro?.glosa || `EP ${ultimoEP + 1}`);
    const [fecha, setFecha] = useState(cobro?.fecha?.slice(0, 10) || hoyISO());
    const [neto, setNeto] = useState(num(cobro?.monto_neto));
    const [llevaIva, setLlevaIva] = useState(cobro ? num(cobro.iva) > 0 : true);
    const [retPct, setRetPct] = useState(cobro && num(cobro.monto_neto) > 0 ? String(Math.round((num(cobro.retencion) / num(cobro.monto_neto)) * 1000) / 10).replace('.', ',') : '5');
    const [estado, setEstado] = useState<'por_cobrar' | 'cobrado'>(cobro?.estado || 'por_cobrar');
    const [fechaCobro, setFechaCobro] = useState(cobro?.fecha_cobro?.slice(0, 10) || '');
    const [observacion, setObservacion] = useState(cobro?.observacion || '');
    const [guardando, setGuardando] = useState(false);
    const [borrando, setBorrando] = useState(false);
    const [confirmarBorrar, setConfirmarBorrar] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const pctNum = Number(String(retPct).replace(',', '.'));
    const iva = llevaIva ? Math.round(neto * 0.19) : 0;
    const retencion = Number.isFinite(pctNum) && pctNum > 0 ? Math.round((neto * pctNum) / 100) : 0;
    const entra = neto + iva - retencion;

    const guardar = async () => {
        if (!glosa.trim()) { setError('Falta qué se cobra (ej.: «EP 8» o «Anticipo»).'); return; }
        if (!(neto > 0)) { setError('Falta el monto neto.'); return; }
        if (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100) { setError('La retención va de 0 a 100 %.'); return; }
        setError(null);
        setGuardando(true);
        const datos = { glosa, fecha, monto_neto: neto, iva, retencion, estado, fecha_cobro: estado === 'cobrado' ? fechaCobro : '', observacion };
        try {
            if (editando && cobro) await api.put(`/costos/cobros/${cobro.id}`, datos);
            else await api.post(`/costos/obras/${obraId}/cobros`, datos);
            toast.success(editando ? 'Cobro actualizado' : 'Cobro agregado');
            onGuardado();
        } catch (e) {
            setError(mensajeError(e, 'No se pudo guardar el cobro.'));
        } finally {
            setGuardando(false);
        }
    };

    const borrar = async () => {
        if (!cobro) return;
        setBorrando(true);
        try {
            await api.delete(`/costos/cobros/${cobro.id}`);
            toast.success('Cobro borrado');
            onGuardado();
        } catch (e) {
            setError(mensajeError(e, 'No se pudo borrar el cobro.'));
            setBorrando(false);
            setConfirmarBorrar(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            size="md"
            icon={HandCoins}
            title={editando ? 'Cobro' : 'Agregar cobro'}
            description="Lo que se espera cobrar al mandante. Es lo que entra en el flujo de caja."
            footer={
                <div className="flex w-full flex-wrap items-center justify-between gap-3">
                    {editando ? (
                        confirmarBorrar ? (
                            <span className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">¿Borrar este cobro?</span>
                                <Button variant="destructive" size="sm" onClick={borrar} disabled={borrando}
                                    leftIcon={borrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}>Sí, borrar</Button>
                                <Button variant="ghost" size="sm" onClick={() => setConfirmarBorrar(false)}>No</Button>
                            </span>
                        ) : (
                            <Button variant="destructive" size="sm" onClick={() => setConfirmarBorrar(true)} leftIcon={<Trash2 className="h-4 w-4" />}>Borrar</Button>
                        )
                    ) : <span />}
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                        <Button onClick={guardar} isLoading={guardando} disabled={borrando}>{editando ? 'Guardar cambios' : 'Agregar'}</Button>
                    </div>
                </div>
            }
        >
            <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                    <div className="col-span-2 sm:col-span-1">
                        <label htmlFor="cobro-glosa" className={ETIQUETA}>Qué se cobra *</label>
                        <input id="cobro-glosa" list="cobro-sugerencias" value={glosa} onChange={e => setGlosa(e.target.value)} maxLength={200}
                            placeholder="EP 8, Anticipo…" className={CAMPO} autoFocus={!editando} />
                        <datalist id="cobro-sugerencias">{SUGERENCIAS.map(s => <option key={s} value={s} />)}</datalist>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label htmlFor="cobro-fecha" className={ETIQUETA}>Se espera el</label>
                        <input id="cobro-fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={CAMPO} />
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <CurrencyInput label="Monto neto *" value={neto} onChange={setNeto} placeholder="$0" />
                    <div>
                        <label htmlFor="cobro-ret" className="ml-0.5 text-sm font-medium text-muted-foreground">Retención</label>
                        <div className="relative mt-1.5">
                            <input id="cobro-ret" value={retPct} onChange={e => setRetPct(e.target.value)} inputMode="decimal" className={CAMPO + ' pr-8 tabular-nums'} />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                        </div>
                        <p className="mt-1 ml-0.5 text-caption text-muted-foreground">Lo que el mandante guarda hasta recibir la obra{retencion ? `: ${fmtMoney(retencion)}` : ''}.</p>
                    </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-dark">
                    <input id="cobro-iva" type="checkbox" checked={llevaIva} onChange={e => setLlevaIva(e.target.checked)} className="h-4 w-4 accent-brand-primary" />
                    Lleva IVA (19 %){llevaIva && neto > 0 ? `: ${fmtMoney(iva)}` : ''}
                    <span className="text-caption text-muted-foreground">· la devolución de retenciones no lleva</span>
                </label>

                <div className="flex items-baseline justify-between rounded-xl bg-muted/50 px-3 py-2.5">
                    <span className="text-xs font-semibold text-muted-foreground">Entra a la caja</span>
                    <span className="text-base font-bold text-brand-dark tabular-nums">{fmtMoney(entra) || '$0'}</span>
                </div>

                <div>
                    <span className={ETIQUETA}>Estado</span>
                    <Opciones etiqueta="Estado del cobro" valor={estado} opciones={ESTADOS} onChange={setEstado} />
                    {estado === 'cobrado' && (
                        <div className="mt-3 max-w-[12rem]">
                            <label htmlFor="cobro-fecha-cobro" className="ml-0.5 text-sm font-medium text-muted-foreground">Cobrado el</label>
                            <input id="cobro-fecha-cobro" type="date" value={fechaCobro} onChange={e => setFechaCobro(e.target.value)} className={CAMPO + ' mt-1.5'} />
                            {!fechaCobro && <p className="mt-1 ml-0.5 text-caption text-muted-foreground">Si la dejas vacía, queda la de hoy.</p>}
                        </div>
                    )}
                </div>

                <div>
                    <label htmlFor="cobro-obs" className={ETIQUETA}>Observación</label>
                    <textarea id="cobro-obs" value={observacion} onChange={e => setObservacion(e.target.value)} maxLength={500} rows={2}
                        placeholder="Ej.: el mandante paga a 30 días de aprobado" className={CAMPO} />
                </div>

                <FormError message={error} />
            </div>
        </Modal>
    );
};

export default CobroModal;
