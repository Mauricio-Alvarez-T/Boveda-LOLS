import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Loader2, RotateCcw } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { RehacerDiscrepanciaPlan, TransferenciaDiscrepanciaItem } from '../../types/entities';
import type { RehacerDiscrepanciaRespuesta, RespaldoRehacer } from '../../hooks/inventario/useTransferencias';
import {
    cant, debeCerrarModal, esReintentar, desglosarAjustesManuales, fmtAjuste, fmtTransicion, rotuloRegimen, signoDiscrepancia,
} from './mensajeDiferencia';

interface Props {
    /** Fila a rehacer. El padre monta el modal solo mientras está abierto, con `key={item.id}`. */
    item: TransferenciaDiscrepanciaItem;
    codigo: string;
    onClose: () => void;
    onRehacer: (id: number, simular: boolean, respaldo?: RespaldoRehacer) => Promise<RehacerDiscrepanciaRespuesta>;
    /** Refresca la lista: la fila vuelve a Pendientes. */
    onHecho: () => Promise<void>;
}

type Fase =
    | { tipo: 'cargando' }
    | { tipo: 'plan'; plan: RehacerDiscrepanciaPlan }
    | { tipo: 'error'; mensaje: string };

/**
 * REHACER una diferencia de la regla anterior (solo Super Administrador, dueño 2026-10-21): primero
 * SIMULA (el servidor devuelve el plan sin escribir) y muestra qué ubicaciones cambian, de cuánto a
 * cuánto; recién al confirmar se aplica. Deja el stock como si hubiera llegado lo ENVIADO y la fila
 * vuelve a Pendientes para aprobarla o rechazarla con la regla nueva.
 */
const DiscrepanciaRehacerModal: React.FC<Props> = ({ item, codigo, onClose, onRehacer, onHecho }) => {
    // Nace «cargando»: se monta al abrir (key = id de la fila), así no hace falta resetear en el efecto.
    const [fase, setFase] = useState<Fase>({ tipo: 'cargando' });
    const [aplicando, setAplicando] = useState(false);
    // Ref además del estado: el Modal registra el Esc con el onClose del render en que se abrió, así que
    // `cerrar` debe leer el valor vivo para no cerrar mientras se aplica.
    const aplicandoRef = useRef(false);

    // Simular al abrir: el servidor devuelve el plan sin escribir nada. Si otra persona ya la rehízo o
    // ya no está (404 / YA_REGLA_NUEVA), el hook avisa y la ventana se cierra.
    useEffect(() => {
        let vigente = true;
        onRehacer(item.id, true, respaldoDe(item)).then(async r => {
            if (!vigente) return;
            if (r.ok) {
                setFase({ tipo: 'plan', plan: r.data });
                return;
            }
            if (debeCerrarModal(r.error, 'rehacer')) {
                onClose();
                await onHecho();
                return;
            }
            setFase({ tipo: 'error', mensaje: r.error.message });
        });
        return () => { vigente = false; };
        // Una sola vez por montaje: `item` y los callbacks cambian de identidad en cada refresco de la lista.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const unidad = item.unidad;
    const plan = fase.tipo === 'plan' ? fase.plan : null;
    const sig = signoDiscrepancia(item.cantidad_enviada, item.cantidad_recibida);

    const cerrar = () => { if (!aplicandoRef.current) onClose(); };

    const confirmar = async () => {
        aplicandoRef.current = true;
        setAplicando(true);
        const r = await onRehacer(item.id, false, respaldoDe(item));
        aplicandoRef.current = false;
        setAplicando(false);
        if (r.ok) {
            onClose();
            await onHecho();
            return;
        }
        // Otro usuario ya la rehízo o se eliminó (el hook avisó): cerrar y refrescar.
        if (debeCerrarModal(r.error, 'rehacer')) {
            onClose();
            await onHecho();
            return;
        }
        // Stock ocupado (409 REINTENTAR, pasajero): se conserva el plan para volver a confirmar.
        if (esReintentar(r.error)) return;
        setFase({ tipo: 'error', mensaje: r.error.message });
    };

    return (
        <Modal
            isOpen
            onClose={cerrar}
            size="md"
            title={
                <div className="flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span>Rehacer con la regla nueva</span>
                </div>
            }
            description={`${codigo} · #${item.nro_item} · ${item.item_descripcion}`}
            footer={
                <div className="flex flex-wrap items-center justify-end gap-2 w-full">
                    <Button variant="ghost" onClick={cerrar} disabled={aplicando}>
                        Cancelar
                    </Button>
                    <Button
                        variant="primary"
                        onClick={confirmar}
                        disabled={!plan || aplicando}
                        isLoading={aplicando}
                        leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                    >
                        {aplicando ? 'Rehaciendo…' : 'Rehacer y reabrir'}
                    </Button>
                </div>
            }
        >
            <div className="space-y-4 text-xs">
                <p className="text-muted-foreground leading-relaxed">
                    Con la regla anterior, lo declarado de {sig?.signo === 'faltante' ? 'menos' : 'más'} ya se aplicó al stock al recibir.
                    Rehacer deja el stock como si hubiera llegado lo <span className="font-semibold text-brand-dark">enviado
                    ({cant(Number(item.cantidad_enviada) || 0, unidad)})</span> y la diferencia vuelve a <span className="font-semibold text-brand-dark">Pendientes</span> para
                    aprobarla o rechazarla.
                </p>

                {fase.tipo === 'cargando' && (
                    <p role="status" className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
                        Calculando qué cambia en el stock…
                    </p>
                )}

                {plan && (
                    <div className="space-y-3">
                        <div className="bg-muted rounded-xl p-3 space-y-1 text-muted-foreground">
                            <p className="break-words">
                                Enviado <span className="font-semibold text-brand-dark">{cant(plan.enviada, unidad)}</span>
                                {' · '}
                                Declarado <span className="font-semibold text-brand-dark">{cant(plan.recibida, unidad)}</span>
                                {plan.dif !== 0 && (
                                    <>
                                        {' · '}
                                        {plan.dif > 0 ? 'De más' : 'De menos'}{' '}
                                        <span className="font-semibold text-brand-dark">{cant(Math.abs(plan.dif), unidad)}</span>
                                    </>
                                )}
                            </p>
                            {rotuloRegimen(plan.regimen) && <p className="break-words">{rotuloRegimen(plan.regimen)}</p>}
                        </div>

                        <div>
                            <p className="font-bold text-brand-dark mb-1.5">Qué cambia en el stock</p>
                            {plan.ajustes.length > 0 ? (
                                <ul className="space-y-1.5">
                                    {plan.ajustes.map((a, i) => {
                                        const detalle = fmtTransicion(a.antes, a.despues);
                                        return (
                                            <li key={`${a.obra_id ?? 'o'}-${a.bodega_id ?? 'b'}-${i}`} className="flex items-start gap-1.5 text-brand-dark">
                                                {a.cantidad > 0
                                                    ? <ArrowUp className="h-3.5 w-3.5 shrink-0 mt-px text-muted-foreground" aria-hidden="true" />
                                                    : <ArrowDown className="h-3.5 w-3.5 shrink-0 mt-px text-muted-foreground" aria-hidden="true" />}
                                                <span className="min-w-0 break-words">
                                                    <span className="font-semibold">{fmtAjuste(a, unidad)}</span>
                                                    {detalle && <span className="text-muted-foreground"> · {detalle}</span>}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <p className="text-muted-foreground">No cambia el stock: solo se reabre la diferencia.</p>
                            )}
                        </div>

                        {plan.aviso && (
                            <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
                                <span className="break-words min-w-0">{plan.aviso}</span>
                            </p>
                        )}

                        {/* Avisos sueltos del plan: p. ej. ajustes manuales del ítem posteriores a la recepción,
                            que el plan no ve (revisar que no se dupliquen). */}
                        {plan.avisos.length > 0 && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                                <p className="flex items-start gap-1.5 font-bold">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
                                    <span className="break-words min-w-0">Revisa antes de rehacer</span>
                                </p>
                                <ul className="mt-1 space-y-1 pl-5 list-disc font-medium" aria-label="Avisos del plan">
                                    {plan.avisos.map((a, i) => {
                                        const manual = desglosarAjustesManuales(a);
                                        if (!manual) return <li key={i} className="break-words">{a}</li>;
                                        return (
                                            <li key={i} className="break-words">
                                                Ajustes manuales después de la recepción:
                                                <ul className="mt-0.5 space-y-0.5 pl-4 list-[circle] font-normal">
                                                    {manual.entradas.map((e, j) => <li key={j} className="break-words">{e}</li>)}
                                                </ul>
                                                {manual.cierre && <p className="mt-0.5 break-words">{manual.cierre}</p>}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}

                        {item.estado !== 'pendiente' && (
                            <p className="text-muted-foreground break-words">
                                La decisión anterior ({item.estado === 'resuelta' ? 'resuelta' : 'descartada'}
                                {item.resolucion ? `: «${item.resolucion}»` : ''}) queda guardada en la nota de la diferencia.
                            </p>
                        )}
                    </div>
                )}

                {fase.tipo === 'error' && (
                    <div
                        role="alert"
                        className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                    >
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
                        <span className="break-words min-w-0">{fase.mensaje}</span>
                    </div>
                )}
            </div>
        </Modal>
    );
};

function respaldoDe(item: TransferenciaDiscrepanciaItem): RespaldoRehacer {
    return {
        item: item.item_descripcion,
        enviada: item.cantidad_enviada,
        recibida: item.cantidad_recibida,
        unidad: item.unidad,
    };
}

export default DiscrepanciaRehacerModal;
