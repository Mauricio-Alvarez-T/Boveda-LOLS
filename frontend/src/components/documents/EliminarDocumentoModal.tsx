import React, { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import api from '../../services/api';
import { showApiError } from '../../utils/toastUtils';
import { fmtFechaHora } from '../../utils/fechas';
import { documentoEstadoConfig } from '../../utils/statusConfig';
import type { Documento } from '../../types/entities';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface Props {
    documento: Documento;
    onClose: () => void;
    /** Tras eliminar: recargar la lista y los contadores de la ficha. */
    onEliminado: () => void;
}

/**
 * Confirmación para quitar un documento laboral generado de la ficha (dueño 2026-11-06). Solo se abre con
 * `documentos.laborales.eliminar`. Borrado lógico en el servidor (queda en el historial); si estaba en un
 * lote de custodia en curso el servidor responde 409 y el aviso lo explica.
 */
export const EliminarDocumentoModal: React.FC<Props> = ({ documento: d, onClose, onEliminado }) => {
    const [borrando, setBorrando] = useState(false);
    const nombre = d.tipo_nombre || d.nombre_archivo;
    const estado = d.estado ? documentoEstadoConfig[d.estado]?.label ?? d.estado : 'Generado';

    const cerrar = () => { if (!borrando) onClose(); };

    const confirmar = async () => {
        setBorrando(true);
        try {
            await api.delete(`/documentos-laborales/${d.id}`);
            toast.success(`${nombre} eliminado de la ficha`);
            onClose();
            onEliminado();
        } catch (err) {
            showApiError(err, 'No se pudo eliminar el documento');
        } finally {
            setBorrando(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={cerrar}
            size="md"
            title="Eliminar documento"
            description={nombre}
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
                        {borrando ? 'Eliminando…' : 'Eliminar documento'}
                    </Button>
                </div>
            }
        >
            <div className="space-y-3 text-sm">
                <div className="rounded-xl bg-muted p-3 text-muted-foreground">
                    <p className="break-words">
                        Estado <span className="font-semibold text-brand-dark">{estado}</span>
                        {d.fecha_generacion ? ` · emitido ${fmtFechaHora(d.fecha_generacion)}` : ''}
                        {d.generado_por_nombre ? ` por ${d.generado_por_nombre}` : ''}
                    </p>
                    <p className="mt-0.5 break-words">{d.nombre_archivo}</p>
                </div>

                <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">
                        Deja de aparecer en la ficha y no se puede descargar ni imprimir.
                        {d.estado === 'firmado' ? ' Ya está firmado: guarda el papel firmado igual.' : ''}
                        {' '}Para tenerlo de nuevo hay que volver a emitirlo.
                    </span>
                </p>
            </div>
        </Modal>
    );
};
