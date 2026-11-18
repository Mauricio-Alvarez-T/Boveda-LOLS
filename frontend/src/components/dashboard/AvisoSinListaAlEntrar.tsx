/**
 * Ventana al ENTRAR con las obras que no pasaron la lista en los últimos días hábiles (Marcos 2026-11-18: «que
 * cuando Daphne ingrese al otro día le aparezca un mensaje avisando»). Solo los últimos `RECIENTES` (5) hábiles: el
 * último mes completo se controla en el Inicio, y la ventana no repite todos los días algo de hace semanas. Una vez al día por persona (la marca guarda el
 * día de Chile que mandó el servidor), en cualquier pantalla. La ve RR.HH., que controla la asistencia: quien tiene
 * `asistencia.ver` y además `trabajadores.editar` o `documentos.laborales.emitir` (el mismo criterio de RR.HH. que los
 * avisos al celular). No sale en una sesión «Ver como» (es de solo lectura y marcaría como visto el día del otro).
 *
 * Si ya hay otra ventana abierta (documentos fuera de plazo al iniciar sesión, novedades…), espera a que se cierre
 * para no apilar dos.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ClipboardX } from 'lucide-react';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { claveVisto, cuando, cuandoDias, queEPaso, soloRecientes, textoUltima, type SinListaData } from './widgets/resumenSinLista';

const leer = (clave: string) => { try { return localStorage.getItem(clave); } catch { return null; } };
const guardar = (clave: string, valor: string) => { try { localStorage.setItem(clave, valor); } catch { /* sin marca: puede repetirse */ } };
/** Otra ventana de la app abierta (ui/Modal pinta su fondo con esta capa). */
const hayOtraVentana = () => !!document.querySelector('div.fixed.inset-0[class*="z-[1000]"]');
const mayuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export const AvisoSinListaAlEntrar: React.FC = () => {
    const { user, hasPermission, verComo } = useAuth();
    const navigate = useNavigate();
    const [datos, setDatos] = useState<SinListaData | null>(null);
    const [abierta, setAbierta] = useState(false);
    const puede = hasPermission('asistencia.ver')
        && (hasPermission('trabajadores.editar') || hasPermission('documentos.laborales.emitir'));

    useEffect(() => {
        if (!user || !puede || verComo) return;
        let vivo = true;
        api.get<{ data: SinListaData }>('/dashboard/asistencia/sin-lista')
            .then(res => {
                // Solo lo reciente: el último mes completo queda en el Inicio (ver `soloRecientes`).
                const d = res.data.data ? soloRecientes(res.data.data) : null;
                if (!vivo || !d?.obras?.length || leer(claveVisto(user.id)) === d.hoy) return;
                setDatos(d);
            })
            .catch(() => { /* sin la ventana; la tarjeta del Inicio sigue avisando */ });
        return () => { vivo = false; };
    }, [user, puede, verComo]);

    // Espera su turno: se abre cuando no hay otra ventana encima.
    useEffect(() => {
        if (!datos || abierta || !user) return;
        const intentar = () => {
            if (hayOtraVentana()) return false;
            guardar(claveVisto(user.id), datos.hoy);
            setAbierta(true);
            return true;
        };
        if (intentar()) return;
        const id = window.setInterval(() => { if (intentar()) window.clearInterval(id); }, 800);
        return () => window.clearInterval(id);
    }, [datos, abierta, user]);

    if (!datos || !abierta) return null;
    const cerrar = () => { setAbierta(false); setDatos(null); };
    const n = datos.obras.length;
    const una = n === 1 ? datos.obras[0] : null;

    return (
        <Modal isOpen onClose={cerrar} icon={ClipboardX} size="md"
            title={n === 1 ? 'Una obra no pasó la lista' : `${n} obras no pasaron la lista`}
            description={una
                ? `${mayuscula(cuandoDias(una.dias, datos.hoy))} no se guardó la asistencia de ${una.obra}`
                : `Días hábiles anteriores sin asistencia guardada (últimos ${datos.dias.length}, sin contar hoy)`}
            footer={(
                <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="ghost" onClick={cerrar}>Entendido</Button>
                    <Button rightIcon={<ArrowRight className="h-4 w-4" />}
                        onClick={() => { cerrar(); navigate('/', { state: { abrirInicio: 'asistencia' } }); }}>
                        Ver el detalle
                    </Button>
                </div>
            )}>
            <div className="space-y-3">
                <ul className="space-y-2.5">
                    {datos.obras.map(o => (
                        <li key={o.obra_id} className="rounded-2xl border border-red-200 bg-red-50/60 p-3 dark:border-red-800/60 dark:bg-red-500/5">
                            <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                                <span className="text-sm font-semibold text-foreground break-words">{o.obra}</span>
                                <span className="text-xs font-bold text-red-700 dark:text-red-300">
                                    {o.dias.length} {o.dias.length === 1 ? 'día sin lista' : 'días sin lista'}
                                </span>
                            </p>
                            <ul className="mt-1.5 space-y-0.5">
                                {o.dias.map(d => (
                                    <li key={d.fecha} className="text-xs text-muted-foreground">
                                        <span className="font-semibold text-foreground">{mayuscula(cuando(d.fecha, datos.hoy))}</span> · {queEPaso(d)}
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-1.5 text-xs text-muted-foreground">
                                {o.encargado ? `Encargado: ${o.encargado}. ` : ''}{textoUltima(o, datos.hoy)}
                            </p>
                        </li>
                    ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                    Esta ventana sale una vez al día. En el Inicio, la tarjeta de Asistencia muestra el último mes completo.
                </p>
            </div>
        </Modal>
    );
};

export default AvisoSinListaAlEntrar;
