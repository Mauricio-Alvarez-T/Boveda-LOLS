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
import { Truck, PackageOpen, RefreshCw, ChevronRight, PackageCheck, ClipboardCheck, Printer, FileText, AlertTriangle } from 'lucide-react';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLotesPendientes } from '../../hooks/useLotesPendientes';
import { showApiError } from '../../utils/toastUtils';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { EmptyState } from '../ui/EmptyState';
import { NuevoLoteModal } from './NuevoLoteModal';
import { LoteDetalleModal } from './LoteDetalleModal';
import { AlertasDocumentosStrip } from './AlertasDocumentosStrip';
import { useDocumentosAlertas } from '../../hooks/useDocumentosAlertas';
import {
    LOTE_ESTADO_LABEL, LOTE_ESTADO_TITULO, LOTE_ESTADO_VACIO, LOTE_ESTADOS, agruparLotesPorEstado, resumenLote, accionesLote, inicialesNombre, lineaTiempoLote,
    desenlaceLote, DESENLACE_LABEL,
    type LoteEstado, type LoteResumen, type DocumentoDisponible,
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

const CARRIL_ESTILO: Record<LoteEstado, { punto: string; conteo: string }> = {
    pendiente_retiro: { punto: 'bg-amber-500', conteo: 'bg-amber-500 text-white' },
    en_terreno: { punto: 'bg-blue-500', conteo: 'bg-blue-500 text-white' },
    cerrado: { punto: 'bg-muted-foreground/50', conteo: 'bg-border text-muted-foreground' },
};

const CERRADOS_VISIBLES = 12;

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

    const cargar = useCallback(async (silencioso = false) => {
        const mio = ++seq.current;
        if (!silencioso) setLoading(true);
        try {
            const [resLotes, resDisp] = await Promise.all([
                api.get<{ data: LoteResumen[] }>('/documentos-lotes'),
                puedeRegistrar ? api.get<{ data: DocumentoDisponible[] }>('/documentos-lotes/disponibles') : Promise.resolve(null),
            ]);
            if (mio !== seq.current) return;
            setLotes(resLotes.data.data || []);
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
    // Primer carril con contenido para quien entra desde el celular (el portador quiere ver lo que debe confirmar).
    const carrilInicial = useRef(false);
    useEffect(() => {
        if (loading || carrilInicial.current) return;
        carrilInicial.current = true; // solo la primera carga: después manda lo que elija la persona
        const primero = LOTE_ESTADOS.find(e => carriles[e].length > 0);
        if (primero) setCarrilMovil(primero);
    }, [loading, carriles]);

    const botonNuevo = puedeRegistrar
        ? <Button size="sm" leftIcon={<PackageOpen className="h-4 w-4" />} onClick={() => setNuevo(true)} className="shrink-0">Nuevo lote</Button>
        : null;

    const renderLote = (l: LoteResumen) => {
        const acc = accionesLote(l, quien);
        const cta = acc.confirmarRetiro ? { texto: 'Confirmar retiro', icon: PackageCheck }
            : acc.recepcion ? { texto: 'Registrar lo que volvió', icon: ClipboardCheck }
                : null;
        return (
            /* eslint-disable-next-line no-restricted-syntax -- tarjeta completa clickeable (abre el detalle del lote) */
            <button key={l.id} type="button" onClick={() => setAbierto(l.id)}
                className={cn('w-full text-left rounded-2xl border bg-card p-3.5 shadow-sm transition-all duration-200',
                    'hover:border-brand-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                    acc.confirmarRetiro ? 'border-amber-300 dark:border-amber-700/70' : 'border-border')}>
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary text-section font-bold">
                        {inicialesNombre(l.portador_nombre) || '?'}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-ui font-bold text-brand-dark leading-tight truncate">{l.portador_nombre || '(usuario eliminado)'}</p>
                        <p className="text-caption text-muted-foreground">Lote #{l.id} · {lineaTiempoLote(l)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                        <p className="text-title-sm font-bold tabular-nums leading-none text-brand-dark">{l.total}</p>
                        <p className="text-micro font-semibold uppercase tracking-wider text-muted-foreground">doc{l.total === 1 ? '' : 's'}</p>
                    </div>
                </div>
                <p className="mt-2.5 flex items-center gap-1.5 text-caption text-muted-foreground">
                    <FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{resumenLote(l)}</span>
                </p>
                {l.observacion && <p className="mt-1 text-caption text-muted-foreground italic line-clamp-1">“{l.observacion}”</p>}
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
                    <span className={cn('mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-full px-4 text-section font-semibold shadow-sm',
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
                className={cn('min-h-0 flex-col rounded-2xl bg-muted/60 border border-border/60', carrilMovil === estado ? 'flex' : 'hidden lg:flex')}>
                <header className="shrink-0 px-3.5 pt-3 pb-2">
                    <div className="flex items-center gap-2">
                        <span className={cn('h-2.5 w-2.5 rounded-full', est.punto)} />
                        <h3 className="text-section font-bold text-brand-dark">{LOTE_ESTADO_TITULO[estado]}</h3>
                        <span className={cn('ml-auto flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full text-micro font-bold tabular-nums', est.conteo)}>{todos.length}</span>
                    </div>
                    <p className="mt-0.5 text-caption text-muted-foreground">{CARRIL_HINT[estado][rol]}</p>
                </header>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2.5 pb-2.5 space-y-2">
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
            <div className="border-b border-border px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
                {puedeRegistrar ? (
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10"><Printer className="h-5 w-5 text-brand-primary" /></span>
                        <div className="min-w-0">
                            <p className="text-ui font-bold text-brand-dark leading-tight">
                                {disponibles === null ? 'Documentos impresos' : disponibles === 0 ? 'Nada impreso esperando salir' : `${disponibles} documento${disponibles === 1 ? '' : 's'} impreso${disponibles === 1 ? '' : 's'}, sin asignar`}
                            </p>
                            <p className="text-caption text-muted-foreground truncate">Salieron impresos desde las fichas y todavía no van en ninguna entrega.</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10"><Truck className="h-5 w-5 text-brand-primary" /></span>
                        <div className="min-w-0">
                            <p className="text-ui font-bold text-brand-dark leading-tight">Tus documentos por firmar</p>
                            <p className="text-caption text-muted-foreground truncate">Confirma lo que retiras en oficina y devuélvelo firmado a RRHH.</p>
                        </div>
                    </div>
                )}
                <div className="flex items-center gap-2 ml-auto">
                    <IconButton variant="ghost" size="sm" aria-label="Recargar" title="Recargar" onClick={() => cargar()} icon={<RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />} />
                    {botonNuevo}
                </div>
                <div role="tablist" aria-label="Dónde están" className="lg:hidden flex w-full items-center gap-1 rounded-2xl bg-muted p-1">
                    {LOTE_ESTADOS.map(e => (
                        <Button key={e} role="tab" size="sm" variant={carrilMovil === e ? 'glass' : 'ghost'} aria-selected={carrilMovil === e}
                            onClick={() => setCarrilMovil(e)}
                            className={cn('h-9 flex-1 rounded-xl px-2 text-section font-semibold gap-1.5', carrilMovil === e ? 'text-brand-dark shadow-sm' : 'text-muted-foreground')}>
                            {LOTE_ESTADO_LABEL[e]}
                            <span className={cn('flex h-5 min-w-5 px-1 items-center justify-center rounded-full text-micro font-bold tabular-nums', CARRIL_ESTILO[e].conteo)}>{carriles[e].length}</span>
                        </Button>
                    ))}
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
