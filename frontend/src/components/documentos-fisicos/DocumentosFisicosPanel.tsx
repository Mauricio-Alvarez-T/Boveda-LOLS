/**
 * Pestaña "Documentos físicos" de Gestiones (plan Gestiones B6; rediseño 2026-09-15): TABLERO DE CUSTODIA.
 * La cadena tiene tres etapas y el tablero las muestra como tres carriles en el orden del flujo:
 * Por confirmar (RRHH armó, el portador aún no retiró) → En terreno (firmándose) → Cerrados.
 * Cada lote es una tarjeta con el portador al frente, cuántos documentos lleva, qué pasó y hace cuánto,
 * y la acción que le toca a quien mira (portador: «Confirmar retiro»; RRHH: «Registrar recepción»).
 * RRHH ve además cuántos documentos impresos esperan lote (CTA «Nuevo lote») y la franja de alertas (B7).
 * RRHH (documentos.entrega.registrar) ve todos los lotes; el portador (documentos.entrega.portar) solo los suyos.
 * En móvil los carriles se muestran de a uno con un selector; en desktop los tres a la vez.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Truck, PackageOpen, RefreshCw, ChevronRight, PackageCheck, ClipboardCheck, Printer, FileText, AlertTriangle, Plus } from 'lucide-react';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLotesPendientes } from '../../hooks/useLotesPendientes';
import { showApiError } from '../../utils/toastUtils';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { EmptyState } from '../ui/EmptyState';
import { PestanasElasticas } from '../ui/PestanasElasticas';
import { NuevoLoteModal } from './NuevoLoteModal';
import { LoteDetalleModal } from './LoteDetalleModal';
import { AlertasDocumentosStrip } from './AlertasDocumentosStrip';
import { useDocumentosAlertas } from '../../hooks/useDocumentosAlertas';
import {
    LOTE_ESTADO_LABEL, LOTE_ESTADO_TITULO, LOTE_ESTADO_VACIO, LOTE_ESTADOS, agruparLotesPorEstado, resumenLote, accionesLote, inicialesNombre, lineaTiempoLote,
    desenlaceLote, DESENLACE_LABEL,
    segmentosTenencia, tonoTenencia, textoTenencia,
    type LoteEstado, type LoteResumen, type DocumentoDisponible, type TenenciaLote,
} from './documentosFisicos';

/**
 * Dónde están los papeles y quién los tiene, contado para quien mira (RRHH o el portador).
 * Rediseño de lenguaje 2026-09-16: los rótulos nombran el LUGAR, no el trámite (ver documentosFisicos.ts).
 */
const CARRIL_HINT: Record<LoteEstado, { rrhh: string; portador: string }> = {
    pendiente_retiro: {
        rrhh: 'Ya impresos y apartados para un portador; esperan a que pase a buscarlos',
        portador: 'Están en oficina a tu nombre: confirma cuando los retires',
    },
    en_terreno: {
        rrhh: 'Los tiene el portador; se están firmando en obra',
        portador: 'Los llevas tú; devuélvelos firmados a RRHH',
    },
    cerrado: {
        rrhh: 'Lo que volvió firmado quedó en la ficha; lo que volvió sin firma está listo para salir de nuevo',
        portador: 'Ya los devolviste',
    },
};

/** `sobreVerde`: el conteo dentro del indicador verde de las pestañas del celular. */
const CARRIL_ESTILO: Record<LoteEstado, { punto: string; conteo: string; sobreVerde: string }> = {
    pendiente_retiro: { punto: 'bg-amber-500', conteo: 'bg-amber-500 text-white', sobreVerde: 'bg-white text-amber-700' },
    en_terreno: { punto: 'bg-blue-500', conteo: 'bg-blue-500 text-white', sobreVerde: 'bg-white text-blue-700' },
    cerrado: { punto: 'bg-muted-foreground/50', conteo: 'bg-border text-muted-foreground', sobreVerde: 'bg-white/25 text-white' },
};

/** Carriles como opciones de `PestanasElasticas`. */
const OPCIONES_CARRIL = LOTE_ESTADOS.map(e => ({ key: e }));

const CERRADOS_VISIBLES = 12;

/**
 * Tenencia en terreno (jefatura 2026-10-21): barra de 4 tramos, uno por día hábil permitido, como la de
 * «Asistencia guardada» del Inicio. Verde dentro del plazo, ámbar el último día, rojo pasado el plazo.
 */
const TONO_TENENCIA = {
    ok: { relleno: 'bg-green-700 dark:bg-green-400', cifra: 'text-foreground', detalle: 'text-muted-foreground' },
    ultimo: { relleno: 'bg-amber-500', cifra: 'text-amber-800 dark:text-amber-300', detalle: 'text-amber-800 dark:text-amber-300' },
    atrasado: { relleno: 'bg-red-600 dark:bg-red-500', cifra: 'text-red-700 dark:text-red-300', detalle: 'text-red-700 dark:text-red-300' },
} as const;

const BarraTenencia: React.FC<{ t: TenenciaLote }> = ({ t }) => {
    const tono = TONO_TENENCIA[tonoTenencia(t)];
    const { cifra, detalle } = textoTenencia(t);
    return (
        <span className="mt-2.5 block rounded-xl bg-muted/60 px-3 py-2.5">
            <span className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-xs text-muted-foreground">Tenencia en terreno</span>
                <span className={cn('text-sm font-semibold tabular-nums', tono.cifra)}>{cifra}</span>
            </span>
            <span className="flex gap-[3px]" aria-hidden>
                {segmentosTenencia(t).map((lleno, i) => (
                    <span key={i} className={cn('h-2 flex-1 rounded-[3px]', lleno ? tono.relleno : 'bg-border')} />
                ))}
            </span>
            <span className={cn('mt-1.5 block text-xs font-medium', tono.detalle)}>{detalle}</span>
        </span>
    );
};

export const DocumentosFisicosPanel: React.FC = () => {
    const { user, hasPermission } = useAuth();
    const puedeRegistrar = hasPermission('documentos.entrega.registrar');
    const puedePortar = hasPermission('documentos.entrega.portar');
    const { refetch: refetchPendientes } = useLotesPendientes();
    const { refetch: refetchAlertas } = useDocumentosAlertas();

    const [lotes, setLotes] = useState<LoteResumen[]>([]);
    const [disponibles, setDisponibles] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [nuevo, setNuevo] = useState(false);
    const [abierto, setAbierto] = useState<number | null>(null);
    const [carrilMovil, setCarrilMovil] = useState<LoteEstado>('pendiente_retiro');
    const [verTodosCerrados, setVerTodosCerrados] = useState(false);
    const seq = useRef(0);
    // Primer carril con contenido para quien entra desde el celular (el portador quiere ver lo que debe
    // confirmar). Se elige DENTRO de la primera carga, en el mismo render que los lotes, y las pestañas
    // se remontan con `carrilListo`: así el indicador aparece quieto en ese carril en vez de viajar
    // solo, sin que nadie toque nada (diseno.md §9.12).
    const carrilInicial = useRef(false);
    const [carrilListo, setCarrilListo] = useState(false);

    const cargar = useCallback(async (silencioso = false) => {
        const mio = ++seq.current;
        if (!silencioso) setLoading(true);
        try {
            const [resLotes, resDisp] = await Promise.all([
                api.get<{ data: LoteResumen[] }>('/documentos-lotes'),
                puedeRegistrar ? api.get<{ data: DocumentoDisponible[] }>('/documentos-lotes/disponibles') : Promise.resolve(null),
            ]);
            if (mio !== seq.current) return;
            const datos = resLotes.data.data || [];
            setLotes(datos);
            if (!carrilInicial.current) {
                carrilInicial.current = true; // solo la primera carga: después manda lo que elija la persona
                const grupos = agruparLotesPorEstado(datos);
                const primero = LOTE_ESTADOS.find(e => grupos[e].length > 0);
                if (primero) setCarrilMovil(primero);
                setCarrilListo(true);
            }
            if (resDisp) setDisponibles((resDisp.data.data || []).length);
        } catch (err) {
            if (mio !== seq.current) return;
            showApiError(err, 'No se pudieron cargar los lotes');
        } finally {
            if (mio === seq.current) setLoading(false);
        }
    }, [puedeRegistrar]);

    useEffect(() => { cargar(); }, [cargar]);

    const cambio = () => { cargar(true); refetchPendientes(); refetchAlertas(); };
    const cerrarDetalle = useCallback(() => setAbierto(null), []);
    const quien = useMemo(() => ({ id: user?.id, puedeRegistrar, puedePortar }), [user?.id, puedeRegistrar, puedePortar]);
    const carriles = useMemo(() => agruparLotesPorEstado(lotes), [lotes]);
    const rol: 'rrhh' | 'portador' = puedeRegistrar ? 'rrhh' : 'portador';

    const botonNuevo = puedeRegistrar
        ? <Button size="sm" leftIcon={<PackageOpen className="h-4 w-4" />} onClick={() => setNuevo(true)} className="shrink-0">Nuevo lote</Button>
        : null;
    // En la franja de la cabecera: «+ Lote» en el teléfono (cabe junto al texto), «Nuevo lote» desde lg.
    const botonNuevoFranja = puedeRegistrar
        ? <Button size="sm" leftIcon={<Plus className="h-4 w-4 lg:hidden" />} onClick={() => setNuevo(true)} aria-label="Nuevo lote" className="shrink-0">
            <span className="lg:hidden">Lote</span><span className="hidden lg:inline-flex lg:items-center lg:gap-1.5"><PackageOpen className="h-4 w-4" />Nuevo lote</span>
        </Button>
        : null;

    const renderLote = (l: LoteResumen) => {
        const acc = accionesLote(l, quien);
        const cta = acc.confirmarRetiro ? { texto: 'Confirmar retiro', icon: PackageCheck }
            : acc.recepcion ? { texto: 'Registrar lo que volvió', icon: ClipboardCheck }
                : null;
        return (
            /* eslint-disable-next-line no-restricted-syntax -- tarjeta completa clickeable (abre el detalle del lote) */
            <button key={l.id} type="button" onClick={() => setAbierto(l.id)}
                className={cn('w-full text-left rounded-2xl border bg-card p-3 lg:p-3.5 shadow-sm transition-all duration-200',
                    'hover:border-brand-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                    acc.confirmarRetiro ? 'border-amber-300 dark:border-amber-700/70' : 'border-border')}>
                <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 lg:h-10 lg:w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary text-section font-bold">
                        {inicialesNombre(l.portador_nombre) || '?'}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-ui font-bold text-brand-dark leading-tight break-words">{l.portador_nombre || '(usuario eliminado)'}</p>
                        <p className="text-caption text-muted-foreground">Lote #{l.id} · {lineaTiempoLote(l)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                        <p className="text-title-sm font-bold tabular-nums leading-none text-brand-dark">{l.total}</p>
                        <p className="text-micro font-semibold uppercase tracking-wider text-muted-foreground">doc{l.total === 1 ? '' : 's'}</p>
                    </div>
                </div>
                {/* Ningún texto del apartado se corta con «…» (dueño 2026-10-21): en el teléfono parten línea. */}
                <p className="mt-2.5 flex items-start gap-1.5 text-caption text-muted-foreground">
                    <FileText className="mt-px h-3.5 w-3.5 shrink-0" /><span className="min-w-0 break-words">{resumenLote(l)}</span>
                </p>
                {l.observacion && <p className="mt-1 text-caption text-muted-foreground italic break-words">“{l.observacion}”</p>}
                {l.tenencia && <BarraTenencia t={l.tenencia} />}
                {/* El carril se llama «Firmados en oficina» porque es lo que pasa casi siempre; cuando un
                    lote terminó de otra forma, lo dice acá, en el lote concreto. */}
                {(() => {
                    const fin = desenlaceLote(l);
                    return fin === 'sin_firmas' || fin === 'no_retirado'
                        ? <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-caption font-semibold text-amber-700 dark:border-amber-700/70 dark:bg-amber-500/10 dark:text-amber-300">
                            <AlertTriangle className="h-3 w-3 shrink-0" />{DESENLACE_LABEL[fin]}
                        </span>
                        : null;
                })()}
                {cta ? (
                    <span className={cn('mt-2.5 inline-flex h-9 w-full items-center justify-center gap-2 rounded-full px-4 text-section font-semibold shadow-sm',
                        acc.confirmarRetiro ? 'bg-amber-500 text-white' : 'bg-brand-primary text-white')}>
                        <cta.icon className="h-4 w-4" /> {cta.texto}
                    </span>
                ) : (
                    <span className="mt-2.5 flex items-center justify-end gap-1 text-caption font-semibold text-muted-foreground">
                        Ver detalle <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                )}
            </button>
        );
    };

    const renderCarril = (estado: LoteEstado) => {
        const todos = carriles[estado];
        const items = estado === 'cerrado' && !verTodosCerrados ? todos.slice(0, CERRADOS_VISIBLES) : todos;
        const est = CARRIL_ESTILO[estado];
        return (
            <section key={estado} aria-label={LOTE_ESTADO_TITULO[estado]}
                className={cn('min-h-0 flex-col lg:rounded-2xl lg:bg-muted/60 lg:border lg:border-border/60', carrilMovil === estado ? 'flex' : 'hidden lg:flex')}>
                {/* En el teléfono (propuesta A, dueño 2026-10-21) las pestañas ya nombran el carril: sin título
                    ni caja, solo la frase de qué significa. */}
                <header className="shrink-0 px-1 pb-2 lg:px-3.5 lg:pt-3">
                    <div className="hidden lg:flex items-center gap-2">
                        <span className={cn('h-2.5 w-2.5 rounded-full', est.punto)} />
                        <h3 className="text-section font-bold text-brand-dark">{LOTE_ESTADO_TITULO[estado]}</h3>
                        <span className={cn('ml-auto flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full text-micro font-bold tabular-nums', est.conteo)}>{todos.length}</span>
                    </div>
                    <p className="mt-0.5 text-caption text-muted-foreground">{CARRIL_HINT[estado][rol]}</p>
                </header>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar lg:px-2.5 pb-2.5 space-y-2">
                    {todos.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-caption text-muted-foreground">{LOTE_ESTADO_VACIO[estado]}</p>
                    ) : items.map(renderLote)}
                    {estado === 'cerrado' && todos.length > CERRADOS_VISIBLES && (
                        <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setVerTodosCerrados(v => !v)}>
                            {verTodosCerrados ? 'Mostrar menos' : `Mostrar los ${todos.length - CERRADOS_VISIBLES} anteriores`}
                        </Button>
                    )}
                </div>
            </section>
        );
    };

    return (
        <div className="flex-1 min-h-0 flex flex-col bg-card border border-border rounded-3xl shadow-[var(--shadow-md)] overflow-hidden relative">
            {/* Cabecera: impresos sin lote (RRHH) + acciones; en móvil, selector de carril */}
            {/* Cabecera en UNA franja (propuesta A, dueño 2026-10-21): ícono · qué hay · recargar · + Lote. En el
                teléfono el texto es corto para que todo quepa en una fila; desde lg vuelve el texto largo. */}
            <div className="border-b border-border px-3 sm:px-4 py-2.5 lg:py-3 flex flex-wrap items-center gap-x-2.5 gap-y-2 shrink-0">
                {puedeRegistrar ? (
                    <div className="flex flex-1 items-center gap-2.5 lg:gap-3 min-w-0">
                        <span className="flex h-9 w-9 lg:h-10 lg:w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10"><Printer className="h-[18px] w-[18px] lg:h-5 lg:w-5 text-brand-primary" /></span>
                        <div className="min-w-0">
                            <p className="text-ui font-bold text-brand-dark leading-tight">
                                {disponibles === null ? 'Documentos impresos'
                                    : disponibles === 0 ? 'Nada impreso esperando salir'
                                        : <><span className="lg:hidden">{disponibles} impreso{disponibles === 1 ? '' : 's'} sin lote</span><span className="hidden lg:inline">{disponibles} documento{disponibles === 1 ? '' : 's'} impreso{disponibles === 1 ? '' : 's'}, sin asignar</span></>}
                            </p>
                            <p className="text-caption text-muted-foreground">
                                <span className="lg:hidden">{disponibles ? 'Arma un lote para enviarlos' : 'Aparecen al imprimir desde una ficha'}</span>
                                <span className="hidden lg:inline">Salieron impresos desde las fichas y todavía no van en ninguna entrega.</span>
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-1 items-center gap-2.5 lg:gap-3 min-w-0">
                        <span className="flex h-9 w-9 lg:h-10 lg:w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10"><Truck className="h-[18px] w-[18px] lg:h-5 lg:w-5 text-brand-primary" /></span>
                        <div className="min-w-0">
                            <p className="text-ui font-bold text-brand-dark leading-tight">Tus documentos por firmar</p>
                            <p className="text-caption text-muted-foreground">
                                <span className="lg:hidden">Confirma el retiro y devuélvelos firmados</span>
                                <span className="hidden lg:inline">Confirma lo que retiras en oficina y devuélvelo firmado a RRHH.</span>
                            </p>
                        </div>
                    </div>
                )}
                <div className="flex shrink-0 items-center gap-1.5 lg:gap-2">
                    <IconButton variant="ghost" size="sm" aria-label="Recargar" title="Recargar" onClick={() => cargar()} icon={<RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />} />
                    {botonNuevoFranja}
                </div>
                <div className="lg:hidden flex w-full items-center rounded-2xl bg-muted p-1">
                    <PestanasElasticas
                        key={carrilListo ? 'listo' : 'cargando'}
                        opciones={OPCIONES_CARRIL}
                        activa={carrilMovil}
                        onCambiar={setCarrilMovil}
                        aria-label="Dónde están"
                        claseFila="gap-1 w-full"
                        claseOpcion="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-section font-semibold"
                        claseInactiva="text-muted-foreground"
                        render={({ key: e }, sobreIndicador) => (
                            <>
                                {LOTE_ESTADO_LABEL[e]}
                                <span className={cn('flex h-5 min-w-5 px-1 items-center justify-center rounded-full text-micro font-bold tabular-nums',
                                    sobreIndicador ? CARRIL_ESTILO[e].sobreVerde : CARRIL_ESTILO[e].conteo)}>
                                    {carriles[e].length}
                                </span>
                            </>
                        )}
                    />
                </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col p-3 gap-3">
                {/* B7: documentos y lotes que superaron su umbral (solo RRHH; el hook devuelve null sin permiso). */}
                {puedeRegistrar && <div className="shrink-0 [&>div]:mb-0"><AlertasDocumentosStrip onAbrirLote={setAbierto} /></div>}
                {loading && lotes.length === 0 ? (
                    <div className="grid flex-1 grid-cols-1 lg:grid-cols-3 gap-3">
                        {LOTE_ESTADOS.map(e => <div key={e} className="rounded-2xl bg-muted/60 border border-border/60 animate-pulse min-h-40" />)}
                    </div>
                ) : lotes.length === 0 ? (
                    <EmptyState icon={Truck} className="flex-1 justify-center"
                        title="Ningún documento en circulación"
                        description={puedeRegistrar
                            ? 'Imprime los documentos desde la ficha del trabajador y prepara un lote para quien los lleve a firmar.'
                            : 'Cuando RRHH deje documentos impresos a tu nombre, aparecerán aquí para que confirmes el retiro.'}
                        action={botonNuevo ?? undefined} />
                ) : (
                    <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-3 gap-3">
                        {LOTE_ESTADOS.map(renderCarril)}
                    </div>
                )}
            </div>

            <NuevoLoteModal isOpen={nuevo} onClose={() => setNuevo(false)} onCreado={cambio} />
            <LoteDetalleModal loteId={abierto} onClose={cerrarDetalle} onCambio={cambio} />
        </div>
    );
};
