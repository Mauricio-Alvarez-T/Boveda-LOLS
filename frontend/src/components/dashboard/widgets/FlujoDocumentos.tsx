import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, FileSearch, PackageCheck, PackagePlus, Printer } from 'lucide-react';

import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { cn } from '../../../utils/cn';
import { shareViaWhatsApp } from '../../../utils/whatsappShare';
import { Button } from '../../ui/Button';
import { Cargando, Skeleton } from '../../ui/Skeleton';
import WhatsAppIcon from '../../ui/WhatsAppIcon';
import { abrirGenerado } from '../../documents/abrirDocumentoGenerado';
import { LoteDetalleModal } from '../../documentos-fisicos/LoteDetalleModal';
import { NuevoLoteModal } from '../../documentos-fisicos/NuevoLoteModal';
import type { AlertasDocumentos } from '../../documentos-fisicos/documentosAlertas';
import { EnlaceFicha } from './FichaInicio';
import { NOMBRE_PASO, estadoPaso, pasoInicial, pasosFlujo, type FilaFlujo, type FlujoRespuesta, type PasoFlujo, type TonoFila } from './pasosFlujoDocumentos';

const VISIBLES = 8;

const CHIP: Record<TonoFila, string> = {
    normal: 'bg-muted text-foreground',
    aviso: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200',
    critico: 'bg-red-600 text-white',
    listo: 'bg-green-50 text-green-800 dark:bg-green-500/15 dark:text-green-200',
};

const ICONO = 'h-4 w-4 shrink-0';

/**
 * El flujo mientras llega (diseno.md §9.17): las cinco etapas con su número y nombre de verdad (sin elegida: cuál se
 * abre depende de los datos) y sus cifras en gris; el panel de la etapa con sus filas en gris y su enlace de verdad.
 */
const FlujoSilueta: React.FC<{ onIr: () => void }> = ({ onIr }) => (
    <div className="space-y-4">
        <Cargando que="el flujo de documentos" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {Object.values(NOMBRE_PASO).map((nombre, i) => (
                <div key={nombre} className="flex flex-col items-start gap-1 rounded-2xl border border-border bg-card p-3" aria-hidden="true">
                    <span className="text-micro font-bold uppercase tracking-wider text-muted-foreground">Paso {i + 1}</span>
                    <span className="text-sm font-semibold leading-tight">{nombre}</span>
                    <div className="flex items-end gap-1.5"><Skeleton className="h-6 w-7" /><Skeleton className="h-3 w-16" /></div>
                    <Skeleton className="mt-0.5 h-3 w-20" />
                </div>
            ))}
        </Cargando>
        <section className="rounded-2xl border border-border bg-card">
            <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
                <div className="min-w-0 space-y-1.5" aria-hidden="true">
                    <Skeleton className="h-4 w-48 max-w-full" />
                    <Skeleton className="h-3 w-64 max-w-full" />
                </div>
                <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={onIr}>Ir a Documentos físicos</Button>
            </header>
            <ul aria-hidden="true">
                {[0, 1, 2, 3].map(i => (
                    <li key={i} className="flex items-center gap-x-3 border-t border-border px-4 py-2.5 first:border-t-0">
                        <div className="min-w-0 flex-1 space-y-1.5">
                            <Skeleton className={cn('h-4', i % 2 ? 'w-1/2' : 'w-3/4')} />
                            <Skeleton className="h-3 w-2/5" />
                        </div>
                        <Skeleton className="h-3 w-12 shrink-0 max-sm:hidden" />
                        <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
                    </li>
                ))}
            </ul>
        </section>
    </div>
);

/**
 * Detalle de Gestiones para RRHH (detalle D del lienzo, dueño 2026-10-21): el flujo de los documentos
 * físicos en 5 pasos. Cada paso es una pestaña con su cifra y cuántos van fuera de plazo; al elegirlo se ve
 * su lista completa (8 a la vista, «Ver los N» para el resto; ningún texto se corta). Abre en el primer paso
 * con algo fuera de plazo.
 *
 * Cada fila trae su acción (dueño 2026-10-23: la acción va donde se ve el problema): imprimir lo que está sin
 * imprimir, armar el lote de lo impreso, recordarle al portador por WhatsApp y abrir el lote (ver o anular
 * en oficina, registrar la devolución en terreno). Los modales son los de Documentos físicos.
 *
 * El paso elegido lo puede llevar el Inicio (`paso` + `onPaso`): así las píldoras de etapa de la tarjeta
 * abren el detalle directo en su paso (dueño 2026-10-23). null = el automático (`pasoInicial`).
 */
interface Props {
    alertas: AlertasDocumentos | null;
    onIr: () => void;
    onCambio?: () => void;
    paso?: PasoFlujo['key'] | null;
    onPaso?: (paso: PasoFlujo['key']) => void;
}

const FlujoDocumentos: React.FC<Props> = ({ alertas, onIr, onCambio, paso: pasoPedido, onPaso }) => {
    const { hasPermission } = useAuth();
    const puedeImprimir = hasPermission('documentos.laborales.descargar');
    const [flujo, setFlujo] = useState<FlujoRespuesta | null>(null);
    const [error, setError] = useState(false);
    const [propio, setPropio] = useState<PasoFlujo['key'] | null>(null);
    // «Ver los N» queda abierto solo en el paso donde se pidió (cambiar de paso lo cierra sin un efecto).
    const [todosEn, setTodosEn] = useState<PasoFlujo['key'] | null>(null);
    const [version, setVersion] = useState(0);
    const [loteAbierto, setLoteAbierto] = useState<number | null>(null);
    const [nuevoLote, setNuevoLote] = useState(false);
    const [imprimiendo, setImprimiendo] = useState<number | null>(null);

    useEffect(() => {
        let vivo = true;
        api.get<{ data: FlujoRespuesta }>('/documentos-lotes/flujo')
            .then(res => { if (vivo) { setFlujo(res.data.data); setError(false); } })
            .catch(() => { if (vivo) setError(true); });
        return () => { vivo = false; };
    }, [version]);

    // Tras imprimir, armar, recibir o anular: se recarga el flujo y el Inicio refresca sus cifras.
    const cambio = useCallback(() => { setVersion(v => v + 1); onCambio?.(); }, [onCambio]);
    // Estable: LoteDetalleModal recarga el lote cuando cambia `onClose`.
    const cerrarLote = useCallback(() => setLoteAbierto(null), []);

    const imprimir = async (documentoId: number) => {
        setImprimiendo(documentoId);
        try {
            await abrirGenerado(documentoId, '', 'print');
        } finally {
            setImprimiendo(null);
            cambio();
        }
    };

    const pasos = useMemo(() => (flujo ? pasosFlujo(flujo, alertas) : []), [flujo, alertas]);
    if (error && !flujo) return <p className="text-sm text-muted-foreground">No se pudo cargar el flujo de documentos.</p>;
    if (!flujo) return <FlujoSilueta onIr={onIr} />;

    const elegidoKey = pasoPedido !== undefined ? pasoPedido : propio;
    const elegir = (k: PasoFlujo['key']) => (onPaso ? onPaso(k) : setPropio(k));
    const indiceElegido = elegidoKey ? pasos.findIndex(p => p.key === elegidoKey) : -1;
    const activo = indiceElegido >= 0 ? indiceElegido : pasoInicial(pasos);
    const paso = pasos[activo];
    const todos = todosEn === paso.key;
    const filas = todos ? paso.filas : paso.filas.slice(0, VISIBLES);
    const fueraDeLista = paso.n - paso.filas.length;

    const acciones = (p: PasoFlujo, f: FilaFlujo) => {
        if (p.key === 'sin_imprimir' && f.documentoId != null && puedeImprimir) {
            const id = f.documentoId;
            return (
                <EnlaceFicha onClick={() => { if (imprimiendo == null) void imprimir(id); }} icono={<Printer className={ICONO} aria-hidden />}>
                    {imprimiendo === id ? 'Abriendo…' : 'Imprimir'}
                </EnlaceFicha>
            );
        }
        if (f.loteId == null) return null;
        const loteId = f.loteId;
        return (
            <>
                {f.aviso && (
                    <EnlaceFicha apagado onClick={() => { void shareViaWhatsApp(f.aviso as string); }}
                        icono={<WhatsAppIcon className={cn(ICONO, 'text-green-700 dark:text-green-300')} />}>
                        Recordar
                    </EnlaceFicha>
                )}
                {p.key === 'en_terreno' ? (
                    <EnlaceFicha onClick={() => setLoteAbierto(loteId)} icono={<PackageCheck className={ICONO} aria-hidden />}>Recibir</EnlaceFicha>
                ) : (
                    <EnlaceFicha onClick={() => setLoteAbierto(loteId)} icono={<FileSearch className={ICONO} aria-hidden />}>Ver lote</EnlaceFicha>
                )}
            </>
        );
    };

    return (
        <div className="space-y-4">
            <div role="tablist" aria-label="Etapas de los documentos físicos" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {pasos.map((p, i) => {
                    const sel = i === activo;
                    return (
                        // eslint-disable-next-line no-restricted-syntax -- pestaña del flujo (tarjeta completa)
                        <button key={p.key} type="button" role="tab" aria-selected={sel}
                            onClick={() => elegir(p.key)}
                            className={cn('flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-colors duration-200 motion-reduce:transition-none',
                                'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                                sel ? 'border-green-700 bg-green-700 text-white dark:border-green-600 dark:bg-green-600' : 'border-border bg-card hover:bg-muted/60')}>
                            <span className={cn('text-micro font-bold uppercase tracking-wider', sel ? 'text-green-100' : 'text-muted-foreground')}>Paso {i + 1}</span>
                            <span className="text-sm font-semibold leading-tight">{p.nombre}</span>
                            <span className="flex items-baseline gap-1.5">
                                <b className={cn('text-2xl font-bold tabular-nums leading-none',
                                    sel ? (p.fuera > 0 ? 'text-yellow-300' : 'text-white') : p.fuera > 0 ? 'text-red-700 dark:text-red-400' : p.listo ? 'text-green-700 dark:text-green-400' : 'text-foreground')}>
                                    {p.n}
                                </b>
                                <span className={cn('text-xs', sel ? 'text-green-100' : 'text-muted-foreground')}>{p.unidad}</span>
                            </span>
                            <span className={cn('text-xs font-semibold', sel ? 'text-white' : p.fuera > 0 ? 'text-red-700 dark:text-red-400' : p.listo ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground')}>
                                {estadoPaso(p)}
                            </span>
                        </button>
                    );
                })}
            </div>

            <section role="tabpanel" aria-label={paso.nombre} className="rounded-2xl border border-border bg-card">
                <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
                    <div className="min-w-0">
                        <h3 className="text-base font-semibold text-foreground">{paso.nombre} · {paso.n} {paso.unidad}</h3>
                        <p className="text-xs text-muted-foreground">{paso.accion}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Lo impreso sin portador se resuelve armándole el lote aquí mismo. */}
                        {paso.key === 'impresos' && paso.n > 0 && (
                            <Button size="sm" leftIcon={<PackagePlus className="h-4 w-4" />} onClick={() => setNuevoLote(true)}>Armar lote</Button>
                        )}
                        <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={onIr}>Ir a Documentos físicos</Button>
                    </div>
                </header>
                {paso.filas.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nada en esta etapa.</p>
                ) : (
                    <ul>
                        {filas.map(f => {
                            const accion = acciones(paso, f);
                            return (
                                <li key={f.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2.5 first:border-t-0">
                                    <span className="min-w-0 flex-1 basis-48">
                                        <span className="block text-sm font-semibold text-foreground break-words">{f.titulo}</span>
                                        {f.sub && <span className="block text-xs text-muted-foreground break-words">{f.sub}</span>}
                                    </span>
                                    <span className="text-xs text-muted-foreground">{f.quien}</span>
                                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold tabular-nums', CHIP[f.tono])}>{f.dias}</span>
                                    {accion && <span className="flex flex-wrap items-center gap-x-3">{accion}</span>}
                                </li>
                            );
                        })}
                    </ul>
                )}
                {(paso.filas.length > VISIBLES || fueraDeLista > 0) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2">
                        {paso.filas.length > VISIBLES ? (
                            <Button variant="ghost" size="sm" onClick={() => setTodosEn(todos ? null : paso.key)}
                                rightIcon={<ChevronDown className={cn('h-4 w-4 transition-transform duration-200 motion-reduce:transition-none', todos && 'rotate-180')} />}>
                                {todos ? 'Ver menos' : `Ver los ${paso.filas.length}`}
                            </Button>
                        ) : <span />}
                        {fueraDeLista > 0 && <span className="text-xs text-muted-foreground">y {fueraDeLista} más en Documentos físicos</span>}
                    </div>
                )}
            </section>

            <NuevoLoteModal isOpen={nuevoLote} onClose={() => setNuevoLote(false)} onCreado={cambio} />
            <LoteDetalleModal loteId={loteAbierto} onClose={cerrarLote} onCambio={cambio} />
        </div>
    );
};

export default FlujoDocumentos;
