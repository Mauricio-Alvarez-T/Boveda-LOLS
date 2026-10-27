import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BellOff, BellRing, Smartphone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import { activarAvisos, estadoServidor, leerEstado, pedidoAvisos, type PedidoAvisos } from '../../services/avisosCelular';

/**
 * Avisos de pendientes al celular (Marcos 2026-10-27, decisión de don Luis): a quien está en el horario de
 * recordatorios (avisosPendientes.service.js) y abre Bóveda en un celular donde los avisos funcionan, se le pide
 * activarlos **sin opción de saltarlo**: una pantalla con un solo botón, cada vez que abra Bóveda, hasta activarlos.
 * El celular siempre pregunta «¿Permitir notificaciones?» (eso no lo puede saltar ninguna app); si dice que no o los
 * apaga después, queda una franja fija arriba con los pasos. La app sigue funcionando: no se traba el trabajo.
 * En el computador y con «ver como», nada.
 */

const esCelular = () => typeof window !== 'undefined'
    && (window.matchMedia?.('(max-width: 767px)').matches || window.matchMedia?.('(pointer: coarse)').matches);

export const ActivarAvisos: React.FC = () => {
    const { isAuthenticated, verComo } = useAuth();
    const [pedido, setPedido] = useState<PedidoAvisos>('nada');
    const [activando, setActivando] = useState(false);

    useEffect(() => {
        if (!isAuthenticated || verComo || !esCelular()) return undefined;
        let vivo = true;
        (async () => {
            try {
                const [estado, servidor] = await Promise.all([leerEstado(), estadoServidor()]);
                const p = pedidoAvisos({ debeActivar: servidor.debeActivar, esCelular: true, mirando: false, estado, celularesServidor: servidor.celulares });
                if (!vivo) return;
                if (p === 'resincronizar') {
                    // Tiene el permiso y la suscripción en el celular, pero el servidor no la tiene (reinstaló, otro
                    // entorno): se vuelve a mandar sin preguntar nada.
                    activarAvisos().catch(() => { /* lo intenta la próxima vez */ });
                    return;
                }
                setPedido(p);
            } catch { /* sin conexión: lo vuelve a revisar la próxima vez que abra Bóveda */ }
        })();
        return () => { vivo = false; };
    }, [isAuthenticated, verComo]);

    const activar = async () => {
        setActivando(true);
        try {
            const e = await activarAvisos();
            if (e === 'activo') {
                setPedido('nada');
                toast.success('Listo: le avisaremos en este celular cuando tenga algo pendiente.');
            } else if (e === 'bloqueado') {
                setPedido('bloqueado');
            }
        } catch {
            toast.error('No se pudieron activar los avisos. Intente de nuevo.');
        } finally {
            setActivando(false);
        }
    };

    if (pedido === 'activar') {
        return (
            <div role="dialog" aria-modal="true" aria-labelledby="activar-avisos-titulo"
                className="fixed inset-0 z-[9998] flex items-center justify-center bg-background/95 p-6">
                <div className="w-full max-w-sm rounded-card border border-border bg-card p-6 text-center">
                    <span aria-hidden className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
                        <BellRing className="h-7 w-7" />
                    </span>
                    <h2 id="activar-avisos-titulo" className="mt-4 text-section font-semibold text-brand-dark">Active los avisos de Bóveda</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Le avisaremos en este celular cuando tenga trabajo pendiente de su cargo, por ejemplo solicitudes por
                        aprobar o materiales por recibir, para que esté al día. Si está al día, no le llega nada.
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">Al tocar el botón, el celular le preguntará si permite las notificaciones: elija «Permitir».</p>
                    <Button className="mt-5 h-12 w-full" onClick={activar} isLoading={activando} leftIcon={<BellRing className="h-5 w-5" />}>
                        Activar avisos
                    </Button>
                </div>
            </div>
        );
    }

    if (pedido === 'bloqueado' || pedido === 'iphone') {
        return (
            <div role="status" className="flex items-start gap-2.5 bg-amber-100 px-4 py-2.5 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                {pedido === 'bloqueado' ? <BellOff aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /> : <Smartphone aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />}
                <p>
                    {pedido === 'bloqueado' ? (
                        <><strong>Los avisos de Bóveda están desactivados en este celular.</strong> Para activarlos: mantenga presionado el
                            ícono de Bóveda → «Información de la app» → Notificaciones → Permitir. Si usa Bóveda en Chrome: ⋮ →
                            Configuración → Configuración de sitios → Notificaciones → permitir este sitio.</>
                    ) : (
                        <><strong>Para recibir los avisos de Bóveda en el iPhone,</strong> agréguela a la pantalla de inicio (botón Compartir →
                            «Agregar a inicio») y ábrala desde ese ícono.</>
                    )}
                </p>
            </div>
        );
    }

    return null;
};

export default ActivarAvisos;
