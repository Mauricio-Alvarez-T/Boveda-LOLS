/**
 * Detalle de un lote de documentos físicos (plan Gestiones B6). La acción depende de quién mira y del
 * estado (documentosFisicos.accionesLote):
 *  - Portador + por confirmar → casillas pre-marcadas y "Recibí estos documentos" (desmarca lo que no le
 *    entregaron; eso vuelve a oficina). Pensado para el celular: un tap.
 *  - RRHH + en terreno → por documento Firmado / Sin firma / Sigue en terreno y "Registrar recepción".
 *  - RRHH + por confirmar → "Anular lote" (se equivocó al armarlo). Doble llave: RRHH NO confirma el retiro.
 *  - Cerrado → solo lectura.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, PackageCheck, Trash2, Truck, FileCheck2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { showApiError } from '../../utils/toastUtils';
import { fmtFechaHora } from '../../utils/fechas';
import { cn } from '../../utils/cn';
import {
    agruparPorTrabajador, agruparPorObra, toggleIds, estadoSeleccion, accionesLote, resumenLote, diasDesde,
    buildConfirmarRetiroPayload, buildRecepcionPayload, LOTE_ESTADO_LABEL, ITEM_ESTADO_LABEL,
    type LoteDetalle, type LoteItem, type Desenlace,
} from './documentosFisicos';

interface Props {
    loteId: number | null;
    onClose: () => void;
    /** Tras confirmar / recibir / anular: el padre refresca la lista y el badge. */
    onCambio?: () => void;
}

const checkCls = 'h-5 w-5 rounded border-input accent-brand-primary focus:ring-brand-primary';

const toneItem: Record<LoteItem['estado'], 'neutral' | 'warning' | 'success' | 'danger' | 'info'> = {
    pendiente: 'warning', retirado: 'info', firmado: 'success', devuelto_sin_firma: 'danger', no_entregado: 'neutral',
};
const toneLote: Record<LoteDetalle['estado'], 'warning' | 'info' | 'neutral'> = { pendiente_retiro: 'warning', en_terreno: 'info', cerrado: 'neutral' };

export const LoteDetalleModal: React.FC<Props> = ({ loteId, onClose, onCambio }) => {
    const { user, hasPermission } = useAuth();
    const quien = { id: user?.id, puedeRegistrar: hasPermission('documentos.entrega.registrar'), puedePortar: hasPermission('documentos.entrega.portar') };
    const [lote, setLote] = useState<LoteDetalle | null>(null);
    const [cargando, setCargando] = useState(false);
    const [recibidos, setRecibidos] = useState<number[]>([]);
    const [desenlaces, setDesenlaces] = useState<Record<number, Desenlace>>({});
    const [confirmarAnular, setConfirmarAnular] = useState(false);
    const [ocupado, setOcupado] = useState(false);

    useEffect(() => {
        if (loteId == null) return;
        setLote(null); setRecibidos([]); setDesenlaces({}); setConfirmarAnular(false);
        let cancelado = false;
        setCargando(true);
        api.get<{ data: LoteDetalle }>(`/documentos-lotes/${loteId}`)
            .then(r => {
                if (cancelado) return;
                const l = r.data.data;
                setLote(l);
                // Defaults "rápidos": el portador recibió todo; RRHH recibe todo firmado. Se desmarca la excepción.
                setRecibidos(l.items.filter(i => i.estado === 'pendiente').map(i => i.documento_id));
                const d: Record<number, Desenlace> = {};
                l.items.filter(i => i.estado === 'retirado').forEach(i => { d[i.documento_id] = 'firmado'; });
                setDesenlaces(d);
            })
            .catch(err => { if (!cancelado) { showApiError(err, 'No se pudo abrir el lote'); onClose(); } })
            .finally(() => { if (!cancelado) setCargando(false); });
        return () => { cancelado = true; };
    }, [loteId, onClose]);

    const acciones = lote ? accionesLote(lote, quien) : { confirmarRetiro: false, recepcion: false, anular: false };
    const porObra = useMemo(() => (lote ? agruparPorObra(agruparPorTrabajador(lote.items)) : []), [lote]);
    const setRec = new Set(recibidos);
    const nFirmados = Object.values(desenlaces).filter(d => d === 'firmado').length;
    const nSinFirma = Object.values(desenlaces).filter(d => d === 'sin_firma').length;

    const confirmarRetiro = async () => {
        if (!lote) return;
        setOcupado(true);
        try {
            const res = await api.put<{ data: { recibidos: number; no_entregados: number; estado: string } }>(`/documentos-lotes/${lote.id}/confirmar-retiro`, buildConfirmarRetiroPayload(recibidos));
            const d = res.data.data;
            toast.success(`Retiro confirmado: ${d.recibidos} documento(s) contigo`, { description: d.no_entregados ? `${d.no_entregados} quedaron en oficina como no entregados.` : undefined });
            onCambio?.(); onClose();
        } catch (err) { showApiError(err, 'No se pudo confirmar el retiro'); } finally { setOcupado(false); }
    };

    const registrarRecepcion = async () => {
        if (!lote) return;
        if (!nFirmados && !nSinFirma) { toast.error('Marca al menos un documento como firmado o devuelto sin firma'); return; }
        setOcupado(true);
        try {
            const res = await api.put<{ data: { firmados: number; sin_firma: number; en_terreno: number; estado: string } }>(`/documentos-lotes/${lote.id}/recepcion`, buildRecepcionPayload(desenlaces));
            const d = res.data.data;
            toast.success(`Recepción registrada: ${d.firmados} firmado(s), ${d.sin_firma} sin firma`, { description: d.estado === 'cerrado' ? 'Lote cerrado.' : `${d.en_terreno} documento(s) siguen en terreno.` });
            onCambio?.(); onClose();
        } catch (err) { showApiError(err, 'No se pudo registrar la recepción'); } finally { setOcupado(false); }
    };

    const anular = async () => {
        if (!lote) return;
        setOcupado(true);
        try {
            await api.delete(`/documentos-lotes/${lote.id}`);
            toast.success(`Lote #${lote.id} anulado: los documentos quedan listos para salir de nuevo`);
            onCambio?.(); onClose();
        } catch (err) { showApiError(err, 'No se pudo anular el lote'); } finally { setOcupado(false); }
    };

    const footer = lote && (acciones.confirmarRetiro || acciones.recepcion || acciones.anular) ? (
        <div className="flex w-full flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-sm text-brand-dark">
                {acciones.confirmarRetiro && <><b>{recibidos.length}</b> de {lote.pendientes} documento{lote.pendientes === 1 ? '' : 's'} recibido{recibidos.length === 1 ? '' : 's'}</>}
                {acciones.recepcion && <><b>{nFirmados}</b> firmado{nFirmados === 1 ? '' : 's'} · <b>{nSinFirma}</b> sin firma · {lote.en_terreno - nFirmados - nSinFirma} siguen en terreno</>}
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                <Button variant="ghost" onClick={onClose} disabled={ocupado}>Cerrar</Button>
                {acciones.anular && !confirmarAnular && (
                    <Button variant="destructive" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmarAnular(true)} disabled={ocupado}>Anular lote</Button>
                )}
                {acciones.anular && confirmarAnular && (
                    <Button variant="destructive" onClick={anular} isLoading={ocupado}>Sí, anular</Button>
                )}
                {acciones.confirmarRetiro && (
                    <Button size="lg" leftIcon={<PackageCheck className="h-5 w-5" />} onClick={confirmarRetiro} isLoading={ocupado}>
                        {recibidos.length ? `Recibí estos documentos (${recibidos.length})` : 'No recibí ninguno'}
                    </Button>
                )}
                {acciones.recepcion && (
                    <Button leftIcon={<FileCheck2 className="h-4 w-4" />} onClick={registrarRecepcion} isLoading={ocupado} disabled={!nFirmados && !nSinFirma}>Registrar lo que volvió</Button>
                )}
            </div>
        </div>
    ) : <div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Cerrar</Button></div>;

    const titulo = lote ? `Lote #${lote.id} · ${LOTE_ESTADO_LABEL[lote.estado]}` : 'Lote de documentos';
    const descripcion = lote ? `${lote.portador_nombre || '(usuario eliminado)'} · ${lote.total} documento${lote.total === 1 ? '' : 's'} · ${resumenLote(lote)}` : undefined;

    return (
        <Modal isOpen={loteId != null} onClose={onClose} title={titulo} description={descripcion} icon={Truck} size="lg" footer={footer}>
            {cargando || !lote ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Cargando lote…</p>
            ) : (
                <div className="space-y-4">
                    <div className="bg-background rounded-2xl p-4 border border-border text-sm space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <Chip tone={toneLote[lote.estado]} icon={<Truck className="h-3 w-3" />} label={LOTE_ESTADO_LABEL[lote.estado]} />
                            <span className="font-bold text-brand-dark">Lo lleva: {lote.portador_nombre || '(usuario eliminado)'}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Creado {fmtFechaHora(lote.creado_en)}{lote.creado_por_nombre ? ` por ${lote.creado_por_nombre}` : ''}
                            {lote.retirado_en ? ` · retiro confirmado ${fmtFechaHora(lote.retirado_en)} (hace ${diasDesde(lote.retirado_en)} día${diasDesde(lote.retirado_en) === 1 ? '' : 's'})` : ''}
                            {lote.cerrado_en ? ` · cerrado ${fmtFechaHora(lote.cerrado_en)}` : ''}
                        </p>
                        <p className="text-xs text-brand-dark">{lote.total} documento{lote.total === 1 ? '' : 's'} · {resumenLote(lote)}</p>
                        {lote.observacion && <p className="text-xs text-muted-foreground italic">"{lote.observacion}"</p>}
                    </div>

                    {acciones.confirmarRetiro && (
                        <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-300">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>RRHH dice que te pasó estos documentos. <b>Desmarca</b> los que no tengas en la mano; esos quedan en oficina.</span>
                        </div>
                    )}
                    {acciones.recepcion && (
                        <div role="status" className="flex items-start gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-brand-dark">
                            <FileCheck2 className="h-4 w-4 mt-0.5 shrink-0 text-brand-primary" />
                            <span>Todos vienen marcados como <b>firmados</b>. Cambia a <b>Sin firma</b> el que volvió sin firmar (queda listo para salir de nuevo) o a <b>Sigue en terreno</b> el que aún no volvió.</span>
                        </div>
                    )}
                    {lote.estado === 'pendiente_retiro' && !acciones.confirmarRetiro && (
                        <p className="text-xs text-muted-foreground">Esperando que <b>{lote.portador_nombre || 'el portador'}</b> pase a buscarlos y lo confirme en Bóveda. RRHH no puede confirmar por él.</p>
                    )}

                    {lote.items.length === 0 ? (
                        <EmptyState title="Lote sin documentos" />
                    ) : porObra.map(o => (
                        <div key={o.obra_nombre} className="rounded-2xl border border-border overflow-hidden">
                            <div className="bg-muted px-3 py-1.5 text-caption font-semibold uppercase tracking-wider text-muted-foreground">{o.obra_nombre}</div>
                            <ul className="divide-y divide-border">
                                {o.grupos.map(g => {
                                    const idsPend = g.docs.filter(d => d.estado === 'pendiente').map(d => d.documento_id);
                                    const est = estadoSeleccion(recibidos, idsPend);
                                    const idsTerreno = g.docs.filter(d => d.estado === 'retirado').map(d => d.documento_id);
                                    return (
                                        <li key={g.key} className="px-3 py-2">
                                            <div className="flex items-center gap-3">
                                                {acciones.confirmarRetiro && idsPend.length > 0 && (
                                                    <input type="checkbox" className={checkCls} checked={est === 'todos'} aria-label={`Recibí todos los documentos de ${g.trabajador_nombre}`}
                                                        ref={el => { if (el) el.indeterminate = est === 'parcial'; }}
                                                        onChange={e => setRecibidos(prev => toggleIds(prev, idsPend, e.target.checked))} />
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-brand-dark truncate">{g.trabajador_nombre}</p>
                                                    <p className="text-xs text-muted-foreground">{g.rut || '—'} · {g.docs.length} documento{g.docs.length === 1 ? '' : 's'}</p>
                                                </div>
                                                {acciones.recepcion && idsTerreno.length > 1 && (
                                                    <div className="flex gap-1 shrink-0">
                                                        <Button size="sm" variant="ghost" onClick={() => setDesenlaces(prev => { const n = { ...prev }; idsTerreno.forEach(id => { n[id] = 'firmado'; }); return n; })}>Todos firmados</Button>
                                                        <Button size="sm" variant="ghost" onClick={() => setDesenlaces(prev => { const n = { ...prev }; idsTerreno.forEach(id => { n[id] = 'en_terreno'; }); return n; })}>Siguen en terreno</Button>
                                                    </div>
                                                )}
                                            </div>
                                            <ul className={cn('mt-1.5 space-y-1', acciones.confirmarRetiro ? 'ml-8' : 'ml-0')}>
                                                {g.docs.map(item => (
                                                    <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-xs bg-background">
                                                        {acciones.confirmarRetiro && item.estado === 'pendiente' && (
                                                            <input type="checkbox" className={checkCls} checked={setRec.has(item.documento_id)} aria-label={`Recibí ${item.tipo_nombre || item.nombre_archivo}`}
                                                                onChange={e => setRecibidos(prev => toggleIds(prev, [item.documento_id], e.target.checked))} />
                                                        )}
                                                        <span className="flex-1 min-w-0 truncate text-brand-dark" title={item.nombre_archivo}>{item.tipo_nombre || item.nombre_archivo}</span>
                                                        {acciones.recepcion && item.estado === 'retirado' ? (
                                                            <div className="flex gap-1 shrink-0" role="radiogroup" aria-label={`Desenlace de ${item.tipo_nombre || item.nombre_archivo}`}>
                                                                {([['firmado', 'Firmado', CheckCircle2], ['sin_firma', 'Sin firma', Undo2], ['en_terreno', 'Sigue en terreno', Truck]] as [Desenlace, string, React.ElementType][]).map(([val, label, Icon]) => (
                                                                    <Button key={val} size="sm" variant={desenlaces[item.documento_id] === val ? (val === 'sin_firma' ? 'destructive' : 'primary') : 'outline'}
                                                                        aria-pressed={desenlaces[item.documento_id] === val} leftIcon={<Icon className="h-3.5 w-3.5" />}
                                                                        onClick={() => setDesenlaces(prev => ({ ...prev, [item.documento_id]: val }))}>{label}</Button>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <Chip tone={toneItem[item.estado]} label={ITEM_ESTADO_LABEL[item.estado]} />
                                                        )}
                                                        {item.resuelto_en && <span className="text-muted-foreground">{fmtFechaHora(item.resuelto_en)}</span>}
                                                    </li>
                                                ))}
                                            </ul>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </Modal>
    );
};
