import React, { useState } from 'react';
import { PackageCheck } from 'lucide-react';

/**
 * Panel de recepción del flujo "Solicitud de Materiales" (sin tabla de ítems:
 * solo observación + parcial/total). Extraído de TransferenciaDetail.tsx (Fase 1).
 */
const MaterialesRecepcionPanel: React.FC<{
    loading: boolean;
    onConfirm: (observacion: string, tipo: 'parcial' | 'total') => void;
    onCancel: () => void;
    /** En modal: el Modal aporta título y marco → no renderiza su card de color ni su header propio. */
    embedded?: boolean;
    /** Si ya hubo viajes previos (estado recepcion_parcial), ajusta los textos. */
    yaIniciada?: boolean;
}> = ({ loading, onConfirm, onCancel, embedded = false, yaIniciada = false }) => {
    const [obs, setObs] = useState('');
    return (
        <div className={embedded
            ? "space-y-3"
            : "shrink-0 border border-blue-200 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-950/20 rounded-xl p-4 mb-4 space-y-3"}>
            {!embedded && (
                <div className="flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                    <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300">Registrar entrega</h4>
                </div>
            )}
            <p className="text-label text-muted-foreground">
                Registra lo que llegó en este viaje. Si la entrega viene en <strong>varios viajes</strong>, usa
                {' '}<strong>"Registrar viaje"</strong> (la solicitud queda abierta y queda el registro con tu nombre);
                cuando llegue <strong>todo</strong>, usa <strong>"Cerrar entrega"</strong>. Anota diferencias o sobrantes si aplica.
            </p>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
                placeholder='Observaciones de este viaje (ej. "llegaron 10, se usaron 6, sobran 4")...'
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card resize-none outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button onClick={() => onConfirm(obs.trim(), 'parcial')} disabled={loading}
                    className="flex-1 py-2.5 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                    {loading ? '...' : (yaIniciada ? 'Registrar otro viaje' : 'Registrar viaje (parcial)')}
                </button>
                <button onClick={() => onConfirm(obs.trim(), 'total')} disabled={loading}
                    className="flex-1 py-2.5 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                    {loading ? 'Confirmando...' : 'Cerrar entrega (total)'}
                </button>
            </div>
            <button onClick={onCancel} className="w-full py-1.5 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors">Cancelar</button>
        </div>
    );
};

export default MaterialesRecepcionPanel;
