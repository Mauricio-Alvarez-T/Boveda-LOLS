import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BellOff, BellRing, Send, Smartphone } from 'lucide-react';
import { Button } from '../ui/Button';
import { activarAvisos, desactivarAvisos, leerEstado, probarAviso, type EstadoAvisos } from '../../services/avisosCelular';

/**
 * «Avisos en este celular» (mig 143, prueba piloto: solo el Super Administrador) arriba de Soporte → Errores: activar,
 * mandarse un aviso de prueba o desactivar. Cuando llega una falla real a Errores, el celular suena.
 */

const TEXTO: Record<Exclude<EstadoAvisos, 'inactivo' | 'activo'>, string> = {
    no_soportado: 'Este navegador no puede recibir avisos. Prueba con Chrome en Android.',
    iphone_instalar: 'En iPhone, primero agrega Bóveda a la pantalla de inicio (botón Compartir → «Agregar a inicio»), ábrela desde ese ícono y vuelve aquí.',
    bloqueado: 'En este navegador se dijo que no a los avisos. Para activarlos: ajustes del navegador → Notificaciones → permitir para este sitio.',
};

export const AvisosCelular: React.FC = () => {
    const [estado, setEstado] = useState<EstadoAvisos | null>(null);
    const [ocupado, setOcupado] = useState<'activar' | 'probar' | 'desactivar' | null>(null);

    useEffect(() => {
        let vivo = true;
        leerEstado().then(e => { if (vivo) setEstado(e); }).catch(() => { if (vivo) setEstado('no_soportado'); });
        return () => { vivo = false; };
    }, []);

    const hacer = async (que: 'activar' | 'probar' | 'desactivar') => {
        setOcupado(que);
        try {
            if (que === 'activar') {
                const e = await activarAvisos();
                setEstado(e);
                if (e === 'activo') toast.success('Listo: este celular va a recibir avisos.');
            } else if (que === 'desactivar') {
                setEstado(await desactivarAvisos());
                toast.success('Este celular ya no recibe avisos.');
            } else {
                await probarAviso();
                toast.success('Aviso enviado: debería sonar en unos segundos.');
            }
        } catch {
            toast.error(que === 'probar' ? 'No salió el aviso de prueba. Intenta de nuevo.' : 'No se pudo. Intenta de nuevo.');
        } finally {
            setOcupado(null);
        }
    };

    if (estado === null) return null;
    const activo = estado === 'activo';

    return (
        <section aria-label="Avisos en este celular" className="flex flex-col gap-3 rounded-card border border-border bg-card px-4 py-3 sm:flex-row sm:items-center">
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                {activo ? <BellRing className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-brand-dark">Avisos en este celular <span className="font-normal text-muted-foreground">· prueba</span></p>
                <p className="text-xs text-muted-foreground">
                    {activo ? 'Este celular suena cuando llega una falla a Errores.'
                        : estado === 'inactivo' ? 'Que suene este celular cuando llegue una falla a Errores.'
                            : TEXTO[estado]}
                </p>
            </div>
            <div className="flex flex-wrap gap-2">
                {estado === 'inactivo' && (
                    <Button size="sm" onClick={() => hacer('activar')} isLoading={ocupado === 'activar'} leftIcon={<BellRing className="h-4 w-4" />}>Activar avisos</Button>
                )}
                {activo && (
                    <>
                        <Button size="sm" variant="secondary" onClick={() => hacer('probar')} isLoading={ocupado === 'probar'} leftIcon={<Send className="h-4 w-4" />}>Mandarme un aviso de prueba</Button>
                        <Button size="sm" variant="ghost" onClick={() => hacer('desactivar')} isLoading={ocupado === 'desactivar'} leftIcon={<BellOff className="h-4 w-4" />}>Desactivar</Button>
                    </>
                )}
            </div>
        </section>
    );
};

export default AvisosCelular;
