import { useState, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'sonner';
import type { Trabajador } from '../../types/entities';

export type ModalType = 'form' | 'finiquito' | 'empresa' | 'obra' | 'cargo' | 'tipodoc' | 'purgar' | null;

export const useConsultasActions = (onRefreshList: () => void) => {
    const [modalType, setModalType] = useState<ModalType>(null);
    const [selectedWorkerForAction, setSelectedWorkerForAction] = useState<Trabajador | null>(null);
    const [purgeConfirmationRut, setPurgeConfirmationRut] = useState('');

    const handleDelete = useCallback((worker: Trabajador) => {
        setSelectedWorkerForAction(worker);
        setModalType('finiquito');
    }, []);

    const confirmFiniquito = useCallback((date: string) => {
        if (!selectedWorkerForAction) return;
        api.put(`/trabajadores/${selectedWorkerForAction.id}`, { activo: false, fecha_desvinculacion: date })
            .then(() => {
                toast.success("Trabajador desvinculado con éxito.");
                setModalType(null);
                onRefreshList();
            })
            .catch(err => {
                console.error(err);
                toast.error("Error al desvincular trabajador.");
            });
    }, [selectedWorkerForAction, onRefreshList]);

    const handleReactivate = useCallback((id: number) => {
        if (window.confirm("¿Estás seguro de que deseas reactivar a este trabajador?")) {
            api.put(`/trabajadores/${id}`, { activo: true, fecha_desvinculacion: null })
                .then(() => {
                    toast.success("Trabajador reactivado con éxito.");
                    onRefreshList();
                })
                .catch((err) => {
                    console.error(err);
                    toast.error("Error al reactivar trabajador.");
                });
        }
    }, [onRefreshList]);

    const handlePurge = useCallback((worker: Trabajador) => {
        setSelectedWorkerForAction(worker);
        setPurgeConfirmationRut('');
        setModalType('purgar');
    }, []);

    const confirmPurge = useCallback(() => {
        if (!selectedWorkerForAction || purgeConfirmationRut !== selectedWorkerForAction.rut) return;

        api.delete(`/trabajadores/${selectedWorkerForAction.id}/purge`)
            .then(() => {
                toast.success('Trabajador eliminado permanentemente de la base de datos');
                setModalType(null);
                onRefreshList();
            })
            .catch(err => {
                console.error(err);
                toast.error(err.response?.data?.error || 'Error al eliminar trabajador permanentemente');
            });
    }, [selectedWorkerForAction, purgeConfirmationRut, onRefreshList]);

    return {
        modalType, setModalType,
        selectedWorkerForAction, setSelectedWorkerForAction,
        handleDelete, confirmFiniquito, handleReactivate,
        handlePurge, confirmPurge,
        purgeConfirmationRut, setPurgeConfirmationRut
    };
};
