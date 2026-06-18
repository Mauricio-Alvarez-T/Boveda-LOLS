import React from 'react';
import { CheckCircle2, PackageOpen } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import WhatsAppIcon from '../../ui/WhatsAppIcon';
import { estadoConfig } from '../TransferenciasList';
import { transferenciaRoute } from '../../../utils/formatBodega';
import { prepareAndShareWithToast } from '../../../utils/whatsappShare';
import { buildTransferenciaWhatsappText, type WhatsappCustomItem } from '../../../utils/transferenciaWhatsApp';
import type { Transferencia, TransferenciaItem } from '../../../types/entities';

export type ResumenAccionTipo = 'crear' | 'aprobar' | 'recibir_total' | 'recibir_parcial';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Transferencia FRESCA (post-refetch): trae `items` e `items_custom` actualizados. */
    t: Transferencia | null;
    tipo: ResumenAccionTipo;
}

const COPY: Record<ResumenAccionTipo, { title: string; subtitle: string }> = {
    crear: {
        title: 'Solicitud enviada',
        subtitle: 'Quedó registrada. Comparte el respaldo por WhatsApp para que el resto se entere.',
    },
    aprobar: {
        title: 'Solicitud aprobada',
        subtitle: 'Avisa por WhatsApp lo que se aprobó (transportista / obra de destino).',
    },
    recibir_total: {
        title: 'Recepción registrada',
        subtitle: 'Se cerró la recepción. Comparte el comprobante de lo recibido.',
    },
    recibir_parcial: {
        title: 'Recepción parcial registrada',
        subtitle: 'Se registró lo que llegó; aún quedan ítems por recibir. Comparte el avance.',
    },
};

/**
 * Modal-resumen que se abre TRAS una acción exitosa (crear / aprobar / recibir
 * total / recibir parcial). Muestra qué pasó + el PREVIEW exacto del respaldo y
 * deja el botón de WhatsApp acá para que quede claro CUÁNDO se envía en el flujo.
 *
 * Toma solo `t` (la TRF fresca) y `tipo`; deriva ruta/estado/ítems internamente
 * (misma fuente que el ícono siempre-visible de TransferenciaDetail).
 */
const ResumenAccionModal: React.FC<Props> = ({ isOpen, onClose, t, tipo }) => {
    if (!t) return null;

    const copy = COPY[tipo];
    const cfg = estadoConfig[t.estado] || estadoConfig.pendiente;
    const { origen, destino } = transferenciaRoute(t);
    const items: TransferenciaItem[] = t.items || [];
    const itemsCustom = ((t as { items_custom?: WhatsappCustomItem[] }).items_custom) || [];

    const text = buildTransferenciaWhatsappText({
        t, items, itemsCustom, estadoLabel: cfg.label, origen, destino,
    });

    const HeaderIcon = tipo === 'recibir_parcial' ? PackageOpen : CheckCircle2;

    const handleEnviar = async () => {
        await prepareAndShareWithToast({
            text,
            title: `Transferencia ${t.codigo}`,
            toastId: `wa-transfer-${t.id}`,
        });
        // Cerramos para que el toast con "ENVIAR AHORA" quede a la vista.
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={
                <span className="flex items-center gap-2">
                    <HeaderIcon className="h-5 w-5 text-brand-primary shrink-0" />
                    {copy.title}
                </span>
            }
            size="md"
            footer={
                <>
                    <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleEnviar}
                        leftIcon={<WhatsAppIcon className="h-4 w-4" />}
                    >
                        Enviar por WhatsApp
                    </Button>
                </>
            }
        >
            <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{copy.subtitle}</p>

                {/* Recap compacto: código + ruta + estado */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="font-black text-brand-dark">{t.codigo}</span>
                    <span className="text-muted-foreground">{origen} → {destino}</span>
                    <span className={`ml-auto px-2 py-0.5 rounded-full border font-bold ${cfg.color}`}>
                        {cfg.label}
                    </span>
                </div>

                {/* Preview EXACTO del respaldo que se enviará */}
                <div>
                    <p className="text-label font-semibold text-muted-foreground mb-1.5">
                        Mensaje que se enviará:
                    </p>
                    <pre className="bg-muted/60 border border-border rounded-xl p-3 text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed max-h-[42vh] overflow-y-auto custom-scrollbar font-sans">
                        {text}
                    </pre>
                </div>
            </div>
        </Modal>
    );
};

export default ResumenAccionModal;
