import React, { useEffect, useMemo } from 'react';
import { Modal } from '../../ui/Modal';
import { useNuevoMovimientoData } from '../../../hooks/inventario/useNuevoMovimientoData';
import { useWizardEngine } from './wizardEngine';
import { NuevoMovimientoWizardView } from './NuevoMovimientoWizardView';
import type { PermisosMovimiento, MovimientoResuelto } from '../../../utils/inferMovimiento';

/**
 * Wizard adaptativo del alta (Fase 4 / 4.1). DOS modos, gated por permiso desde el
 * panel padre:
 * - "pedir": el jefe de obra SOLO elige obra destino + ítems (con indicador de
 *   disponibilidad). Origen fijo = central (lo decide quien aprueba). → solicitud /
 *   solicitud_materiales.
 * - "mover": origen físico (que el usuario conoce) + destino → inferMovimiento deduce
 *   devolución / intra-obra / intra-bodega / push directo / orden de gerencia.
 * El backend no cambia: `onSubmit` recibe el resultado tipado y el padre lo despacha.
 *
 * Wrapper fino: la carga de datos vive en `useNuevoMovimientoData`, el estado +
 * derivaciones en `useWizardEngine`, y la UI en `NuevoMovimientoWizardView` (esos 3
 * los reusa el Centro de ayuda con datos de ejemplo). Aquí solo se compone + el Modal.
 */
export const NuevoMovimientoWizard: React.FC<{
    isOpen: boolean;
    modo: 'pedir' | 'mover';
    onClose: () => void;
    hasPermission: (p: string) => boolean;
    onSubmit: (resuelto: MovimientoResuelto) => Promise<{ id: number; codigo: string } | null>;
}> = ({ isOpen, modo, onClose, hasPermission, onSubmit }) => {
    const { data, loadingData, reload } = useNuevoMovimientoData();

    const permisos: PermisosMovimiento = useMemo(() => ({
        solicitar: hasPermission('inventario.transferencias.solicitar'),
        solicitudMateriales: hasPermission('inventario.transferencias.solicitud_materiales'),
        pushDirecto: hasPermission('inventario.transferencias.push_directo'),
        intraBodega: hasPermission('inventario.transferencias.intra_bodega'),
        devolucion: hasPermission('inventario.transferencias.devolucion'),
        intraObra: hasPermission('inventario.transferencias.intra_obra'),
        ordenGerencia: hasPermission('inventario.transferencias.orden_gerencia'),
    }), [hasPermission]);

    const engine = useWizardEngine(modo, data, permisos);

    // Reset de inputs + carga de datos al abrir (igual que antes; modo entra vía reset).
    useEffect(() => {
        if (!isOpen) return;
        engine.reset();
        reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, engine.reset, reload]);

    const titulo = modo === 'pedir' ? 'Nueva solicitud' : 'Mover stock';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={titulo} size="lg">
            <NuevoMovimientoWizardView
                modo={modo} engine={engine} data={data} loadingData={loadingData}
                onClose={onClose} onSubmit={onSubmit}
            />
        </Modal>
    );
};
