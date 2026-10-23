import React, { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ChevronDown, FileSignature, Hourglass, IdCard, PackageX, RotateCcw, Truck, UserX } from 'lucide-react';
import api from '../../../../services/api';
import type { ApiResponse } from '../../../../types';
import { useAuth } from '../../../../context/AuthContext';
import { cn } from '../../../../utils/cn';
import { shareViaWhatsApp } from '../../../../utils/whatsappShare';
import { Button } from '../../../ui/Button';
import { Skeleton, SkeletonText } from '../../../ui/Skeleton';
import WhatsAppIcon from '../../../ui/WhatsAppIcon';
import { EncabezadoTarjeta } from '../EncabezadoTarjeta';
import { CIFRA, PILDORA, ROTULO_FICHAS } from '../fichasInicio';
import {
    TOPE_URGENTE, temasGerencia, temasPendientes, textoDesplegar, textoMasEnModulo, tituloFranja,
    type FilaTema, type GerenciaApi, type TemaGerencia, type TemaKey,
} from './gerencia.modelo';

/**
 * «Inicio de gerencia» (don Luis Lazcano; opción B «Tablero por tema» del lienzo, 2026-10-23). Va ARRIBA de las tarjetas
 * del Inicio, solo con `inicio.gerencia`. Una franja «N temas esperan una decisión» con la cifra de cada tema y seis
 * tarjetas (3 por fila desde 1280 px, 2 en tableta, 1 en el teléfono), cada una con su número grande, qué se decide y
 * lo más urgente. Tocar la tarjeta (o «Ver los N») la despliega: todos los pendientes con qué falta, de quién y desde
 * cuándo. Cada fila abre donde se resuelve; el pie lleva el enlace al módulo y UN botón de WhatsApp sin número con todo
 * lo pendiente del tema (don Luis elige el grupo o la persona). Pide GET /dashboard/gerencia al montarse y cuando cambia
 * `version` («Actualizar» del Inicio). Lógica y textos en `gerencia.modelo.ts` y `mensajes.ts`.
 */

const CARD = 'rounded-3xl bg-card text-foreground shadow-[var(--shadow-md)]';
const FOCO = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40';

const ICONO: Record<TemaKey, React.ElementType> = {
    faltas: UserX, vehiculos: Truck, perdidas: PackageX, documentos: IdCard, papeles: FileSignature, solicitudes: Hourglass,
};

const Pildora: React.FC<{ tono: FilaTema['tono']; children: React.ReactNode }> = ({ tono, children }) => (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-label font-semibold', PILDORA[tono])}>{children}</span>
);

/** Una fila: toda ella abre el trámite donde se resuelve. Desplegada, dice además qué falta en una frase. */
const Fila: React.FC<{ f: FilaTema; abierta: boolean; onAbrir: (ruta: string) => void }> = ({ f, abierta, onAbrir }) => (
    // eslint-disable-next-line no-restricted-syntax -- fila tocable del tablero (navega a donde se resuelve, como el lienzo)
    <button type="button" onClick={() => onAbrir(f.ruta)}
        className={cn('group -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors duration-200 hover:bg-muted/60', FOCO)}>
        <span className="min-w-0 flex-1">
            <span className="block break-words text-sm font-semibold">{f.titulo}</span>
            <span className="block break-words text-xs text-muted-foreground">{f.bajada}</span>
            {f.pildoras.length > 0 && (
                <span className="mt-1 flex flex-wrap gap-1">
                    {f.pildoras.map(p => <Pildora key={p.texto} tono={p.tono}>{p.texto}</Pildora>)}
                </span>
            )}
            {abierta && f.detalle && <span className="mt-1 block text-xs leading-snug text-zinc-700 dark:text-zinc-300">{f.detalle}</span>}
        </span>
        <span className="shrink-0 text-right">
            <span className={cn('block text-base font-bold leading-tight tabular-nums', CIFRA[f.tono])}>{f.cifra}</span>
            <span className="block max-w-28 text-caption leading-tight text-muted-foreground">{f.nota}</span>
        </span>
    </button>
);

const TarjetaTema: React.FC<{ t: TemaGerencia; onAbrir: (ruta: string) => void }> = ({ t, onAbrir }) => {
    const [abierta, setAbierta] = useState(false);
    const idLista = useId();
    const hay = t.filas.length > 0;
    const visibles = abierta ? t.filas : t.filas.slice(0, TOPE_URGENTE);
    const masEnModulo = abierta ? textoMasEnModulo(t) : null;
    return (
        <article
            aria-label={t.titulo}
            className={cn(CARD, 'flex flex-col p-5 sm:p-6', hay && 'cursor-pointer transition-shadow duration-200 hover:ring-1 hover:ring-border')}
            // Toda la tarjeta despliega (atajo con mouse o dedo); los botones de adentro mandan sobre ella. Con teclado,
            // el camino es su botón «Ver los N» / «Ver el detalle».
            onClick={hay ? (e) => {
                if ((e.target as HTMLElement).closest('button, a')) return;
                setAbierta(v => !v);
            } : undefined}>
            <EncabezadoTarjeta icon={ICONO[t.key]} tono={t.tono} titulo={t.titulo} className="mb-3" />
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className={cn('font-bold leading-none tracking-display tabular-nums', CIFRA[t.tono], t.esMonto ? 'text-headline' : 'text-5xl')}>{t.cifra}</span>
                <span className="text-sm text-muted-foreground">{t.etiqueta}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t.resumen}.</p>
            {hay && (
                <p className="mt-2 text-sm"><span className="font-semibold">Qué se decide: </span><span className="text-muted-foreground">{t.decision}.</span></p>
            )}

            {hay ? (
                <>
                    <h4 className={cn(ROTULO_FICHAS, 'mt-5')}>{abierta ? `Todos los pendientes (${t.total})` : 'Lo más urgente'}</h4>
                    <ul id={idLista} className="mt-1 divide-y divide-border">
                        {visibles.map(f => <li key={f.id}><Fila f={f} abierta={abierta} onAbrir={onAbrir} /></li>)}
                    </ul>
                    {masEnModulo && <p className="mt-1 text-xs text-muted-foreground">{masEnModulo}</p>}
                </>
            ) : (
                <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-700 dark:text-green-300" aria-hidden />
                    Nada pendiente en este tema.
                </p>
            )}

            <div className="mt-auto pt-4">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-2">
                    {hay ? (
                        // eslint-disable-next-line no-restricted-syntax -- enlace del pie (despliega la tarjeta, como el lienzo)
                        <button type="button" onClick={() => setAbierta(v => !v)} aria-expanded={abierta} aria-controls={idLista}
                            className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-section font-semibold text-zinc-700 hover:underline dark:text-zinc-300', FOCO)}>
                            {abierta ? 'Ver menos' : textoDesplegar(t)}
                            <ChevronDown className={cn('h-4 w-4 transition-transform duration-200 motion-reduce:transition-none', abierta && 'rotate-180')} aria-hidden />
                        </button>
                    ) : <span />}
                    {/* eslint-disable-next-line no-restricted-syntax -- enlace del pie (navega al módulo) */}
                    <button type="button" onClick={() => onAbrir(t.enlace.ruta)}
                        className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-section font-semibold text-green-700 hover:underline dark:text-green-300', FOCO)}>
                        {t.enlace.texto}<ArrowRight className="h-4 w-4" aria-hidden />
                    </button>
                </div>
                {t.whatsapp && (
                    // eslint-disable-next-line no-restricted-syntax -- pastilla verde de 44 px del lienzo (abre WhatsApp sin número)
                    <button type="button" onClick={() => { void shareViaWhatsApp(t.whatsapp!.mensaje, t.titulo); }}
                        className={cn('mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-green-50 px-4 text-sm font-semibold text-green-700 transition-colors duration-200 hover:bg-green-100 dark:bg-green-500/15 dark:text-green-300 dark:hover:bg-green-500/25', FOCO)}>
                        <WhatsAppIcon className="h-4 w-4" />
                        {t.whatsapp.texto}
                    </button>
                )}
            </div>
        </article>
    );
};

/** La franja de arriba: «6 temas esperan una decisión» y la cifra de cada tema con algo pendiente. */
const Franja: React.FC<{ temas: TemaGerencia[] }> = ({ temas }) => {
    const pendientes = temasPendientes(temas);
    return (
        <section aria-label="Resumen de gerencia"
            className={cn(CARD, 'flex flex-col gap-3 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:gap-6')}>
            <h2 className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight">
                {pendientes.length === 0 && <CheckCircle2 className="h-5 w-5 text-green-700 dark:text-green-300" aria-hidden />}
                {tituloFranja(temas)}
            </h2>
            {pendientes.length > 0 ? (
                <ul className="flex flex-wrap gap-x-4 gap-y-1.5 lg:border-l lg:border-border lg:pl-6">
                    {pendientes.map(t => (
                        <li key={t.key} className="flex items-baseline gap-1.5 text-sm">
                            <span className={cn('font-bold tabular-nums', CIFRA[t.tono])}>{t.franja.cifra}</span>
                            <span className="text-muted-foreground">{t.franja.texto}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-sm text-muted-foreground lg:border-l lg:border-border lg:pl-6">
                    Sin faltas reiteradas, papeles vencidos, pérdidas ni solicitudes trabadas.
                </p>
            )}
        </section>
    );
};

type Resultado = { version: unknown; intento: number } & ({ ok: true; data: GerenciaApi } | { ok: false });

const GRILLA = 'grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3';

const InicioGerencia: React.FC<{ version?: unknown }> = ({ version }) => {
    const navigate = useNavigate();
    const { hasPermission } = useAuth();
    const registraEntregas = hasPermission('documentos.entrega.registrar');
    const [intento, setIntento] = useState(0);
    const [res, setRes] = useState<Resultado | null>(null);
    // Lo último que llegó bien: al «Actualizar» se sigue viendo hasta que llega lo nuevo (y si la recarga falla, también).
    const [ultimo, setUltimo] = useState<GerenciaApi | null>(null);

    useEffect(() => {
        let vigente = true;
        api.get<ApiResponse<GerenciaApi>>('/dashboard/gerencia')
            .then(r => {
                if (!vigente) return;
                setRes({ version, intento, ok: true, data: r.data.data });
                setUltimo(r.data.data);
            })
            .catch(() => { if (vigente) setRes({ version, intento, ok: false }); });
        return () => { vigente = false; };
    }, [version, intento]);

    const data = res?.ok ? res.data : ultimo;
    const cargando = !res || !Object.is(res.version, version) || res.intento !== intento;
    const temas = useMemo(() => temasGerencia(data, { registraEntregas }), [data, registraEntregas]);

    if (!data) {
        return (
            <section aria-label="Inicio de gerencia" aria-busy={cargando} className="space-y-6">
                {cargando ? (
                    <>
                        <div className={cn(CARD, 'px-5 py-4 sm:px-6')}><Skeleton className="h-6 w-64" /></div>
                        <div className={GRILLA}>
                            {[0, 1, 2].map(i => <div key={i} className={cn(CARD, 'p-6', i > 0 && 'max-md:hidden', i > 1 && 'max-xl:hidden')}><SkeletonText lines={7} /></div>)}
                        </div>
                    </>
                ) : (
                    <div className={cn(CARD, 'flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6')}>
                        <p className="text-sm text-muted-foreground">No se pudo cargar lo que espera una decisión de gerencia.</p>
                        <Button variant="secondary" size="sm" onClick={() => setIntento(n => n + 1)} className="max-sm:min-h-11"
                            leftIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}>
                            Reintentar
                        </Button>
                    </div>
                )}
            </section>
        );
    }
    // Con `inicio.gerencia` pero sin el permiso de ningún módulo, no hay nada que mostrar.
    if (temas.length === 0) return null;
    const pendientes = temasPendientes(temas);

    return (
        <section aria-label="Inicio de gerencia" aria-busy={cargando} className="space-y-6">
            <Franja temas={temas} />
            {pendientes.length > 0 && (
                <div className={GRILLA}>
                    {temas.map(t => <TarjetaTema key={t.key} t={t} onAbrir={(ruta) => navigate(ruta)} />)}
                </div>
            )}
        </section>
    );
};

export default InicioGerencia;
