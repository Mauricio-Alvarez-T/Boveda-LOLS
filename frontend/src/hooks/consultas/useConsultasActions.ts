import { useState, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'sonner';
import type { Trabajador } from '../../types/entities';

export type ModalType = 'form' | 'finiquito' | 'reactivar' | 'empresa' | 'obra' | 'cargo' | 'tipodoc' | 'depurar' | 'solicitud' | null;

/**
 * Acciones por fila de Gestiones. Desvincular y reactivar abren sus propios modales
 * (DesvincularModal / ReactivarModal, plan Gestiones B4): el PUT genérico
 * `/trabajadores/:id {activo, fecha_desvinculacion}` ya no existe — ahora hay endpoints
 * dedicados con causal e historial (`/:id/desvincular`, `/:id/reactivar`).
 */
export const useConsultasActions = (onRefreshList: () => void) => {
    const [modalType, setModalType] = useState<ModalType>(null);
    const [selectedWorkerForAction, setSelectedWorkerForAction] = useState<Trabajador | null>(null);
    const [depurarConfirmationRut, setDepurarConfirmationRut] = useState('');

    /** Abre el modal de desvinculación (fecha + causal obligatoria + detalle + marca). */
    const handleDelete = useCallback((worker: Trabajador) => {
        setSelectedWorkerForAction(worker);
        setModalType('finiquito');
    }, []);

    /** Abre el modal de reactivación (muestra la última desvinculación y la marca "no recontratar"). */
    const handleReactivate = useCallback((worker: Trabajador) => {
        setSelectedWorkerForAction(worker);
        setModalType('reactivar');
    }, []);

    /** Cierre común tras desvincular/reactivar con éxito. */
    const handleAccionCompletada = useCallback(() => {
        setModalType(null);
        onRefreshList();
    }, [onRefreshList]);

    const handleDepurar = useCallback((worker: Trabajador) => {
        setSelectedWorkerForAction(worker);
        setDepurarConfirmationRut('');
        setModalType('depurar');
    }, []);

    const confirmDepurar = useCallback(() => {
        if (!selectedWorkerForAction || depurarConfirmationRut !== selectedWorkerForAction.rut) return;

        api.delete(`/trabajadores/${selectedWorkerForAction.id}/depurar`)
            .then(() => {
                toast.success('Registro del trabajador depurado exitosamente');
                setModalType(null);
                onRefreshList();
            })
            .catch(err => {
                console.error(err);
                toast.error(err.response?.data?.error || 'Error al depurar registro del trabajador');
            });
    }, [selectedWorkerForAction, depurarConfirmationRut, onRefreshList]);

    return {
        modalType, setModalType,
        selectedWorkerForAction, setSelectedWorkerForAction,
        handleDelete, handleReactivate, handleAccionCompletada,
        handleDepurar, confirmDepurar,
        depurarConfirmationRut, setDepurarConfirmationRut
    };
};
