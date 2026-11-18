import React, { useState } from 'react';
import { ChevronDown, EyeOff, PlusCircle } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cn } from '../../../utils/cn';
import { ETIQUETA_ESTADO } from '../reglas';
import type { EstadoObra } from '../tipos';

export interface ObraFuera {
    id: number;
    nombre: string;
    estado: EstadoObra;
    /** Lo que le falta para volver al sitio (vacío = se puede incluir de un toque). */
    faltan: number;
}

interface Props {
    obras: ObraFuera[];
    puedeEditar: boolean;
    /** Abre la obra en el panel (el sitio no la muestra: no hay dónde llevarla). */
    onVer: (id: number) => void;
    onIncluir: (id: number) => void;
}

/**
 * «Fuera del sitio (n)» (editor visual A2): las obras guardadas que el sitio no muestra (el puente no las pinta en
 * ninguna lista). Cada una con «Ver» (sus datos en el panel) e «Incluir» (en el borrador, hasta «Guardar»), o lo que
 * le falta. Plegada por defecto; filas de 44 px en el teléfono.
 */
export const BandejaFueraDelSitio: React.FC<Props> = ({ obras, puedeEditar, onVer, onIncluir }) => {
    const [abierta, setAbierta] = useState(false);
    if (!obras.length) return null;
    return (
        <section className="rounded-xl border border-border bg-card" aria-label="Obras fuera del sitio">
            <Button variant="ghost" className="h-11 w-full justify-between rounded-xl px-3 md:h-10" aria-expanded={abierta} onClick={() => setAbierta(a => !a)}
                leftIcon={<EyeOff className="h-4 w-4 text-muted-foreground" />} rightIcon={<ChevronDown className={cn('h-4 w-4 transition-transform', abierta && 'rotate-180')} />}>
                <span className="mr-auto text-sm font-semibold">Fuera del sitio ({obras.length})</span>
            </Button>
            {abierta && (
                <ul className="flex flex-col divide-y divide-border border-t border-border">
                    {obras.map(o => (
                        <li key={o.id} className="flex items-center gap-2 px-3 py-2">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-brand-dark">{o.nombre}</p>
                                <p className="text-caption text-muted-foreground">
                                    {ETIQUETA_ESTADO[o.estado]}{o.faltan ? ` · le falta${o.faltan === 1 ? '' : 'n'} ${o.faltan} dato${o.faltan === 1 ? '' : 's'}` : ''}
                                </p>
                            </div>
                            <Button size="sm" variant="ghost" className="h-11 px-3 md:h-8" onClick={() => onVer(o.id)}>Ver</Button>
                            {puedeEditar && (
                                <Button size="sm" variant="secondary" className="h-11 px-3 md:h-8" leftIcon={<PlusCircle className="h-3.5 w-3.5" />}
                                    disabled={o.faltan > 0} title={o.faltan ? '«Ver» para completar lo que le falta' : undefined} onClick={() => onIncluir(o.id)}>
                                    Incluir
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default BandejaFueraDelSitio;
