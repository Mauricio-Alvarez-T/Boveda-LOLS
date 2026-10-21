import React from 'react';
import { FileWarning, Truck } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { agruparPorEtapa, ETAPA_ACCION, ETAPA_LABEL, type AlertasDocumentos } from '../../documentos-fisicos/documentosAlertas';

const Dias: React.FC<{ dias: number; critical: boolean }> = ({ dias, critical }) => (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
        critical ? 'bg-red-600 text-white' : 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200')}>
        {dias} día{dias === 1 ? '' : 's'}
    </span>
);

/**
 * Detalle de Gestiones en el Inicio (dueño 2026-10-20): TODOS los documentos físicos sin firmar fuera de
 * plazo, agrupados por etapa (qué hay que hacer en cada una), con trabajador, tipo, obra, portador y días
 * — rojo desde el crítico —, más los lotes atascados. Mismos datos que la franja de Gestiones
 * (`useDocumentosAlertas`), sin desplegar.
 */
const DocumentosAtrasadosLista: React.FC<{ alertas: AlertasDocumentos | null; onAbrir: () => void }> = ({ alertas, onAbrir }) => {
    if (!alertas) return <p className="text-sm text-muted-foreground">Cargando documentos…</p>;
    const grupos = agruparPorEtapa(alertas.items);
    const lotes = [
        ...alertas.lotes.sin_confirmar.items.map(l => ({ ...l, motivo: 'en oficina, sin retirar' })),
        ...alertas.lotes.en_terreno.items.map(l => ({ ...l, motivo: 'en terreno' })),
    ];
    if (!grupos.length && !lotes.length) {
        return <p className="text-sm text-muted-foreground">Ningún documento pasó su plazo de firma.</p>;
    }
    return (
        <div className="space-y-4">
            {grupos.map(g => (
                <section key={g.etapa}>
                    <h4 className="flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-muted-foreground">
                        <FileWarning className="h-3.5 w-3.5" aria-hidden /> {ETAPA_LABEL[g.etapa]} · {g.items.length}
                        <span className="font-normal normal-case tracking-normal">— {ETAPA_ACCION[g.etapa]}</span>
                    </h4>
                    <ul className="mt-1">
                        {g.items.map(i => (
                            <li key={i.documento_id}>
                                {/* eslint-disable-next-line no-restricted-syntax -- fila de lista (toda la fila navega) */}
                                <button type="button" onClick={onAbrir}
                                    className="flex w-full items-center gap-3 border-t border-border py-2 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 -mx-2 px-2 rounded-lg">
                                    <span className="min-w-0 flex-1">
                                        <span className="block break-words text-sm font-semibold text-foreground">{i.trabajador.nombre}</span>
                                        <span className="block break-words text-xs text-muted-foreground">
                                            {[i.tipo_nombre, i.obra_nombre, i.portador_nombre ? `con ${i.portador_nombre}` : null].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                    <Dias dias={i.dias} critical={i.critical} />
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
            {lotes.length > 0 && (
                <section>
                    <h4 className="flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-muted-foreground">
                        <Truck className="h-3.5 w-3.5" aria-hidden /> Lotes atascados · {lotes.length}
                    </h4>
                    <ul className="mt-1">
                        {lotes.map(l => (
                            <li key={`${l.motivo}-${l.lote_id}`} className="flex items-center gap-3 border-t border-border py-2">
                                <span className="min-w-0 flex-1 text-sm text-foreground">
                                    <strong>Lote #{l.lote_id}</strong>
                                    <span className="text-muted-foreground"> · {l.portador_nombre || '(usuario eliminado)'} · {l.documentos} doc{l.documentos === 1 ? '' : 's'} · {l.motivo}</span>
                                </span>
                                <Dias dias={l.dias} critical={l.critical} />
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
};

export default DocumentosAtrasadosLista;
