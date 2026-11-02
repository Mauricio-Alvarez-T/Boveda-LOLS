import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BellOff, BellRing, Check, Clock, Smartphone, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { cn } from '../../utils/cn';
import {
    FalloActivar, activarAvisos, actualizarArchivoAvisos, cerrarFranjaHoy, estadoServidor, franjaCerradaHoy, leerEstado,
    motivoFalloActivar, pedidoAvisos, HORA_POR_DEFECTO, type PedidoAvisos,
} from '../../services/avisosCelular';

/**
 * Franja «Active los avisos de sus pendientes» (Marcos 2026-11-02, opción B del lienzo; reemplaza la pantalla
 * obligatoria del 27-10, que quedó en pausa en producción porque a algunos el botón no les hacía nada y no los dejaba
 * seguir). A quien está en el horario de recordatorios (avisosPendientes.service.js) y abre Bóveda donde los avisos
 * funcionan, arriba, encima del encabezado (como la de «Entorno de pruebas»), en test Y en producción:
 *   · Dice de qué le avisaremos: los temas de SU cargo, lo mismo que ve en su Inicio (`temas` del servidor), y a qué
 *     hora (una vez al día, de lunes a viernes; la hora la cambia el Super Administrador en Soporte).
 *   · «Activar avisos» → el equipo pregunta «¿Permitir?» (eso no lo salta ninguna app) → franja verde «Listo» y se va.
 *   · La X la cierra hasta el día siguiente (en ese equipo); vuelve cada día hasta que los active.
 *   · En el celular, a todo el horario. En el computador, solo a quien trabaja casi siempre ahí (Paula, Matías,
 *     Daphne, Héctor Herrera y don Luis); a los demás, en el computador, si aún no los tienen en ningún celular, una
 *     franja les recuerda activarlos en el celular.
 *   · Si dijo que no (bloqueados) o es un iPhone sin Bóveda en la pantalla de inicio, la franja dice los pasos.
 * Nada traba el trabajo. Con «ver como», nada. En test también le sale al Super Administrador, para practicarla.
 */

const PRACTICA_EN_TEST = import.meta.env.VITE_ENTORNO === 'staging';
/** Lo que dura la franja verde «Listo» antes de recogerse. */
const LISTO_MS = 2_600;
/** Lo que tarda en recogerse (igual que `duration-500`). */
const RECOGER_MS = 500;

const esCelular = () => typeof window !== 'undefined'
    && (!!window.matchMedia?.('(max-width: 767px)').matches || !!window.matchMedia?.('(pointer: coarse)').matches);

const BotonCerrar: React.FC<{ onClick: () => void; className?: string }> = ({ onClick, className }) => (
    <IconButton aria-label="Cerrar hasta mañana" onClick={onClick} size="lg" icon={<X className="h-5 w-5" />}
        className={cn('absolute right-1 text-amber-950 hover:bg-amber-950/10 hover:text-amber-950 dark:hover:bg-amber-950/10', className)} />
);

export const ActivarAvisos: React.FC = () => {
    const { isAuthenticated, verComo, user } = useAuth();
    const [pedido, setPedido] = useState<PedidoAvisos>('nada');
    const [temas, setTemas] = useState<string[]>([]);
    const [hora, setHora] = useState(HORA_POR_DEFECTO);
    const [abierta, setAbierta] = useState(false);
    const [listo, setListo] = useState(false);
    const [activando, setActivando] = useState(false);
    const [falla, setFalla] = useState<{ texto: string; detalle?: string } | null>(null);
    const [celular] = useState(esCelular);
    const relojes = useRef<number[]>([]);
    const equipo = celular ? 'celular' : 'computador';
    const usuarioId = user?.id;
    const practica = PRACTICA_EN_TEST && user?.rol_id != null && Number(user.rol_id) === 1;

    useEffect(() => () => { relojes.current.forEach(window.clearTimeout); }, []);
    const luego = (ms: number, fn: () => void) => { relojes.current.push(window.setTimeout(fn, ms)); };

    useEffect(() => {
        if (!isAuthenticated || verComo || usuarioId == null) return undefined;
        let vivo = true;
        actualizarArchivoAvisos().catch(() => { /* lo revisa el navegador solo */ });
        (async () => {
            try {
                const [estado, servidor] = await Promise.all([leerEstado(), estadoServidor()]);
                const p = pedidoAvisos({
                    debeActivar: servidor.debeActivar || practica,
                    debeActivarComputador: servidor.debeActivarComputador || practica,
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
                if (p === 'nada' || franjaCerradaHoy(usuarioId)) return;
                setTemas(servidor.temas);
                setHora(servidor.hora);
                setPedido(p);
            } catch { /* sin conexión: lo vuelve a revisar la próxima vez que abra Bóveda */ }
        })();
        return () => { vivo = false; };
    }, [isAuthenticated, verComo, usuarioId, celular, practica]);

    // Entra deslizándose: se monta recogida y se abre en el cuadro siguiente.
    useEffect(() => {
        if (pedido === 'nada') return undefined;
        const id = window.requestAnimationFrame(() => setAbierta(true));
        return () => window.cancelAnimationFrame(id);
    }, [pedido]);

    const recoger = () => {
        setAbierta(false);
        luego(RECOGER_MS, () => { setPedido('nada'); setListo(false); });
    };

    const cerrar = () => {
        if (usuarioId != null) cerrarFranjaHoy(usuarioId);
        recoger();
        toast('Se lo recordaremos mañana.');
    };

    const activar = async () => {
        setActivando(true);
        setFalla(null);
        try {
            const e = await activarAvisos();
            if (e === 'activo') {
                setListo(true);
                luego(LISTO_MS, recoger);
            } else if (e === 'bloqueado') {
                setPedido('bloqueado');
            } else {
                // Cerró la pregunta sin elegir, o el equipo no la mostró.
                setFalla({
                    texto: celular
                        ? 'No eligió una opción: la pregunta se cerró o el celular no la mostró. Toque «Activar avisos» otra vez y elija «Permitir».'
                        : 'No eligió una opción: la pregunta se cerró o el navegador no la mostró. Haga clic en «Activar avisos» otra vez y elija «Permitir» arriba, junto a la dirección.',
                });
            }
        } catch (err) {
            const motivo = err instanceof FalloActivar ? motivoFalloActivar(err.paso, equipo) : 'algo falló en este equipo';
            setFalla({
                texto: `No se pudieron activar: ${motivo}. Puede intentar de nuevo o cerrar esto con la X; se lo volveremos a pedir mañana.`,
                detalle: String(err instanceof Error ? err.message : err).slice(0, 200),
            });
        } finally {
            setActivando(false);
        }
    };

    if (pedido === 'nada' || pedido === 'resincronizar') return null;

    const chips = [
        ...(temas.length ? temas : ['Lo pendiente de su cargo']).map(texto => ({ texto, reloj: false })),
        { texto: `A las ${hora}:00, de lunes a viernes`, reloj: true },
    ];

    let contenido: React.ReactNode;
    if (listo) {
        contenido = (
            <div role="status" className="flex items-center justify-center gap-2.5 bg-green-700 px-4 py-3 text-sm font-semibold text-white">
                <Check aria-hidden className="h-5 w-5 shrink-0" />
                <span>
                    {celular
                        ? 'Listo: le avisaremos en este celular cuando tenga algo pendiente.'
                        : 'Listo: le avisaremos en este computador cuando tenga algo pendiente y no esté mirando Bóveda.'}
                </span>
            </div>
        );
    } else if (pedido === 'activar') {
        contenido = (
            <section aria-label="Active los avisos de sus pendientes" className="relative bg-amber-500 text-amber-950">
                <div className="flex flex-col gap-2.5 py-3 pl-4 pr-4 md:flex-row md:items-center md:gap-3.5 md:pr-16">
                    <div className="flex items-center gap-3 pr-10 md:contents">
                        <span aria-hidden className="franja-pulso relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-950 text-amber-400">
                            <BellRing className="franja-mece h-4.5 w-4.5" />
                        </span>
                        <p className="text-sm font-bold md:hidden">Active los avisos de sus pendientes</p>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="text-xs font-medium md:text-sm md:font-bold">
                            <span className="md:hidden">Le</span>
                            <span className="hidden md:inline">Active los avisos de sus pendientes · le</span>
                            {' '}avisaremos de lo mismo que ve en su Inicio:
                        </p>
                        <ul className="flex flex-wrap gap-1.5">
                            {chips.map((c, i) => (
                                <li key={c.texto} className="franja-chip inline-flex h-6 items-center gap-1.5 rounded-full bg-amber-950/10 px-2.5 text-xs font-semibold"
                                    style={{ animationDelay: `${(0.3 + i * 0.35).toFixed(2)}s, ${(1.4 + i * 0.4).toFixed(2)}s` }}>
                                    {c.reloj && <Clock aria-hidden className="h-3 w-3" />}
                                    {c.texto}
                                </li>
                            ))}
                        </ul>
                        {falla && (
                            <p role="alert" className="text-xs font-medium">
                                {falla.texto}
                                {falla.detalle && <span className="block break-words opacity-80">Detalle para soporte: {falla.detalle}</span>}
                            </p>
                        )}
                    </div>
                    <Button onClick={activar} isLoading={activando} leftIcon={<BellRing aria-hidden className="h-4 w-4" />}
                        className="h-11 w-full shrink-0 text-sm font-bold md:h-9 md:w-auto">
                        Activar avisos
                    </Button>
                </div>
                <BotonCerrar onClick={cerrar} className="top-1.5 md:top-1/2 md:-translate-y-1/2" />
            </section>
        );
    } else {
        const Icono = pedido === 'bloqueado' ? BellOff : Smartphone;
        contenido = (
            <div role="status" className="relative flex items-start gap-2.5 bg-amber-500 py-2.5 pl-4 pr-14 text-xs text-amber-950 md:items-center md:text-sm">
                <Icono aria-hidden className="mt-0.5 h-4 w-4 shrink-0 md:mt-0" />
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
                <BotonCerrar onClick={cerrar} className="top-0 md:top-1/2 md:-translate-y-1/2" />
            </div>
        );
    }

    // Se abre y se recoge deslizándose (alto 0 ↔ el suyo); con «reducir movimiento», en seco.
    return (
        <div className={cn('grid shrink-0 transition-[grid-template-rows] duration-500 ease-out motion-reduce:transition-none',
            abierta ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
            <div className="min-h-0 overflow-hidden">{contenido}</div>
        </div>
    );
};

export default ActivarAvisos;
