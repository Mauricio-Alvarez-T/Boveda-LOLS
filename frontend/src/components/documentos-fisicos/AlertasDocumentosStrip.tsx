/**
 * Franja "Documentos sin firmar" de la pestaña Documentos físicos (plan Gestiones B7). Resume lo que superó
 * su umbral (GET /documentos-alertas/pendientes): conteo por etapa y, desplegado, la lista por etapa con
 * trabajador · tipo · días · portador, más los lotes atascados. Solo RRHH (documentos.entrega.registrar).
 * Color = significado: crítico rojo, aviso ámbar.
 */
import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, FileWarning, Truck } from 'lucide-react';

import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { useDocumentosAlertas } from '../../hooks/useDocumentosAlertas';
import { agruparPorEtapa, ETAPA_LABEL, ETAPA_ACCION, type AlertasDocumentos } from './documentosAlertas';

interface Props {
    /** Abre el lote (para los lotes atascados). */
    onAbrirLote?: (loteId: number) => void;
}

const Dias: React.FC<{ dias: number; critical: boolean }> = ({ dias, critical }) => (
    <span className={cn('tabular-nums font-semibold shrink-0', critical ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300')}>
        {dias} día{dias === 1 ? '' : 's'}
    </span>
);

const sinNada = (a: AlertasDocumentos | null) => !a || (a.total === 0 && a.lotes.sin_confirmar.total === 0 && a.lotes.en_terreno.total === 0);

export const AlertasDocumentosStrip: React.FC<Props> = ({ onAbrirLote }) => {
    const { alertas } = useDocumentosAlertas();
    const [abierto, setAbierto] = useState(false);
    if (sinNada(alertas)) return null;
    const a = alertas as AlertasDocumentos;
    const criticos = a.criticos + a.lotes.sin_confirmar.criticos + a.lotes.en_terreno.criticos;
    const grupos = agruparPorEtapa(a.items);
    const lotes = [
        ...a.lotes.sin_confirmar.items.map(l => ({ ...l, motivo: 'sin confirmar por el portador' })),
        ...a.lotes.en_terreno.items.map(l => ({ ...l, motivo: 'en terreno' })),
    ];

    return (
        <div className={cn('rounded-2xl border px-3 py-2 mb-3', criticos > 0 ? 'border-red-200 bg-red-50/60 dark:border-red-800/60 dark:bg-red-500/5' : 'border-amber-200 bg-amber-50/60 dark:border-amber-800/60 dark:bg-amber-500/5')}>
            <Button variant="ghost" size="sm" className="w-full justify-start px-1 h-auto py-1" onClick={() => setAbierto(v => !v)} aria-expanded={abierto}>
                {abierto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <AlertTriangle className={cn('h-4 w-4 shrink-0', criticos > 0 ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300')} />
                <span className="text-sm font-semibold text-brand-dark text-left">
                    {a.total} documento{a.total === 1 ? '' : 's'} sin firmar fuera de plazo
                    {lotes.length ? ` · ${lotes.length} lote${lotes.length === 1 ? '' : 's'} atascado${lotes.length === 1 ? '' : 's'}` : ''}
                    {criticos > 0 ? ` · ${criticos} crítico${criticos === 1 ? '' : 's'}` : ''}
                </span>
            </Button>
            <div className="flex flex-wrap gap-1.5 px-1 pb-1">
                {(Object.keys(ETAPA_LABEL) as (keyof typeof ETAPA_LABEL)[]).filter(e => a.por_etapa[e].total > 0).map(e => (
                    <Chip key={e} tone={a.por_etapa[e].criticos > 0 ? 'danger' : 'warning'} label={`${ETAPA_LABEL[e]}: ${a.por_etapa[e].total}`} />
                ))}
            </div>

            {abierto && (
                <div className="mt-2 space-y-3">
                    {grupos.map(g => (
                        <div key={g.etapa}>
                            <p className="text-micro font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                                <FileWarning className="h-3 w-3" /> {ETAPA_LABEL[g.etapa]} · {ETAPA_ACCION[g.etapa]}
                            </p>
                            <ul className="mt-1 space-y-0.5">
                                {g.items.map(i => (
                                    <li key={i.documento_id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-card/70 px-2 py-1 text-xs">
                                        <span className="font-semibold text-brand-dark truncate">{i.trabajador.nombre}</span>
                                        <span className="text-muted-foreground truncate">{i.tipo_nombre}{i.obra_nombre ? ` · ${i.obra_nombre}` : ''}{i.portador_nombre ? ` · con ${i.portador_nombre}` : ''}</span>
                                        <span className="ml-auto"><Dias dias={i.dias} critical={i.critical} /></span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                    {lotes.length > 0 && (
                        <div>
                            <p className="text-micro font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Truck className="h-3 w-3" /> Lotes atascados</p>
                            <ul className="mt-1 space-y-0.5">
                                {lotes.map(l => (
                                    <li key={`${l.motivo}-${l.lote_id}`} className="flex flex-wrap items-center gap-x-2 rounded-lg bg-card/70 px-2 py-1 text-xs">
                                        <span className="font-semibold text-brand-dark">Lote #{l.lote_id}</span>
                                        <span className="text-muted-foreground">{l.portador_nombre || '(usuario eliminado)'} · {l.documentos} doc{l.documentos === 1 ? '' : 's'} · {l.motivo}</span>
                                        <span className="ml-auto flex items-center gap-2">
                                            <Dias dias={l.dias} critical={l.critical} />
                                            {onAbrirLote && <Button size="sm" variant="ghost" onClick={() => onAbrirLote(l.lote_id)}>Abrir</Button>}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
