import React, { useState } from 'react';
import { AlertTriangle, PackagePlus, XCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { cn } from '../../utils/cn';

export type FaltanteDecision = 'crear_nueva' | 'ninguna';

interface FaltanteItemRow {
    item_descripcion: string;
    cantidad_faltante: number;
    unidad?: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (decision: FaltanteDecision) => void;
    loading?: boolean;
    faltantes: FaltanteItemRow[];
}

/**
 * Modal que aparece al confirmar una aprobación parcial (donde la suma de
 * splits por ítem es menor que lo solicitado). Pregunta al aprobador qué
 * hacer con la cantidad que no se pudo enviar.
 *
 * Usa frases de usuario final: "queda pendiente cuando llegue stock" en vez
 * de jerga técnica ("crear orden complementaria", etc).
 */
const FaltanteDecisionModal: React.FC<Props> = ({
    isOpen, onClose, onConfirm, loading, faltantes,
}) => {
    const [decision, setDecision] = useState<FaltanteDecision>('crear_nueva');

    const totalFaltantes = faltantes.reduce((s, f) => s + f.cantidad_faltante, 0);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Hay cantidades que no se pudieron enviar">
            <div className="space-y-5">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-foreground">
                        <p className="font-medium mb-1">
                            {totalFaltantes} {totalFaltantes === 1 ? 'unidad no alcanzó' : 'unidades no alcanzaron'} a despacharse
                        </p>
                        <p className="text-muted-foreground">
                            ¿Qué hago con {totalFaltantes === 1 ? 'ella' : 'ellas'}?
                        </p>
                    </div>
                </div>

                {faltantes.length > 0 && (
                    <div className="rounded-lg border border-border/50 overflow-hidden">
                        <div className="max-h-40 overflow-y-auto">
                            <table className="w-full text-sm">
                                <tbody>
                                    {faltantes.map((f, i) => (
                                        <tr key={i} className="border-b border-border/30 last:border-0">
                                            <td className="px-3 py-2 text-foreground">{f.item_descripcion}</td>
                                            <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">
                                                {f.cantidad_faltante} {f.unidad || 'u'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <div className="space-y-2">
                    <label
                        className={cn(
                            "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition",
                            decision === 'crear_nueva'
                                ? "border-primary bg-primary/5"
                                : "border-border/50 hover:border-border"
                        )}
                    >
                        <input
                            type="radio"
                            name="faltante-decision"
                            value="crear_nueva"
                            checked={decision === 'crear_nueva'}
                            onChange={() => setDecision('crear_nueva')}
                            className="mt-1"
                        />
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <PackagePlus className="w-4 h-4 text-primary" />
                                <span className="font-medium text-foreground">Crear nueva solicitud automáticamente</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Queda pendiente para cuando llegue stock. El solicitante no tiene que volver a pedirlo.
                            </p>
                        </div>
                    </label>

                    <label
                        className={cn(
                            "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition",
                            decision === 'ninguna'
                                ? "border-primary bg-primary/5"
                                : "border-border/50 hover:border-border"
                        )}
                    >
                        <input
                            type="radio"
                            name="faltante-decision"
                            value="ninguna"
                            checked={decision === 'ninguna'}
                            onChange={() => setDecision('ninguna')}
                            className="mt-1"
                        />
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <XCircle className="w-4 h-4 text-muted-foreground" />
                                <span className="font-medium text-foreground">No hacer nada</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                El solicitante tendrá que pedirlo de nuevo si lo necesita.
                            </p>
                        </div>
                    </label>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="px-4 py-2 rounded-lg border border-border/50 hover:bg-muted/50 text-sm transition disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => onConfirm(decision)}
                        disabled={loading}
                        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition disabled:opacity-50"
                    >
                        {loading ? 'Procesando…' : 'Confirmar'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default FaltanteDecisionModal;
