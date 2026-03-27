import { useState, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'sonner';
import type { Trabajador } from '../../types/entities';

export type ModalType = 'form' | 'finiquito' | 'empresa' | 'obra' | 'cargo' | 'tipodoc' | 'depurar' | null;

export const useConsultasActions = (onRefreshList: () => void) => {
    const [modalType, setModalType] = useState<ModalType>(null);
    const [selectedWorkerForAction, setSelectedWorkerForAction] = useState<Trabajador | null>(null);
    const [depurarConfirmationRut, setDepurarConfirmationRut] = useState('');

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
        handleDelete, confirmFiniquito, handleReactivate,
        handleDepurar, confirmDepurar,
        depurarConfirmationRut, setDepurarConfirmationRut
    };
};
