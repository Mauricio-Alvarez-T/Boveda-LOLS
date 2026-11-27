import React from 'react';
import { AlertTriangle, Save } from 'lucide-react';

import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import WhatsAppIcon from '../../ui/WhatsAppIcon';
import { fechaLarga } from '../../dashboard/widgets/mensajesWhatsApp';

/** Por qué no se puede guardar desde aquí (`null` = sí se puede). */
export type MotivoSinGuardar = 'dia' | 'mes' | 'permiso' | null;

interface Props {
    isOpen: boolean;
    onClose: () => void;
    obraNombre: string;
    /** 'YYYY-MM-DD' del día que se está viendo. */
    fecha: string;
    motivoSinGuardar: MotivoSinGuardar;
    guardando: boolean;
    onGuardarYEnviar: () => void;
    onEnviarSinGuardar: () => void;
}

const TEXTO: Record<'dia' | 'mes' | 'permiso', string> = {
    dia: 'Este día ya cerró: solo RR.HH. puede guardarlo. Si la envía, saldrá marcada como no guardada.',
    mes: 'Es de un mes que ya cerró: solo RR.HH. puede guardarlo. Si la envía, saldrá marcada como no guardada.',
    permiso: 'Usted no puede guardar la asistencia. Si la envía, saldrá marcada como no guardada.',
};

/**
 * Advertencia al tocar WhatsApp en un día sin la lista guardada (Marcos 2026-11-27: «en el botón de whatsapp generar
 * una advertencia … está enviando una asistencia que no ha sido guardada»; vista previa aprobada). La pantalla propone
 * «A» a todos por defecto y el mensaje salía igual que una lista pasada (RIVAS VICUÑA, 25-11).
 *
 * Quien puede guardar: «Guardar y enviar» (recomendado), «Enviar sin guardar» o «Cancelar». Quien no (día cerrado o
 * sin permiso): «Enviar con el aviso» o «Cancelar». Enviando sin guardar, el mensaje parte con «ASISTENCIA NO GUARDADA
 * EN BÓVEDA». En el celular es la hoja desde abajo del Modal; en el computador, la ventana al centro.
 */
export const AvisoAsistenciaNoGuardada: React.FC<Props> = ({
    isOpen, onClose, obraNombre, fecha, motivoSinGuardar, guardando, onGuardarYEnviar, onEnviarSinGuardar,
}) => {
    const puedeGuardar = motivoSinGuardar === null;
    return (
        // `md`: en el computador los tres botones caben en una fila (con `sm` «Cancelar» bajaba sola).
        <Modal isOpen={isOpen} onClose={onClose} size="md"
            title="Esta asistencia no ha sido guardada"
            description={`${obraNombre} · ${fechaLarga(fecha)}`}>
            <div className="space-y-5 pb-4 md:pb-0">
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" aria-hidden>
                        <AlertTriangle className="h-5 w-5" />
                    </span>
                    <p className="text-sm text-muted-foreground">
                        {puedeGuardar
                            ? 'Está enviando una asistencia que no ha sido guardada. Las «A» son las que Bóveda propone: si la envía así, el día sigue sin lista.'
                            : TEXTO[motivoSinGuardar]}
                    </p>
                </div>
                {/* Celular: uno bajo otro, el principal arriba. Computador: en fila a la derecha, el principal al final. */}
                <div className="flex flex-col gap-2 md:flex-row-reverse md:flex-wrap md:justify-start">
                    {puedeGuardar && (
                        <Button onClick={onGuardarYEnviar} isLoading={guardando} leftIcon={<Save className="h-4 w-4" />}>
                            Guardar y enviar
                        </Button>
                    )}
                    <Button variant={puedeGuardar ? 'glass' : 'primary'} onClick={onEnviarSinGuardar} disabled={guardando}
                        leftIcon={<WhatsAppIcon className="h-4 w-4 shrink-0" />}>
                        {puedeGuardar ? 'Enviar sin guardar' : 'Enviar con el aviso'}
                    </Button>
                    <Button variant="ghost" onClick={onClose} disabled={guardando}>Cancelar</Button>
                </div>
            </div>
        </Modal>
    );
};

export default AvisoAsistenciaNoGuardada;
