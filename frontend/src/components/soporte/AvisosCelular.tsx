import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BellOff, BellRing, Send, Smartphone, Stethoscope } from 'lucide-react';
import { Button } from '../ui/Button';
import { Cargando, Skeleton } from '../ui/Skeleton';
import {
    FalloActivar, activarAvisos, avisoLocal, desactivarAvisos, estadoServidor, leerEstado, probarAviso,
    type CelularServidor, type EstadoAvisos,
} from '../../services/avisosCelular';
import { textoIngreso } from './fichaUsuario';

/**
 * «Avisos en este celular» (mig 143, prueba piloto: solo el Super Administrador) arriba de Soporte → Errores: activar,
 * mandarse un aviso de prueba o desactivar. Cuando llega una falla real a Errores, el celular suena.
 * Para encontrar dónde se pierde un aviso: lo que respondió el servidor la última vez y «Probar solo este celular»
 * (un aviso que muestra el propio teléfono, sin internet).
 */

const TEXTO: Record<Exclude<EstadoAvisos, 'inactivo' | 'activo'>, string> = {
    no_soportado: 'Este navegador no puede recibir avisos. Prueba con Chrome en Android.',
    iphone_instalar: 'En iPhone, primero agrega Bóveda a la pantalla de inicio (botón Compartir → «Agregar a inicio»), ábrela desde ese ícono y vuelve aquí.',
    bloqueado: 'En este navegador se dijo que no a los avisos. Para activarlos: ajustes del navegador → Notificaciones → permitir para este sitio.',
};

/** Lo que respondió el servidor la última vez, en una línea. */
function textoServidor(lista: CelularServidor[] | null): string {
    if (!lista) return '';
    if (!lista.length) return 'El servidor no tiene este celular: toca «Desactivar» y vuelve a «Activar avisos».';
    const c = lista[0];
    if (c.ultimo_error) return `El último aviso no salió (respuesta ${c.ultimo_error}): toca «Desactivar» y vuelve a «Activar avisos».`;
    if (c.ultimo_envio) return `El servidor entregó el último aviso ${textoIngreso(c.ultimo_envio)}.`;
    return 'Todavía no se ha mandado ningún aviso a este celular.';
}

export const AvisosCelular: React.FC = () => {
    const [estado, setEstado] = useState<EstadoAvisos | null>(null);
    const [servidor, setServidor] = useState<CelularServidor[] | null>(null);
    const [ocupado, setOcupado] = useState<'activar' | 'probar' | 'desactivar' | 'local' | null>(null);

    const leerServidor = useCallback(async () => {
        try { setServidor((await estadoServidor()).lista); } catch { setServidor(null); }
    }, []);

    useEffect(() => {
        let vivo = true;
        leerEstado()
            .then(e => {
                if (!vivo) return;
                setEstado(e);
                if (e === 'activo') {
                    estadoServidor().then(r => { if (vivo) setServidor(r.lista); }).catch(() => { /* sin datos del servidor */ });
                }
            })
            .catch(() => { if (vivo) setEstado('no_soportado'); });
        return () => { vivo = false; };
    }, []);

    const hacer = async (que: 'activar' | 'probar' | 'desactivar' | 'local') => {
        setOcupado(que);
        try {
            if (que === 'activar') {
                const e = await activarAvisos();
                setEstado(e);
                if (e === 'activo') { toast.success('Listo: este celular va a recibir avisos.'); await leerServidor(); }
            } else if (que === 'desactivar') {
                setEstado(await desactivarAvisos());
                setServidor(null);
                toast.success('Este celular ya no recibe avisos.');
            } else if (que === 'local') {
                await avisoLocal();
                toast.success('Si apareció un aviso, este celular sí los muestra.');
            } else {
                await probarAviso();
                toast.success('El servidor lo mandó: debería sonar en unos segundos.');
                await leerServidor();
            }
        } catch (e) {
            if (que === 'probar') await leerServidor();
            toast.error(que === 'probar' ? 'No salió el aviso de prueba. Mira el detalle en la tarjeta.'
                : e instanceof FalloActivar ? `No se pudo (${e.message}). Intenta de nuevo.` : 'No se pudo. Intenta de nuevo.');
        } finally {
            setOcupado(null);
        }
    };

    if (estado === null) {
        // Mientras se lee el estado de este equipo: la misma tarjeta, con el texto y el botón en gris.
        return (
            <Cargando que="los avisos de este celular" className="flex flex-col gap-3 rounded-card border border-border bg-card px-4 py-3 sm:flex-row sm:items-center">
                <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm font-semibold text-brand-dark">Avisos en este celular <span className="font-normal text-muted-foreground">· prueba</span></p>
                    <Skeleton className="h-3 w-3/4 max-w-sm" />
                </div>
                <Skeleton className="h-9 w-36 rounded-full" />
            </Cargando>
        );
    }
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
                {activo && servidor !== null && <p className="mt-0.5 text-xs text-foreground">{textoServidor(servidor)}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
                {estado === 'inactivo' && (
                    <Button size="sm" onClick={() => hacer('activar')} isLoading={ocupado === 'activar'} leftIcon={<BellRing className="h-4 w-4" />}>Activar avisos</Button>
                )}
                {activo && (
                    <>
                        <Button size="sm" variant="secondary" onClick={() => hacer('probar')} isLoading={ocupado === 'probar'} leftIcon={<Send className="h-4 w-4" />}>Mandarme un aviso de prueba</Button>
                        <Button size="sm" variant="ghost" onClick={() => hacer('local')} isLoading={ocupado === 'local'} leftIcon={<Stethoscope className="h-4 w-4" />}>Probar solo este celular</Button>
                        <Button size="sm" variant="ghost" onClick={() => hacer('desactivar')} isLoading={ocupado === 'desactivar'} leftIcon={<BellOff className="h-4 w-4" />}>Desactivar</Button>
                    </>
                )}
            </div>
        </section>
    );
};

export default AvisosCelular;
