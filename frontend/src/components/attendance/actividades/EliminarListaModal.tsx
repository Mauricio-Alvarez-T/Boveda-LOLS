import React, { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { fmtSemana } from '../../../utils/semanas';
import type { ActividadSugeridaDetalle } from '../../../types/actividadesSugeridas';

interface Props {
    lista: ActividadSugeridaDetalle;
    onClose: () => void;
    /** DELETE …/:id/definitivo; true si se borró. */
    onEliminar: (id: number) => Promise<boolean>;
    /** Tras borrar: volver al listado (la lista ya no existe). */
    onEliminada: () => void;
}

const ROTULO_ESTADO: Record<ActividadSugeridaDetalle['estado'], string> = {
    citada: 'Creada',
    realizada: 'Realizada',
    cancelada: 'Cancelada',
};

/**
 * Confirmación del borrado DEFINITIVO de una lista (jefatura 2026-10-26). Distinto de
 * «Cancelar lista»: aquí la lista y sus trabajadores desaparecen y dejan de contar en
 * el informe de asistencia. Solo con el permiso `asistencia.actividades_sugeridas.eliminar`.
 */
const EliminarListaModal: React.FC<Props> = ({ lista, onClose, onEliminar, onEliminada }) => {
    const [borrando, setBorrando] = useState(false);
    const total = lista.trabajadores.length;
    const asistieron = lista.trabajadores.filter(t => Number(t.asistio) === 1).length;
    const trab = `${total} trabajador${total === 1 ? '' : 'es'}`;

    const cerrar = () => { if (!borrando) onClose(); };

    const confirmar = async () => {
        setBorrando(true);
        const ok = await onEliminar(lista.id);
        setBorrando(false);
        if (ok) {
            onClose();
            onEliminada();
        }
    };

    return (
        <Modal
            isOpen
            onClose={cerrar}
            size="md"
            title="Eliminar lista definitivamente"
            description={`${fmtSemana(lista.semana)} · Obra ${lista.obra_nombre}`}
            footer={
                <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="ghost" onClick={cerrar} disabled={borrando}>
                        Volver
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={confirmar}
                        isLoading={borrando}
                        disabled={borrando}
                        leftIcon={<Trash2 className="h-4 w-4" />}
                    >
                        {borrando ? 'Eliminando…' : 'Eliminar definitivamente'}
                    </Button>
                </div>
            }
        >
            <div className="space-y-3 text-sm">
                <div className="rounded-xl bg-muted p-3 text-muted-foreground">
                    <p className="break-words">
                        Estado <span className="font-semibold text-brand-dark">{ROTULO_ESTADO[lista.estado]}</span>
                        {' · '}
                        <span className="font-semibold text-brand-dark">{trab}</span> en la lista
                        {lista.estado === 'realizada' && (
                            <>
                                {' · '}
                                <span className="font-semibold text-brand-dark">{asistieron}</span> asistieron
                            </>
                        )}
                    </p>
                    <p className="mt-0.5 break-words">Solicitada por {lista.creado_por_nombre || '—'}</p>
                </div>

                <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">
                        Se borran la lista y sus {trab}. No se puede deshacer
                        {lista.estado === 'realizada' ? ' y deja de contar en el informe de asistencia de esa semana' : ''}.
                    </span>
                </p>

                {lista.estado === 'citada' && (
                    <p className="break-words text-xs text-muted-foreground">
                        Si solo no se hará la actividad, usa «Cancelar lista»: queda en el historial y libera la semana.
                    </p>
                )}
            </div>
        </Modal>
    );
};

export default EliminarListaModal;
