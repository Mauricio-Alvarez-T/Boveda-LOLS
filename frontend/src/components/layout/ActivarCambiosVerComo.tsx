/**
 * «Activar cambios» de la franja de «ver como» (Marcos 2026-10-26, «está conversado con el jefe»): antes de dejar
 * escribir como la otra persona, una advertencia con el texto acordado y dos salidas: «Activar cambios» (rojo:
 * atención, no el verde de marca) y «Seguir en solo lectura». Al aceptar, pide al servidor el token del modo cambios
 * (POST /soporte/ver-como/escritura, con el token de solo lectura + la sesión propia en `X-Sesion-Propia`) y lo guarda
 * junto a la sesión prestada.
 * Si el servidor no lo da: 401 → api.ts ya vuelve a la cuenta propia; 403 → api.ts ya muestra su mensaje; lo demás,
 * un aviso aquí. Docs: docs/reglas/seguridad-rbac.md § Ver como usuario (soporte).
 */
import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
    AVISOS_VER_COMO, encabezadoSesionPropia, textoAdvertenciaCambios, textoVence, type RespuestaCambiosVerComo,
    type SesionVerComo,
} from '../../context/verComoSesion';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    verComo: SesionVerComo;
}

export const ActivarCambiosVerComo: React.FC<Props> = ({ isOpen, onClose, verComo }) => {
    const { activarCambiosVerComo } = useAuth();
    const [activando, setActivando] = useState(false);
    const { user, quien } = verComo;

    const activar = async () => {
        if (!activarCambiosVerComo || activando) return;
        // El servidor exige también la sesión propia (localStorage), en su propio encabezado.
        let propio: string | null = null;
        try { propio = localStorage.getItem('sgdl_token'); } catch { propio = null; }
        const encabezado = encabezadoSesionPropia(propio);
        if (!encabezado) {
            toast.error(AVISOS_VER_COMO.noSeActivaronCambios, { description: AVISOS_VER_COMO.sinSesionPropia });
            return;
        }
        setActivando(true);
        try {
            const res = await api.post<{ data: RespuestaCambiosVerComo }>('/soporte/ver-como/escritura', null, { headers: encabezado });
            if (activarCambiosVerComo(res.data.data)) onClose();
            else toast.error(AVISOS_VER_COMO.noSeActivaronCambios);
        } catch (err) {
            const r = (err as { response?: { status?: number; data?: { error?: string } } }).response;
            if (r?.status !== 401 && r?.status !== 403) {
                toast.error(AVISOS_VER_COMO.noSeActivaronCambios, { description: r?.data?.error });
            }
        } finally {
            setActivando(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => { if (!activando) onClose(); }}
            size="sm"
            title="Activar cambios"
            description={`Viendo como ${user.nombre}${user.rol ? ` (${user.rol})` : ''}`}
            footer={
                <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end sm:gap-3">
                    <Button variant="secondary" onClick={onClose} disabled={activando} className="w-full sm:w-auto">
                        Seguir en solo lectura
                    </Button>
                    <Button variant="destructive" onClick={activar} isLoading={activando} className="w-full sm:w-auto">
                        Activar cambios
                    </Button>
                </div>
            }
        >
            <div className="flex gap-3 pb-2">
                <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                </span>
                <div className="min-w-0 space-y-3">
                    <p className="text-sm leading-relaxed text-foreground">
                        {textoAdvertenciaCambios(user.nombre, user.rol, quien.nombre)}
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        No alarga el «ver como»: {textoVence(verComo.vence)}. Su contraseña, los usuarios, los roles y
                        los permisos no se cambian desde aquí.
                    </p>
                </div>
            </div>
        </Modal>
    );
};
