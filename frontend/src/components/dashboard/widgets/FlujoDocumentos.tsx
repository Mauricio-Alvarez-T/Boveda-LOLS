import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';

import api from '../../../services/api';
import { cn } from '../../../utils/cn';
import { Button } from '../../ui/Button';
import { SkeletonText } from '../../ui/Skeleton';
import type { AlertasDocumentos } from '../../documentos-fisicos/documentosAlertas';
import { estadoPaso, pasoInicial, pasosFlujo, type FlujoRespuesta, type TonoFila } from './pasosFlujoDocumentos';

const VISIBLES = 8;

const CHIP: Record<TonoFila, string> = {
    normal: 'bg-muted text-foreground',
    aviso: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200',
    critico: 'bg-red-600 text-white',
    listo: 'bg-green-50 text-green-800 dark:bg-green-500/15 dark:text-green-200',
};

/**
 * Detalle de Gestiones para RRHH (detalle D del lienzo, dueño 2026-10-21): el flujo de los documentos
 * físicos en 5 pasos. Cada paso es una pestaña con su cifra y cuántos van fuera de plazo; al elegirlo se ve
 * su lista completa (8 a la vista, «Ver los N» para el resto; ningún texto se corta). Abre en el primer paso
 * con algo fuera de plazo.
 */
const FlujoDocumentos: React.FC<{ alertas: AlertasDocumentos | null; onIr: () => void }> = ({ alertas, onIr }) => {
    const [flujo, setFlujo] = useState<FlujoRespuesta | null>(null);
    const [error, setError] = useState(false);
    const [elegido, setElegido] = useState<number | null>(null);
    const [todos, setTodos] = useState(false);

    useEffect(() => {
        let vivo = true;
        api.get<{ data: FlujoRespuesta }>('/documentos-lotes/flujo')
            .then(res => { if (vivo) setFlujo(res.data.data); })
            .catch(() => { if (vivo) setError(true); });
        return () => { vivo = false; };
    }, []);

    const pasos = useMemo(() => (flujo ? pasosFlujo(flujo, alertas) : []), [flujo, alertas]);
    if (error) return <p className="text-sm text-muted-foreground">No se pudo cargar el flujo de documentos.</p>;
    if (!flujo) return <SkeletonText lines={6} />;

    const activo = elegido ?? pasoInicial(pasos);
    const paso = pasos[activo];
    const filas = todos ? paso.filas : paso.filas.slice(0, VISIBLES);
    const fueraDeLista = paso.n - paso.filas.length;

    return (
        <div className="space-y-4">
            <div role="tablist" aria-label="Etapas de los documentos físicos" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {pasos.map((p, i) => {
                    const sel = i === activo;
                    return (
                        // eslint-disable-next-line no-restricted-syntax -- pestaña del flujo (tarjeta completa)
                        <button key={p.key} type="button" role="tab" aria-selected={sel}
                            onClick={() => { setElegido(i); setTodos(false); }}
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
                    <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={onIr}>Ir a Documentos físicos</Button>
                </header>
                {paso.filas.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nada en esta etapa.</p>
                ) : (
                    <ul>
                        {filas.map(f => (
                            <li key={f.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2.5 first:border-t-0">
                                <span className="min-w-0 flex-1 basis-48">
                                    <span className="block text-sm font-semibold text-foreground break-words">{f.titulo}</span>
                                    {f.sub && <span className="block text-xs text-muted-foreground break-words">{f.sub}</span>}
                                </span>
                                <span className="text-xs text-muted-foreground">{f.quien}</span>
                                <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold tabular-nums', CHIP[f.tono])}>{f.dias}</span>
                            </li>
                        ))}
                    </ul>
                )}
                {(paso.filas.length > VISIBLES || fueraDeLista > 0) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2">
                        {paso.filas.length > VISIBLES ? (
                            <Button variant="ghost" size="sm" onClick={() => setTodos(v => !v)}
                                rightIcon={<ChevronDown className={cn('h-4 w-4 transition-transform duration-200 motion-reduce:transition-none', todos && 'rotate-180')} />}>
                                {todos ? 'Ver menos' : `Ver los ${paso.filas.length}`}
                            </Button>
                        ) : <span />}
                        {fueraDeLista > 0 && <span className="text-xs text-muted-foreground">y {fueraDeLista} más en Documentos físicos</span>}
                    </div>
                )}
            </section>
        </div>
    );
};

export default FlujoDocumentos;
