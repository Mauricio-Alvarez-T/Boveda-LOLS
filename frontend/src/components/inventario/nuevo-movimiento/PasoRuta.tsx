import React, { useMemo } from 'react';
import { ArrowRight, Info, Zap, ShieldAlert } from 'lucide-react';
import { SearchableSelect } from '../../ui/SearchableSelect';
import { formatBodegaConResponsable } from '../../../utils/formatBodega';
import type { Bodega } from '../../../types/entities';
import type { Origen, Destino, InferResult, WizardState } from '../../../utils/inferMovimiento';

type ObraLite = { id: number; nombre: string };

function encode(u: Origen | Destino | null): string | null {
    if (!u) return null;
    if (u.tipo === 'central') return 'central';
    return `${u.tipo === 'bodega' ? 'b' : 'o'}:${u.id}`;
}
function decode(v: string | number | null): Origen | null {
    if (v == null || v === '') return null;
    if (v === 'central') return { tipo: 'central' };
    const [t, id] = String(v).split(':');
    return { tipo: t === 'b' ? 'bodega' : 'obra', id: Number(id) };
}

/** Paso 1: elegir origen y destino. El sistema infiere el flujo y lo muestra. */
export const PasoRuta: React.FC<{
    state: WizardState;
    infer: InferResult;
    obras: ObraLite[];
    bodegas: Bodega[];
    onOrigen: (o: Origen | null) => void;
    onDestino: (d: Destino | null) => void;
    onToggleEnviarAhora: (v: boolean) => void;
    onToggleOrden: (v: boolean) => void;
    nombreUbi: (u: Origen | Destino | null) => string;
}> = ({ state, infer, obras, bodegas, onOrigen, onDestino, onToggleEnviarAhora, onToggleOrden, nombreUbi }) => {
    const bodegaOpts = useMemo(() => bodegas.map(b => ({ value: `b:${b.id}`, label: `Bodega · ${formatBodegaConResponsable(b)}` })), [bodegas]);
    const obraOpts = useMemo(() => obras.map(o => ({ value: `o:${o.id}`, label: `Obra · ${o.nombre}` })), [obras]);

    const origenOptions = useMemo(() => [{ value: 'central', label: 'Bodega central (sin origen fijo)' }, ...bodegaOpts, ...obraOpts], [bodegaOpts, obraOpts]);
    const destinoOptions = useMemo(() => [...bodegaOpts, ...obraOpts], [bodegaOpts, obraOpts]);

    const rutaError = infer.errores.find(e => e.includes('origen') || e.includes('central') || e.includes('permiso'));

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-end gap-3">
                <SearchableSelect
                    label="¿De dónde sale?"
                    options={origenOptions}
                    value={encode(state.origen)}
                    onChange={v => onOrigen(decode(v))}
                    placeholder="Origen..."
                />
                <ArrowRight className="hidden md:block h-5 w-5 text-muted-foreground/40 mb-3" />
                <SearchableSelect
                    label="¿A dónde va?"
                    options={destinoOptions}
                    value={encode(state.destino)}
                    onChange={v => { const d = decode(v); onDestino(d && d.tipo !== 'central' ? d : null); }}
                    placeholder="Destino..."
                />
            </div>

            {state.origen && state.destino && (
                rutaError ? (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 px-3 py-2.5 text-sm text-red-700 dark:text-red-300">
                        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" /> <span>{rutaError}</span>
                    </div>
                ) : infer.tipoFlujo ? (
                    <div className="flex items-start gap-2 rounded-xl border border-brand-primary/30 bg-brand-primary/5 px-3 py-2.5 text-sm">
                        <Info className="h-4 w-4 mt-0.5 shrink-0 text-brand-primary" />
                        <span className="text-brand-dark">
                            Esto será una <strong>{infer.tipoFlujoLabel}</strong>: {nombreUbi(state.origen)} → {nombreUbi(state.destino)}
                        </span>
                    </div>
                ) : null
            )}

            {(infer.togglesDisponibles.enviarAhora || infer.togglesDisponibles.ordenGerencia) && (
                <div className="space-y-2">
                    {infer.togglesDisponibles.enviarAhora && (
                        <label className="flex items-start gap-2.5 rounded-xl border border-border px-3 py-2.5 cursor-pointer hover:border-brand-primary/40 transition-colors">
                            <input type="checkbox" checked={state.enviarAhora} onChange={e => onToggleEnviarAhora(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-primary" />
                            <span className="text-sm">
                                <span className="font-bold text-brand-dark flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> Enviar ahora (envío directo)</span>
                                <span className="block text-caption text-muted-foreground">Despacha de inmediato, sin pasar por aprobación.</span>
                            </span>
                        </label>
                    )}
                    {infer.togglesDisponibles.ordenGerencia && (
                        <label className="flex items-start gap-2.5 rounded-xl border border-border px-3 py-2.5 cursor-pointer hover:border-brand-primary/40 transition-colors">
                            <input type="checkbox" checked={state.ordenGerencia} onChange={e => onToggleOrden(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-primary" />
                            <span className="text-sm">
                                <span className="font-bold text-brand-dark flex items-center gap-1"><ShieldAlert className="h-3.5 w-3.5" /> Orden de gerencia (omite aprobación)</span>
                                <span className="block text-caption text-muted-foreground">Bypass de aprobación y SoD. Queda registrado con tu nombre y motivo.</span>
                            </span>
                        </label>
                    )}
                </div>
            )}
        </div>
    );
};
