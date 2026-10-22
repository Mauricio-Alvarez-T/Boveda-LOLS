import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, RotateCcw, Truck } from 'lucide-react';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { cn } from '../../../utils/cn';
import { shareViaWhatsApp } from '../../../utils/whatsappShare';
import { Button } from '../../ui/Button';
import { SkeletonText } from '../../ui/Skeleton';
import WhatsAppIcon from '../../ui/WhatsAppIcon';
import { CabezaFicha, EnlaceFicha, Pildora, PieFicha, RotuloFichas } from './FichaInicio';
import { CUADRO, plural, ROTULO_FICHAS } from './fichasInicio';
import {
    abreFormulario, ariaSemaforo, bajadaVehiculo, diasCalendario, eventosFlota, fechaConDia, fechaCorta, fichasVehiculos, fraseVehiculo,
    hoyIso, mensajeWhatsApp, ordenSemaforo, PAPELES_META, pildora, rutaSubir, textoAvisar, textoPlazo, tituloVehiculo, tonoCelda, tonoFicha,
    urgenteDeEvento, type EventoPapel, type PapelApi, type PapelesFlotaApi, type TonoCelda, type Urgente, type VehiculoPapelesApi,
} from './fichasVehiculosInicio';

/** Tarjetas grandes del detalle: las mismas de Asistencia («Hoy», «Próximos 14 días»). */
const CARD = 'rounded-3xl bg-card p-6 text-foreground shadow-[var(--shadow-md)]';
const LETRAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Cuadro del semáforo; sin registro = punteado, como los días que faltan en el mini calendario de Asistencia. */
const CELDA: Record<TonoCelda, string> = {
    rojo: CUADRO.rojo,
    ambar: CUADRO.ambar,
    neutro: CUADRO.neutro,
    punteado: 'border border-dashed border-border bg-card',
};

const CORTO = Object.fromEntries(PAPELES_META.map(m => [m.clave, m.corto]));

/** Los cinco papeles del vehículo: etiqueta corta y un cuadro (rojo vencido, ámbar por vencer, gris al día). */
const SemaforoPapeles: React.FC<{ papeles: PapelApi[] }> = ({ papeles }) => (
    <div role="img" aria-label={ariaSemaforo(papeles)} className="grid shrink-0 grid-cols-[auto_16px] items-center gap-x-2 gap-y-1">
        {ordenSemaforo(papeles).map(p => {
            const fuerte = p.estado === 'vencido' || p.estado === 'por_vencer';
            return (
                <React.Fragment key={p.clave}>
                    <span className={cn('text-right text-micro', fuerte ? 'font-bold text-foreground' : 'font-medium text-muted-foreground')} aria-hidden>
                        {CORTO[p.clave]}
                    </span>
                    <span className={cn('box-border h-4 w-4 rounded', CELDA[tonoCelda(p.estado)])} aria-hidden />
                </React.Fragment>
            );
        })}
    </div>
);

/** Qué quiere decir cada color (Marcos 2026-10-22: «explica abajo en pequeño el color de lo que significa cada uno»). */
const Leyenda: React.FC<{ items: { clase: string; texto: string }[] }> = ({ items }) => (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
        {items.map(i => (
            <span key={i.texto} className="inline-flex items-center gap-1.5">
                <span className={cn('box-border h-2.5 w-2.5 shrink-0 rounded-[3px]', i.clase)} aria-hidden />{i.texto}
            </span>
        ))}
    </p>
);
const LEYENDA_SEMAFORO = [
    { clase: CELDA.rojo, texto: 'Vencido' },
    { clase: CELDA.ambar, texto: 'Vence en 30 días' },
    { clase: CELDA.neutro, texto: 'Al día o sin fecha' },
    { clase: CELDA.punteado, texto: 'Sin registro' },
];
const LEYENDA_CALENDARIO = [
    { clase: 'bg-amber-400', texto: 'Vence ese día (toca el día para ver el vehículo)' },
    { clase: 'border-[1.5px] border-foreground bg-card', texto: 'Hoy' },
];

/** La ficha de un vehículo (la de la opción A), la misma familia que las fichas de Asistencia. */
const FichaVehiculo: React.FC<{ v: VehiculoPapelesApi; urg: Urgente[]; puede: { editar: boolean; crear: boolean } }> = ({ v, urg, puede }) => {
    const navigate = useNavigate();
    const tono = tonoFicha(v);
    return (
        <div className="flex flex-col gap-3.5 rounded-[20px] bg-card p-5 text-foreground shadow-[var(--shadow-sm)] ring-1 ring-border/60">
            <CabezaFicha circulo={<Truck className="h-4 w-4" />} tonoCirculo={tono}
                titulo={tituloVehiculo(v)} bajada={bajadaVehiculo(v)}
                cifra={v.requiere_accion} etiqueta={plural(v.requiere_accion, 'papel', 'papeles')} tonoCifra={tono} />
            <div className="flex items-start gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                    <p className="text-section leading-snug text-zinc-700 dark:text-zinc-300">{fraseVehiculo(urg)}</p>
                    <div className="flex flex-wrap gap-1.5">
                        {urg.map((u, i) => {
                            const p = pildora(u);
                            return <Pildora key={`${u.clave ?? u.nombre}-${i}`} tono={p.tono}>{p.texto}</Pildora>;
                        })}
                    </div>
                </div>
                <SemaforoPapeles papeles={v.papeles} />
            </div>
            <PieFicha>
                <EnlaceFicha apagado onClick={() => { void shareViaWhatsApp(mensajeWhatsApp(v, urg)); }}
                    icono={<WhatsAppIcon className="h-4 w-4 shrink-0 text-green-700 dark:text-green-300" />}>
                    {textoAvisar(v)}
                </EnlaceFicha>
                <EnlaceFicha onClick={() => navigate(rutaSubir(v, urg))}>
                    {abreFormulario(v, urg, puede) ? 'Subir el nuevo' : 'Ver vehículo'}
                </EnlaceFicha>
            </PieFicha>
        </div>
    );
};

/** Lo elegido en el calendario o en las listas: un día (sus vehículos) o un vehículo. */
type Seleccion = { tipo: 'dia'; iso: string } | { tipo: 'vehiculo'; id: number } | null;

type Resultado = { version: unknown; intento: number } & ({ ok: true; data: PapelesFlotaApi } | { ok: false });

/**
 * Detalle «Vehículos» del Inicio (Marcos 2026-10-22): la opción B «Calendario» del lienzo —lo ya vencido a la
 * izquierda, el calendario de cinco semanas con lo que vence en su día y «Próximos 30 días» debajo— combinada
 * con la ficha de la opción A: al tocar un día, un vencido o una fila, la columna izquierda muestra la ficha
 * de ese vehículo (semáforo de sus cinco papeles, «Avisar a {conductor}» y «Subir el nuevo»). Pide
 * `GET /vehiculos/papeles` al abrirse y cuando cambia `version` («Actualizar» del Inicio).
 */
const DetalleVehiculos: React.FC<{ version?: unknown }> = ({ version }) => {
    const { hasPermission } = useAuth();
    const puede = { editar: hasPermission('vehiculos.editar'), crear: hasPermission('vehiculos.crear') };
    const [intento, setIntento] = useState(0);
    const [res, setRes] = useState<Resultado | null>(null);
    const [sel, setSel] = useState<Seleccion>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let vigente = true;
        api.get<{ data: PapelesFlotaApi }>('/vehiculos/papeles?dias=30')
            .then(r => { if (vigente) setRes({ version, intento, ok: true, data: r.data.data }); })
            .catch(() => { if (vigente) setRes({ version, intento, ok: false }); });
        return () => { vigente = false; };
    }, [version, intento]);

    const data = res?.ok ? res.data : null;
    // Al actualizar se sigue viendo lo de antes hasta que llega lo nuevo (sin parpadeo).
    const pendiente = !res || !Object.is(res.version, version) || res.intento !== intento;
    const dias = data?.dias ?? 30;
    const hoy = hoyIso();
    const fichas = useMemo(() => fichasVehiculos(data), [data]);
    const eventos = useMemo(() => eventosFlota(data), [data]);
    const vencidos = useMemo(() => eventos.filter(e => e.estado === 'vencido'), [eventos]);
    const proximos = useMemo(() => eventos.filter(e => e.estado === 'por_vencer'), [eventos]);
    const calendario = useMemo(() => diasCalendario(hoy, eventos), [hoy, eventos]);
    const porId = useMemo(() => new Map(fichas.map(f => [f.v.vehiculo_id, f])), [fichas]);

    // Fichas de lo elegido: los vehículos de ese día (en el orden del día) o el vehículo tocado.
    const elegidas = useMemo(() => {
        if (!sel) return [];
        const ids = sel.tipo === 'vehiculo' ? [sel.id] : [...new Set(eventos.filter(e => e.fecha === sel.iso && e.estado === 'por_vencer').map(e => e.vehiculo_id))];
        return ids.map(id => porId.get(id)).filter((f): f is NonNullable<typeof f> => !!f);
    }, [sel, eventos, porId]);
    const titulo = sel?.tipo === 'dia' ? `Vence el ${fechaConDia(sel.iso)}` : elegidas[0]?.v.patente ?? '';

    /** Elegir y, si el panel quedó fuera de la vista (celular: va arriba del calendario), llevarlo a la vista. */
    const elegir = (s: Seleccion) => {
        setSel(s);
        requestAnimationFrame(() => {
            const el = panelRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            if (r.top < 0 || r.top > window.innerHeight - 120) {
                const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                el.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
            }
        });
    };
    const avisar = (e: EventoPapel) => {
        const f = porId.get(e.vehiculo_id);
        if (f) void shareViaWhatsApp(mensajeWhatsApp(f.v, urgenteDeEvento(f.v, e)));
    };

    const rotulo = <RotuloFichas titulo="Calendario · qué vence y cuándo" nota="Toca un día, un vencido o una fila para ver la ficha del vehículo" />;

    if (!data) {
        return (
            <section className="space-y-3" aria-busy={pendiente}>
                {rotulo}
                {pendiente ? (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                        <div className={CARD}><SkeletonText lines={5} /></div>
                        <div className={CARD}><SkeletonText lines={8} /></div>
                    </div>
                ) : (
                    <div className={cn(CARD, 'flex flex-wrap items-center justify-between gap-3')}>
                        <p className="text-sm text-muted-foreground">No se pudieron cargar los papeles de la flota.</p>
                        <Button variant="secondary" size="sm" onClick={() => setIntento(n => n + 1)}
                            leftIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}>
                            Reintentar
                        </Button>
                    </div>
                )}
            </section>
        );
    }

    return (
        <section className="space-y-3" aria-busy={pendiente}>
            {rotulo}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                {/* Izquierda: lo ya vencido, o la ficha de lo elegido. */}
                <div ref={panelRef} className="min-w-0 scroll-mt-20">
                    {sel && elegidas.length > 0 ? (
                        <div className="space-y-3" aria-live="polite">
                            <div className="flex items-center justify-between gap-3">
                                <p className={ROTULO_FICHAS}>{titulo}</p>
                                <EnlaceFicha apagado onClick={() => setSel(null)} icono={<ArrowLeft className="h-4 w-4" aria-hidden />}>
                                    Ver vencidos
                                </EnlaceFicha>
                            </div>
                            {elegidas.map(({ v, urg }) => <FichaVehiculo key={v.vehiculo_id} v={v} urg={urg} puede={puede} />)}
                            <Leyenda items={LEYENDA_SEMAFORO} />
                        </div>
                    ) : (
                        <div className={cn(CARD, 'space-y-3')}>
                            <div className="flex items-baseline gap-2">
                                <span className={cn('text-4xl font-bold leading-none tracking-tight tabular-nums',
                                    vencidos.length ? 'text-red-700 dark:text-red-300' : 'text-foreground')}>{vencidos.length}</span>
                                <span className="text-sm text-muted-foreground">{plural(vencidos.length, 'papel ya vencido', 'papeles ya vencidos')}</span>
                            </div>
                            {vencidos.length === 0 ? (
                                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Check className="h-4 w-4 shrink-0 text-green-700 dark:text-green-300" aria-hidden />
                                    Ningún aviso de papeles vencidos.
                                </p>
                            ) : (
                                <ul>
                                    {vencidos.map(e => (
                                        <li key={e.key} className="border-t border-border first:border-t-0">
                                            {/* eslint-disable-next-line no-restricted-syntax -- fila de la lista: abre la ficha del vehículo */}
                                            <button type="button" onClick={() => elegir({ tipo: 'vehiculo', id: e.vehiculo_id })}
                                                className="flex w-full items-center gap-3 rounded-lg py-2.5 text-left hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                                                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-red-600 dark:bg-red-500" aria-hidden />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-semibold">{e.patente} · {e.papel}</span>
                                                    <span className="block truncate text-xs text-muted-foreground">{e.vehiculo} · {textoPlazo(e.dias)}</span>
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                {/* Derecha: el calendario y «Próximos 30 días». */}
                <div className={cn(CARD, 'min-w-0 space-y-4')}>
                    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                        {LETRAS.map((l, i) => <span key={i} className="text-center text-micro font-bold text-muted-foreground" aria-hidden>{l}</span>)}
                        {calendario.map(d => {
                            const n = d.eventos.length;
                            const activo = !d.pasado && n > 0;
                            const elegido = sel?.tipo === 'dia' && sel.iso === d.iso;
                            return (
                                // eslint-disable-next-line no-restricted-syntax -- día del calendario (abre la ficha de sus vehículos)
                                <button key={d.iso} type="button" disabled={!activo}
                                    onClick={() => (elegido ? setSel(null) : elegir({ tipo: 'dia', iso: d.iso }))} aria-pressed={elegido}
                                    aria-label={`${fechaConDia(d.iso)}${d.hoy ? ', hoy' : ''}${n ? `: ${plural(n, 'vence 1 papel', `vencen ${n} papeles`)}` : ''}`}
                                    className={cn('flex min-h-11 min-w-0 flex-col items-start gap-1 rounded-xl p-1.5 text-left sm:min-h-[4.5rem] sm:p-2',
                                        d.pasado ? 'bg-transparent text-muted-foreground/60' : n ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-muted/60',
                                        d.hoy && 'ring-[1.5px] ring-foreground', elegido && 'ring-2 ring-brand-primary',
                                        activo && 'cursor-pointer hover:ring-1 hover:ring-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60')}>
                                    <span className={cn('text-xs tabular-nums', d.hoy ? 'font-bold text-foreground' : 'font-medium')}>{d.num}</span>
                                    {n > 0 && (
                                        <>
                                            <span className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                                                {d.eventos.map(e => <span key={e.key} className="h-1.5 w-1.5 rounded-full bg-amber-500" />)}
                                            </span>
                                            <span className="hidden w-full min-w-0 flex-col gap-0.5 sm:flex" aria-hidden>
                                                {d.eventos.slice(0, 2).map(e => (
                                                    <span key={e.key} className="truncate rounded bg-amber-400/90 px-1 text-micro font-semibold text-amber-950">{e.patente}</span>
                                                ))}
                                                {n > 2 && <span className="text-micro text-muted-foreground">+{n - 2}</span>}
                                            </span>
                                        </>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    <Leyenda items={LEYENDA_CALENDARIO} />
                    <div className="border-t border-border pt-3">
                        <p className={cn(ROTULO_FICHAS, 'mb-2')}>Próximos {dias} días</p>
                        {proximos.length === 0 ? (
                            <p className="py-2 text-sm text-muted-foreground">Nada vence en los próximos {dias} días.</p>
                        ) : (
                            <ul>
                                {proximos.map(e => (
                                    <li key={e.key} className="flex items-center gap-2 border-t border-border first:border-t-0">
                                        {/* eslint-disable-next-line no-restricted-syntax -- fila de la lista: abre la ficha del vehículo */}
                                        <button type="button" onClick={() => elegir({ tipo: 'vehiculo', id: e.vehiculo_id })}
                                            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg py-2 text-left hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                                            <span className="w-14 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{fechaCorta(e.fecha)}</span>
                                            <span className="min-w-0 flex-1 truncate text-sm">
                                                <span className="font-semibold">{e.patente}</span> · {e.papel}
                                                <span className="text-muted-foreground"> · {textoPlazo(e.dias)}</span>
                                            </span>
                                        </button>
                                        <EnlaceFicha apagado onClick={() => avisar(e)}
                                            icono={<WhatsAppIcon className="h-4 w-4 shrink-0 text-green-700 dark:text-green-300" />}>
                                            <span className="sr-only sm:not-sr-only">Avisar</span>
                                        </EnlaceFicha>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default DetalleVehiculos;
