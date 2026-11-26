/**
 * Campana «Importante» junto al nombre (Marcos 2026-11-18, opción A del lienzo: «que le llegue a su perfil importante
 * si alguien se olvidó de pasar lista»). La ve quien puede marcar días pasados (`asistencia.dias_pasados`, RR.HH.):
 * solo aparece si alguna obra no pasó la lista en el último mes, roja y con el número de obras. Al abrirla, cada obra
 * con sus días, el encargado, «Pasar la lista» (Asistencia en esa obra y el día más reciente) y «Pedir la lista» por
 * WhatsApp. Se queda hasta que la lista se guarde: vuelve a preguntar al cambiar de pantalla, al guardar la
 * asistencia y cada 5 minutos. No sale en «Ver como».
 *
 * También avisa las obras «En preparación» que ya tienen trabajadores (Marcos 2026-11-20, mig 156: «que a Daphne
 * también le llegue un mensaje de advertencia sobre una obra que está en preparación»), en ámbar: «Ya empezó…» abre
 * las tres opciones de asistencia de la obra (para poner desde qué día pasa lista) y «Preguntarle» por WhatsApp.
 *
 * Super Administrador (Marcos y Mauricio, por control; 2026-11-26: «no tiene que quedarse a vivir el número»): al abrirla
 * el número rojo se va y la campana queda gris; vuelve roja solo con un aviso nuevo (`campanaVistos`).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, ClipboardX, HardHat } from 'lucide-react';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useCierreExterno } from '../../hooks/useCierreExterno';
import { EVENTO_ASISTENCIA_GUARDADA, usePasarLista } from '../../hooks/usePasarLista';
import { PERMISO_DIAS_PASADOS } from '../../utils/fechaChile';
import { shareViaWhatsApp } from '../../utils/whatsappShare';
import { cn } from '../../utils/cn';
import WhatsAppIcon from '../ui/WhatsAppIcon';
import { mensajeSinLista } from '../dashboard/widgets/mensajesWhatsApp';
import {
    cuando, cuandoDias, mensajePreguntarPreparacion, queEPaso, trabajadores,
    type EnPreparacionData, type ObraEnPreparacion, type SinListaData,
} from '../dashboard/widgets/resumenSinLista';
import { Modal } from '../ui/Modal';
import { PanelAsistenciaObra } from '../settings/EditorAsistenciaObra';
import { hoyChile } from '../../utils/fechaChile';
import { claveVistos, clavesAvisos, contarNuevos, guardarVistos, leerVistos } from './campanaVistos';

const CADA_MS = 5 * 60 * 1000;
const mayuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export const CampanaImportante: React.FC = () => {
    const { user, hasPermission, verComo } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const pasarLista = usePasarLista();
    const [datos, setDatos] = useState<SinListaData | null>(null);
    const [prep, setPrep] = useState<EnPreparacionData | null>(null);
    /** Obra en preparación a la que se le está poniendo desde qué día pasa lista («Ya empezó…»). */
    const [yaEmpezo, setYaEmpezo] = useState<ObraEnPreparacion | null>(null);
    const [abierta, setAbierta] = useState(false);
    const ref = useCierreExterno({ abierto: abierta, alCerrar: () => setAbierta(false), escape: true, tactil: true });
    const puede = !!user && !verComo && hasPermission(PERMISO_DIAS_PASADOS);
    // Super Administrador: lo ve por control; el número no se le queda (ver arriba).
    const soloControl = user?.rol_id === 1;
    const [vistos, setVistos] = useState<string[] | null>(null);

    const preguntar = useCallback(() => {
        if (!puede) return;
        api.get<{ data: SinListaData }>('/dashboard/asistencia/sin-lista')
            .then(res => setDatos(res.data.data ?? null))
            .catch(() => { /* se queda con lo último que supo */ });
        api.get<{ data: EnPreparacionData }>('/dashboard/asistencia/en-preparacion')
            .then(res => setPrep(res.data.data ?? null))
            .catch(() => { /* idem */ });
    }, [puede]);

    // Al entrar, al cambiar de pantalla y cada 5 minutos.
    useEffect(() => {
        preguntar();
        if (!puede) return;
        const id = window.setInterval(preguntar, CADA_MS);
        return () => window.clearInterval(id);
    }, [preguntar, puede, location.pathname]);

    // Al guardar una asistencia (la obra puede dejar de faltar).
    useEffect(() => {
        if (!puede) return;
        window.addEventListener(EVENTO_ASISTENCIA_GUARDADA, preguntar);
        return () => window.removeEventListener(EVENTO_ASISTENCIA_GUARDADA, preguntar);
    }, [preguntar, puede]);

    const obras = puede ? (datos?.obras ?? []) : [];
    const enPrep = puede ? (prep?.obras ?? []) : [];
    const n = obras.length + enPrep.length;
    // La ventana de «Ya empezó…» se queda abierta aunque la campana se cierre (o se vaya al guardar).
    const ventana = yaEmpezo && (
        <Modal isOpen onClose={() => setYaEmpezo(null)} title={`Asistencia · ${yaEmpezo.obra}`} size="sm"
            description="Ponga desde qué día pasa lista: desde ahí avisa si un día queda sin lista.">
            <PanelAsistenciaObra sinTitulo obraId={yaEmpezo.obra_id} obraNombre={yaEmpezo.obra}
                inicial={{ estado: 'desde', fecha: prep?.hoy ?? hoyChile() }} onCerrar={() => setYaEmpezo(null)} />
        </Modal>
    );
    if (n === 0) return ventana || null;
    const hoy = datos?.hoy ?? prep?.hoy ?? hoyChile();
    const claves = clavesAvisos(puede ? datos : null, puede ? prep : null);
    const llave = user ? claveVistos(user.id) : '';
    const nuevos = soloControl ? contarNuevos(claves, vistos ?? leerVistos(llave)) : n;
    const alAbrir = () => {
        if (!abierta && soloControl) { guardarVistos(llave, claves); setVistos(claves); }
        setAbierta(v => !v);
    };
    const textoN = [
        obras.length ? (obras.length === 1 ? 'una obra no pasó la lista' : `${obras.length} obras no pasaron la lista`) : '',
        enPrep.length ? (enPrep.length === 1 ? 'una obra sigue en preparación con trabajadores' : `${enPrep.length} obras siguen en preparación con trabajadores`) : '',
    ].filter(Boolean).join(' y ');

    return (
        <div className="relative shrink-0" ref={ref}>
            {/* eslint-disable-next-line no-restricted-syntax -- campana del encabezado (círculo con número) */}
            <button type="button" onClick={alAbrir} aria-expanded={abierta} aria-haspopup="true"
                aria-label={`Importante: ${textoN}${nuevos === 0 ? ' (ya visto)' : ''}`}
                title={nuevos === 0 ? 'Importante (ya lo vio)' : 'Importante'}
                className={cn('relative flex h-10 w-10 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                    nuevos > 0
                        ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted')}>
                <Bell className="h-5 w-5" aria-hidden />
                {nuevos > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card bg-red-600 px-1 text-label font-bold text-white tabular-nums" aria-hidden>
                        {nuevos}
                    </span>
                )}
            </button>

            {abierta && (
                <section aria-label="Importante"
                    className="absolute right-0 top-full z-[60] mt-2 w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border bg-popover text-foreground shadow-[var(--shadow-lg)]">
                    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                        <h2 className="text-sm font-bold">Importante</h2>
                        <span className="rounded-full bg-red-600 px-2 py-0.5 text-label font-bold text-white tabular-nums">{n}</span>
                    </div>
                    <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
                        {obras.map(o => (
                            <li key={o.obra_id} className="space-y-3 px-4 py-3">
                                <div className="flex gap-3">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" aria-hidden>
                                        <ClipboardX className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0 space-y-0.5">
                                        <p className="truncate text-sm font-semibold">{o.obra} no pasó la lista</p>
                                        <p className="text-xs text-foreground/80">
                                            {mayuscula(cuandoDias(o.dias, hoy))}
                                            {o.dias.length > 2 ? ` · el último, ${cuando(o.dias[0].fecha, hoy)}` : ''}
                                            {o.dias.length === 1 ? ` · ${queEPaso(o.dias[0]).toLowerCase()}` : ''}
                                        </p>
                                        {o.encargado && <p className="truncate text-xs text-muted-foreground">Encargado: {o.encargado}</p>}
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {/* eslint-disable-next-line no-restricted-syntax -- acción de la fila del panel */}
                                    <button type="button" onClick={() => { setAbierta(false); pasarLista(o, o.dias[0].fecha); }}
                                        className="inline-flex min-h-9 flex-1 basis-32 items-center justify-center gap-1.5 rounded-full bg-brand-primary px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 focus-visible:ring-offset-1">
                                        Pasar la lista <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                    {/* eslint-disable-next-line no-restricted-syntax -- acción secundaria de la fila del panel */}
                                    <button type="button" onClick={() => { void shareViaWhatsApp(mensajeSinLista(o.obra, [...o.dias].reverse().map(d => d.fecha))); }}
                                        className="inline-flex min-h-9 flex-1 basis-32 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                                        <WhatsAppIcon className="h-3.5 w-3.5 shrink-0 text-green-700 dark:text-green-300" /> Pedir la lista
                                    </button>
                                </div>
                            </li>
                        ))}
                        {enPrep.map(o => (
                            <li key={`prep-${o.obra_id}`} className="space-y-3 px-4 py-3">
                                <div className="flex gap-3">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" aria-hidden>
                                        <HardHat className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0 space-y-0.5">
                                        <p className="text-sm font-semibold">{o.obra} sigue en preparación</p>
                                        <p className="text-xs text-foreground/80">Tiene {trabajadores(o.dotacion)} y nadie ha pasado la lista todavía</p>
                                        {o.encargado && <p className="truncate text-xs text-muted-foreground">Encargado: {o.encargado}</p>}
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {/* eslint-disable-next-line no-restricted-syntax -- acción de la fila del panel */}
                                    <button type="button" onClick={() => { setAbierta(false); setYaEmpezo(o); }}
                                        className="inline-flex min-h-9 flex-1 basis-32 items-center justify-center gap-1.5 rounded-full bg-brand-primary px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 focus-visible:ring-offset-1">
                                        Ya empezó… <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                    {/* eslint-disable-next-line no-restricted-syntax -- acción secundaria de la fila del panel */}
                                    <button type="button" onClick={() => { void shareViaWhatsApp(mensajePreguntarPreparacion(o.obra)); }}
                                        className="inline-flex min-h-9 flex-1 basis-32 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                                        <WhatsAppIcon className="h-3.5 w-3.5 shrink-0 text-green-700 dark:text-green-300" /> Preguntarle
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/50 px-4 py-2.5">
                        <p className="text-xs text-muted-foreground">Se queda aquí hasta que la lista se guarde.</p>
                        {/* eslint-disable-next-line no-restricted-syntax -- enlace del pie del panel */}
                        <button type="button" onClick={() => { setAbierta(false); navigate('/', { state: { abrirInicio: 'asistencia' } }); }}
                            className={cn('rounded-md text-xs font-semibold text-green-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 dark:text-green-300')}>
                            Ver el detalle
                        </button>
                    </div>
                </section>
            )}
            {ventana}
        </div>
    );
};

export default CampanaImportante;
