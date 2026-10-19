import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ListPlus, Trash2, Loader2 } from 'lucide-react';
import api from '../../services/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { CurrencyInput } from '../ui/CurrencyInput';
import { FormError } from '../ui/FormError';
import { fmtMoney } from '../../utils/format';
import { CAMPO, ETIQUETA, mensajeError } from './costosConfig';
import { Opciones, Aviso } from './piezas';
import { aNumero } from './excelPresupuesto';
import type { CostoPartida } from '../../types/entities';

interface Props {
    obraId: number;
    /** null = partida nueva. */
    partida: CostoPartida | null;
    capitulos: string[];
    /** Partida nueva desde el detalle de un capítulo: llega con ese capítulo. */
    capituloInicial?: string;
    /** Si ya hay presupuesto, una partida nueva parte como modificación. */
    hayPartidas: boolean;
    /** Gastos asignados a esta partida (para avisar antes de borrarla). */
    gastosAsignados: number;
    onClose: () => void;
    onGuardado: () => void;
}

const ORIGENES = { original: 'Del presupuesto original', modificacion: 'Modificación (obra extra o cambio)' } as const;

/**
 * Alta o edición de una partida. Una vez cargado el presupuesto, lo que se agrega
 * entra como MODIFICACIÓN con su motivo: así el original queda visible y se ve
 * cuánto creció la obra y por qué.
 */
export const PartidaModal: React.FC<Props> = ({ obraId, partida, capitulos, capituloInicial, hayPartidas, gastosAsignados, onClose, onGuardado }) => {
    const editando = !!partida;
    const [capitulo, setCapitulo] = useState(partida?.capitulo || capituloInicial || capitulos[0] || '');
    const [codigo, setCodigo] = useState(partida?.codigo || '');
    const [descripcion, setDescripcion] = useState(partida?.descripcion || '');
    const [unidad, setUnidad] = useState(partida?.unidad || '');
    const [cantidadTxt, setCantidadTxt] = useState(partida ? String(Number(partida.cantidad)).replace('.', ',') : '');
    const [pu, setPu] = useState(partida ? Math.round(Number(partida.precio_unitario)) : 0);
    const [origen, setOrigen] = useState<'original' | 'modificacion'>(partida?.origen || (hayPartidas ? 'modificacion' : 'original'));
    const [motivo, setMotivo] = useState(partida?.motivo || '');
    const [guardando, setGuardando] = useState(false);
    const [borrando, setBorrando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cantidad = aNumero(cantidadTxt);
    const total = useMemo(() => Math.round((cantidad ?? 0) * pu), [cantidad, pu]);

    const guardar = async () => {
        if (!descripcion.trim()) { setError('Falta la descripción de la partida.'); return; }
        if (cantidadTxt.trim() && cantidad === null) { setError('La cantidad tiene que ser un número (ej.: 12,5).'); return; }
        setError(null);
        setGuardando(true);
        const datos = {
            capitulo: capitulo.trim() || 'General', codigo, descripcion, unidad,
            cantidad: cantidad ?? 0, precio_unitario: pu, origen, motivo: origen === 'modificacion' ? motivo : '',
        };
        try {
            if (editando && partida) await api.put(`/costos/partidas/${partida.id}`, datos);
            else await api.post(`/costos/obras/${obraId}/partidas`, datos);
            toast.success(editando ? 'Partida actualizada' : origen === 'modificacion' ? 'Modificación agregada' : 'Partida agregada');
            onGuardado();
        } catch (e) {
            setError(mensajeError(e, 'No se pudo guardar la partida.'));
        } finally {
            setGuardando(false);
        }
    };

    const borrar = async () => {
        if (!partida) return;
        const aviso = gastosAsignados
            ? `\n\n${gastosAsignados} gasto${gastosAsignados === 1 ? '' : 's'} asignado${gastosAsignados === 1 ? '' : 's'} a esta partida quedará${gastosAsignados === 1 ? '' : 'n'} sin partida (no se borra${gastosAsignados === 1 ? '' : 'n'}).`
            : '';
        if (!window.confirm(`¿Borrar la partida "${partida.descripcion}"?${aviso}\n\nQueda anotado en el historial.`)) return;
        setBorrando(true);
        try {
            await api.delete(`/costos/partidas/${partida.id}`);
            toast.success('Partida borrada');
            onGuardado();
        } catch (e) {
            setError(mensajeError(e, 'No se pudo borrar la partida.'));
            setBorrando(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            size="md"
            icon={ListPlus}
            title={editando ? 'Partida' : 'Agregar partida'}
            footer={
                <div className="flex w-full items-center justify-between gap-3">
                    {editando ? (
                        <Button variant="destructive" size="sm" onClick={borrar} disabled={borrando || guardando}
                            leftIcon={borrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}>
                            Borrar
                        </Button>
                    ) : <span />}
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                        <Button onClick={guardar} isLoading={guardando} disabled={borrando}>{editando ? 'Guardar cambios' : 'Agregar'}</Button>
                    </div>
                </div>
            }
        >
            <div className="flex flex-col gap-4">
                <div>
                    <span className={ETIQUETA}>Origen</span>
                    <Opciones etiqueta="Origen de la partida" valor={origen} opciones={ORIGENES} onChange={setOrigen} />
                    {origen === 'modificacion' && (
                        <input aria-label="Motivo de la modificación" value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={300}
                            placeholder="Motivo: obra extra pedida por el mandante, cambio de especificación…" className={CAMPO + ' mt-2'} />
                    )}
                </div>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
                    <div>
                        <label htmlFor="partida-capitulo" className={ETIQUETA}>Capítulo</label>
                        <input id="partida-capitulo" list="partida-capitulos" value={capitulo} onChange={e => setCapitulo(e.target.value)} maxLength={150}
                            placeholder="Obra gruesa, Terminaciones…" className={CAMPO} />
                        <datalist id="partida-capitulos">{capitulos.map(c => <option key={c} value={c} />)}</datalist>
                    </div>
                    <div>
                        <label htmlFor="partida-codigo" className={ETIQUETA}>Ítem</label>
                        <input id="partida-codigo" value={codigo} onChange={e => setCodigo(e.target.value)} maxLength={30} placeholder="2.3" className={CAMPO} />
                    </div>
                </div>

                <div>
                    <label htmlFor="partida-desc" className={ETIQUETA}>Descripción *</label>
                    <input id="partida-desc" value={descripcion} onChange={e => setDescripcion(e.target.value)} maxLength={300} autoFocus={!editando}
                        placeholder="Hormigón H-25 fundaciones" className={CAMPO} />
                </div>

                <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 sm:grid-cols-[6rem_8rem_minmax(0,1fr)]">
                    <div>
                        <label htmlFor="partida-unidad" className={ETIQUETA}>Unidad</label>
                        <input id="partida-unidad" value={unidad} onChange={e => setUnidad(e.target.value)} maxLength={20} placeholder="m3" className={CAMPO} />
                    </div>
                    <div>
                        <label htmlFor="partida-cant" className={ETIQUETA}>Cantidad</label>
                        <input id="partida-cant" value={cantidadTxt} onChange={e => setCantidadTxt(e.target.value)} inputMode="decimal" placeholder="42" className={CAMPO + ' tabular-nums'} />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <CurrencyInput label="Precio unitario" value={pu} onChange={setPu} placeholder="$0" />
                    </div>
                </div>

                <div className="flex items-baseline justify-between rounded-xl bg-muted/50 px-3 py-2.5">
                    <span className="text-xs font-semibold text-muted-foreground">Total de la partida</span>
                    <span className="text-base font-bold text-brand-dark tabular-nums">{fmtMoney(total) || '$0'}</span>
                </div>

                {editando && gastosAsignados > 0 && (
                    <Aviso icon={ListPlus} tono="neutro">Tiene {gastosAsignados} gasto{gastosAsignados === 1 ? '' : 's'} asignado{gastosAsignados === 1 ? '' : 's'}: {fmtMoney(partida?.gastado)} gastado.</Aviso>
                )}

                <FormError message={error} />
            </div>
        </Modal>
    );
};

export default PartidaModal;
