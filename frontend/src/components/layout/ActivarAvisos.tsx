import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BellOff, BellRing, Smartphone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import {
    activarAvisos, actualizarArchivoAvisos, estadoServidor, leerEstado, pedidoAvisos, type PedidoAvisos,
} from '../../services/avisosCelular';

/**
 * Avisos de pendientes (Marcos 2026-10-27, decisión de don Luis): a quien está en el horario de recordatorios
 * (avisosPendientes.service.js) y abre Bóveda donde los avisos funcionan, se le pide activarlos **sin opción de
 * saltarlo**: una pantalla con un solo botón, cada vez que abra Bóveda, hasta activarlos.
 *   · En el celular: a todo el horario. Los recordatorios llegan SIEMPRE al celular.
 *   · En el computador: solo a quien trabaja casi siempre ahí (Paula, Matías, Daphne, Héctor Herrera y don Luis). Ahí
 *     el recordatorio aparece solo si no tiene Bóveda al frente (ya está mirando).
 *   · En el computador, a quien todavía no tiene los avisos en ningún celular, una franja fija le recuerda activarlos ahí.
 * El equipo siempre pregunta «¿Permitir notificaciones?» (eso no lo puede saltar ninguna app); si dice que no o los
 * apaga después, queda una franja fija arriba con los pasos. La app sigue funcionando: no se traba el trabajo.
 * Con «ver como», nada.
 *
 * EN PAUSA EN PRODUCCIÓN (Marcos 2026-10-27): a algunos trabajadores el botón no les hacía nada y la pantalla no los
 * dejaba seguir. Mientras se rediseña, la pantalla y las franjas solo salen en test (`VITE_ENTORNO=staging`, lo pone
 * deploy-cpanel-staging.yml). En producción sigue lo silencioso: actualizar el archivo de avisos y volver a mandar la
 * suscripción de quien ya los activó; los recordatorios le siguen llegando a quien ya los tiene activos.
 */

const PEDIR_AVISOS = import.meta.env.VITE_ENTORNO === 'staging';

const esCelular = () => typeof window !== 'undefined'
    && (!!window.matchMedia?.('(max-width: 767px)').matches || !!window.matchMedia?.('(pointer: coarse)').matches);

export const ActivarAvisos: React.FC = () => {
    const { isAuthenticated, verComo } = useAuth();
    const [pedido, setPedido] = useState<PedidoAvisos>('nada');
    const [activando, setActivando] = useState(false);
    const [celular] = useState(esCelular);
    const equipo = celular ? 'celular' : 'computador';

    useEffect(() => {
        if (!isAuthenticated || verComo) return undefined;
        let vivo = true;
        actualizarArchivoAvisos().catch(() => { /* lo revisa el navegador solo */ });
        (async () => {
            try {
                const [estado, servidor] = await Promise.all([leerEstado(), estadoServidor()]);
                const p = pedidoAvisos({
                    debeActivar: servidor.debeActivar, debeActivarComputador: servidor.debeActivarComputador,
                    esCelular: celular, mirando: false, estado,
                    celularesServidor: servidor.porEquipo.celular, computadoresServidor: servidor.porEquipo.computador,
                });
                if (!vivo) return;
                if (p === 'resincronizar') {
                    // Tiene el permiso y la suscripción en este equipo, pero el servidor no la tiene (reinstaló, otro
                    // entorno): se vuelve a mandar sin preguntar nada.
                    activarAvisos().catch(() => { /* lo intenta la próxima vez */ });
                    return;
                }
                if (PEDIR_AVISOS) setPedido(p);
            } catch { /* sin conexión: lo vuelve a revisar la próxima vez que abra Bóveda */ }
        })();
        return () => { vivo = false; };
    }, [isAuthenticated, verComo, celular]);

    const activar = async () => {
        setActivando(true);
        try {
            const e = await activarAvisos();
            if (e === 'activo') {
                setPedido('nada');
                toast.success(celular
                    ? 'Listo: le avisaremos en este celular cuando tenga algo pendiente.'
                    : 'Listo: le avisaremos en este computador cuando tenga algo pendiente y no esté mirando Bóveda.');
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
                    <h2 id="activar-avisos-titulo" className="mt-4 text-section font-semibold text-brand-dark">
                        Active los avisos de Bóveda{celular ? '' : ' en este computador'}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Le avisaremos en este {equipo} cuando tenga trabajo pendiente de su cargo, por ejemplo solicitudes por
                        aprobar o materiales por recibir, para que esté al día. Si está al día, no le llega nada.
                        {!celular && ' Si ya tiene Bóveda abierto al frente, aquí no le aparece.'}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                        {celular
                            ? 'Al tocar el botón, el celular le preguntará si permite las notificaciones: elija «Permitir».'
                            : 'Al hacer clic en el botón, el navegador le preguntará arriba, junto a la dirección, si permite las notificaciones: elija «Permitir».'}
                    </p>
                    <Button className="mt-5 h-12 w-full" onClick={activar} isLoading={activando} leftIcon={<BellRing className="h-5 w-5" />}>
                        Activar avisos
                    </Button>
                </div>
            </div>
        );
    }

    if (pedido === 'bloqueado' || pedido === 'iphone' || pedido === 'falta_celular') {
        return (
            <div role="status" className="flex items-start gap-2.5 bg-amber-100 px-4 py-2.5 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                {pedido === 'bloqueado' ? <BellOff aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /> : <Smartphone aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />}
                <p>
                    {pedido === 'bloqueado' && celular && (
                        <><strong>Los avisos de Bóveda están desactivados en este celular.</strong> Para activarlos: mantenga presionado el
                            ícono de Bóveda → «Información de la app» → Notificaciones → Permitir. Si usa Bóveda en Chrome: ⋮ →
                            Configuración → Configuración de sitios → Notificaciones → permitir este sitio.</>
                    )}
                    {pedido === 'bloqueado' && !celular && (
                        <><strong>Los avisos de Bóveda están bloqueados en este computador.</strong> Para permitirlos: haga clic en el ícono
                            que está a la izquierda de la dirección {window.location.host} (el candado o los ajustes) → Notificaciones →
                            Permitir, y vuelva a cargar la página.</>
                    )}
                    {pedido === 'iphone' && (
                        <><strong>Para recibir los avisos de Bóveda en el iPhone,</strong> agréguela a la pantalla de inicio (botón Compartir →
                            «Agregar a inicio») y ábrala desde ese ícono.</>
                    )}
                    {pedido === 'falta_celular' && (
                        <><strong>Falta activar los avisos en su celular:</strong> los recordatorios de pendientes le llegan siempre al
                            celular. Abra {window.location.host} en su celular, entre con su usuario y toque «Activar avisos».</>
                    )}
                </p>
            </div>
        );
    }

    return null;
};

export default ActivarAvisos;
