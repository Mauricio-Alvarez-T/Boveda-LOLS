import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Lock, X } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { IconButton } from '../../ui/IconButton';
import { usePosicionFlotante } from '../../../hooks/usePosicionFlotante';
import { useCierreExterno } from '../../../hooks/useCierreExterno';
import {
    GRUPOS, ETIQUETA_NADA, nivelDe, type ItemPantalla, type Pantalla,
} from '../../../config/permisosPantallas';
import { estiloCelda } from './estiloCelda';

/**
 * Una celda de la matriz de roles: el nivel del rol en esa pantalla. Al tocarla abre un flotante con
 * los niveles (cada uno dice qué agrega) y el ajuste fino permiso por permiso; los `$` y los delicados
 * solo se dan ahí, a mano.
 *
 * El flotante va en un portal: la matriz scrollea en horizontal y la página de Configuración anima con
 * `transform`, que haría `fixed` relativo a ese contenedor.
 */

const ANCHO = 360;

interface Props {
    pantalla: Pantalla;
    rolNombre: string;
    perms: ReadonlySet<string>;
    /** Difiere de lo guardado. */
    cambiado: boolean;
    /** Super Admin: siempre todo, no se abre. */
    bloqueado?: boolean;
    /** Sin `usuarios.permisos.gestionar`: se puede mirar, no cambiar. */
    soloLectura: boolean;
    onNivel: (nivel: number) => void;
    onAlternar: (clave: string) => void;
}

export const CeldaNivel: React.FC<Props> = ({
    pantalla, rolNombre, perms, cambiado, bloqueado, soloLectura, onNivel, onAlternar,
}) => {
    const [abierto, setAbierto] = useState(false);
    const cerrar = () => setAbierto(false);
    const { disparadorRef, flotanteRef, pos, medir } = usePosicionFlotante<HTMLButtonElement>({
        abierto, alCerrar: cerrar, variante: 'tooltip', altoMax: 560, separacion: 6,
    });
    const anclaRef = useCierreExterno<HTMLDivElement>({ abierto, alCerrar: cerrar, extras: [flotanteRef], escape: true });

    const estado = nivelDe(perms, pantalla);
    const total = pantalla.niveles.length;

    if (bloqueado) {
        return (
            <div className="flex h-10 w-full items-center justify-center gap-1 rounded-control bg-muted text-sm text-muted-foreground">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Todo
            </div>
        );
    }

    const angosto = typeof window !== 'undefined' && window.innerWidth < 640;
    const estilo: React.CSSProperties | undefined = pos ? {
        position: 'fixed',
        ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }),
        maxHeight: pos.maxHeight,
        ...(angosto ? {} : { left: Math.max(12, Math.min(pos.left, window.innerWidth - ANCHO - 12)), width: ANCHO }),
    } : undefined;

    const grupo = GRUPOS.find(g => g.id === pantalla.grupo);
    const base = pantalla.items.filter(it => !it.marca);
    const dinero = pantalla.items.filter(it => it.marca === 'dinero');
    const delicados = pantalla.items.filter(it => it.marca === 'delicado');

    const opciones = [
        {
            nivel: 0, etiqueta: ETIQUETA_NADA,
            detalle: pantalla.puerta ? `No ve esta pantalla y se apaga todo ${grupo?.nombre}.` : 'No ve esta pantalla.',
        },
        ...pantalla.niveles.map((n, idx) => ({
            nivel: idx + 1, etiqueta: n.etiqueta,
            detalle: pantalla.acumulativa && idx > 0 ? `Lo anterior, y además: ${n.agrega.toLowerCase()}.` : `${n.agrega}.`,
        })),
    ];

    return (
        <div ref={anclaRef} className="w-full">
            {/* eslint-disable-next-line no-restricted-syntax -- celda de grilla densa: el color ES el dato (nivel), no un botón de acción */}
            <button
                ref={disparadorRef}
                type="button"
                onClick={() => { if (abierto) cerrar(); else { medir(); setAbierto(true); } }}
                aria-haspopup="dialog"
                aria-expanded={abierto}
                aria-label={`${pantalla.nombre}, ${rolNombre}: ${estado.etiqueta}${cambiado ? ' (sin guardar)' : ''}`}
                className={cn(
                    'flex h-10 w-full items-center justify-center gap-1 rounded-control px-2 text-sm transition-colors duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50',
                    estiloCelda(estado.nivel, total),
                    estado.nivel === 0 ? 'hover:border-brand-primary/60' : 'hover:brightness-95',
                    cambiado && 'ring-2 ring-warning ring-offset-2 ring-offset-card',
                )}
            >
                <span>{estado.nivel === 0 ? '—' : estado.etiqueta}</span>
                {estado.dinero && <span className="font-bold text-amber-600 dark:text-amber-400" aria-hidden="true">$</span>}
                {estado.delicado && <Lock className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />}
            </button>

            {abierto && estilo && createPortal(
                <div
                    ref={flotanteRef}
                    role="dialog"
                    aria-label={`${pantalla.nombre} para ${rolNombre}`}
                    style={estilo}
                    className={cn(
                        'z-[200] flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl',
                        'animate-in fade-in slide-in-from-top-2 duration-150',
                        angosto && 'left-3 right-3',
                    )}
                >
                    <div className="flex items-start gap-3 border-b border-border px-4 py-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-ui font-semibold text-brand-dark">{pantalla.nombre}</p>
                            <p className="text-xs text-muted-foreground">{rolNombre}{soloLectura ? ' · solo lectura' : ''}</p>
                        </div>
                        <IconButton aria-label="Cerrar" icon={<X className="h-4 w-4" />} onClick={cerrar} />
                    </div>

                    <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
                        {estado.nivel === -1 && (
                            <p className="mb-2 rounded-control bg-warning/10 px-3 py-2 text-xs text-brand-dark">
                                Hoy está <strong>a medida</strong>: no calza con ningún nivel. Elegir uno lo reemplaza; o ajústalo abajo.
                            </p>
                        )}
                        <div role="radiogroup" aria-label="Nivel" className="flex flex-col gap-1">
                            {opciones.map(o => {
                                const sel = estado.nivel === o.nivel;
                                return (
                                    // eslint-disable-next-line no-restricted-syntax -- opción de radio a lo ancho (texto + detalle), no un botón de acción
                                    <button
                                        key={o.nivel}
                                        type="button"
                                        role="radio"
                                        aria-checked={sel}
                                        disabled={soloLectura}
                                        onClick={() => onNivel(o.nivel)}
                                        className={cn(
                                            'flex min-h-11 w-full items-start gap-3 rounded-control border px-3 py-2 text-left transition-colors duration-200',
                                            sel ? 'border-brand-primary bg-brand-primary/10' : 'border-transparent hover:bg-muted',
                                            'disabled:cursor-default disabled:hover:bg-transparent',
                                        )}
                                    >
                                        <span className={cn(
                                            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                                            sel ? 'border-brand-primary bg-brand-primary text-white' : 'border-border',
                                        )}>
                                            {sel && <Check className="h-3 w-3" strokeWidth={3} />}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-sm font-semibold text-brand-dark">{o.etiqueta}</span>
                                            <span className="block text-xs text-muted-foreground">{o.detalle}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <p className="mb-1 mt-4 px-1 text-section font-semibold text-brand-dark">Ajuste fino</p>
                        <ListaClaves items={base} perms={perms} soloLectura={soloLectura} onAlternar={onAlternar} />
                        {dinero.length > 0 && (
                            <>
                                <p className="mb-1 mt-3 px-1 text-xs font-semibold text-amber-700 dark:text-amber-400">$ Montos · solo a mano</p>
                                <ListaClaves items={dinero} perms={perms} soloLectura={soloLectura} onAlternar={onAlternar} />
                            </>
                        )}
                        {delicados.length > 0 && (
                            <>
                                <p className="mb-1 mt-3 flex items-center gap-1 px-1 text-xs font-semibold text-destructive">
                                    <Lock className="h-3 w-3" aria-hidden="true" /> Delicados · solo para quien corresponde
                                </p>
                                <ListaClaves items={delicados} perms={perms} soloLectura={soloLectura} onAlternar={onAlternar} delicado />
                            </>
                        )}
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
};

const ListaClaves: React.FC<{
    items: ItemPantalla[];
    perms: ReadonlySet<string>;
    soloLectura: boolean;
    onAlternar: (clave: string) => void;
    delicado?: boolean;
}> = ({ items, perms, soloLectura, onAlternar, delicado }) => (
    <div className="flex flex-col">
        {items.map(it => {
            const on = perms.has(it.clave);
            return (
                // eslint-disable-next-line no-restricted-syntax -- casilla a lo ancho de la fila (no hay primitivo Checkbox), estado por relleno + Check
                <button
                    key={it.clave}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    disabled={soloLectura}
                    onClick={() => onAlternar(it.clave)}
                    title={it.clave}
                    className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-sm text-brand-dark transition-colors duration-200 hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
                >
                    <span className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-200',
                        on
                            ? (delicado ? 'border-destructive bg-destructive text-white' : 'border-brand-primary bg-brand-primary text-white')
                            : 'border-border',
                    )}>
                        {on && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">{it.etiqueta}</span>
                </button>
            );
        })}
    </div>
);
