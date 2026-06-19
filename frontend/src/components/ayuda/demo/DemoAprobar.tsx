import React, { useState } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '../../ui/Button';
import { AprobarForm } from '../../inventario/transferencia-detail/AprobarForm';
import type { ApprovalItemState } from '../../../types/entities';
import type { FaltanteItemRow } from '../../inventario/FaltanteDecisionModal';
import { itemsTransferenciaDemo, stockDataDemo, obrasDemo } from './mockData';

/**
 * Demo interactiva del flujo "Aprobar una solicitud". Monta el AprobarForm REAL
 * con datos de ejemplo y estado local; al confirmar muestra una escena de éxito en
 * vez de llamar a la API.
 */
const initApproval = (): ApprovalItemState[] =>
    itemsTransferenciaDemo.map(i => ({ item_id: i.item_id, cantidad_solicitada: i.cantidad_solicitada, splits: [] }));

export const DemoAprobar: React.FC = () => {
    const [approvalItems, setApprovalItems] = useState<ApprovalItemState[]>(initApproval);
    const [faltanteModal, setFaltanteModal] = useState<{ isOpen: boolean; loading: boolean; faltantes: FaltanteItemRow[] }>({
        isOpen: false, loading: false, faltantes: [],
    });
    const [done, setDone] = useState(false);

    const reset = () => { setApprovalItems(initApproval()); setFaltanteModal({ isOpen: false, loading: false, faltantes: [] }); setDone(false); };

    if (done) {
        return (
            <div className="rounded-2xl border border-success/30 bg-success/5 p-6 text-center space-y-3">
                <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
                <div>
                    <h3 className="text-title-sm font-bold text-brand-dark">¡Transferencia aprobada! (demo)</h3>
                    <p className="text-caption text-muted-foreground mt-1">
                        En la app real pasaría a estado <span className="font-bold">Aprobada</span>. Aviso:
                        {' '}<span className="italic">"Transferencia aprobada — Siguiente paso: despacharla o avisar al transportista".</span>
                    </p>
                </div>
                <Button variant="secondary" size="sm" onClick={reset} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>
                    Aprobar de nuevo
                </Button>
            </div>
        );
    }

    return (
        <AprobarForm
            items={itemsTransferenciaDemo}
            stockData={stockDataDemo}
            stockLoading={false}
            approvalItems={approvalItems}
            setApprovalItems={setApprovalItems}
            faltanteModal={faltanteModal}
            setFaltanteModal={setFaltanteModal}
            onAprobar={async () => { setDone(true); return true; }}
            transferenciaId={999}
            loading={false}
            obras={obrasDemo}
            onClose={() => { /* en la app cerraría el form; aquí ya mostramos el éxito */ }}
            onOpenItem={() => { /* no-op en demo */ }}
        />
    );
};

export default DemoAprobar;
