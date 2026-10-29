import React, { useMemo, useState } from 'react';
import { Copy, Lock, Pencil, Trash2 } from 'lucide-react';
import type { RolMatriz, useMatrizRoles } from '../../../hooks/useMatrizRoles';
import { GRUPOS, PANTALLAS, ROL_SUPER_ADMIN, clavesPantalla, nivelDe } from '../../../config/permisosPantallas';
import { IconButton } from '../../ui/IconButton';
import { cn } from '../../../utils/cn';
import { CeldaNivel } from './CeldaNivel';
import { estiloCelda } from './estiloCelda';

/**
 * Configuración › Roles como MATRIZ (propuesta C, 2026-10-26): filas = pantallas de Bóveda, columnas =
 * roles, celda = nivel. Reemplazó la tabla de roles + el modal de 107 casillas (`PermisosRolPanel`).
 * Desde el 2026-10-28 es la vista «Todos los roles (tabla)» de `RolesPanel`, que la abre al lado de la vista
 * en frases (opción E) con el MISMO estado (`useMatrizRoles`): cambiar de vista no pierde lo no guardado, y el
 * pie de guardar, el formulario de rol y el borrado viven en el panel. Los permisos de cada persona: Usuarios.
 */

const unirConY = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

const LEYENDA: { etiqueta: string; nivel: number; total: number; texto: string }[] = [
    { etiqueta: '—', nivel: 0, total: 3, texto: 'No la ve' },
    { etiqueta: 'Mira', nivel: 1, total: 3, texto: 'Ve la pantalla' },
    { etiqueta: 'Trabaja', nivel: 2, total: 3, texto: 'Lo del día a día' },
    { etiqueta: 'Todo', nivel: 3, total: 3, texto: 'Incluye borrar y configurar' },
    { etiqueta: 'A medida', nivel: -1, total: 3, texto: 'Una mezcla propia' },
];

interface Props {
    editor: ReturnType<typeof useMatrizRoles>;
    soloLectura: boolean;
    puedeEditar: boolean;
    puedeBorrar: boolean;
    onEditar: (rol: RolMatriz) => void;
    onBorrar: (rol: RolMatriz) => void;
}

const MatrizRoles: React.FC<Props> = ({ editor, soloLectura, puedeEditar, puedeBorrar, onEditar, onBorrar }) => {
    const { state, actions } = editor;
    const [soloDiferencias, setSoloDiferencias] = useState(false);

    const editables = state.roles.filter(r => r.id !== ROL_SUPER_ADMIN);

    const grupos = useMemo(() => GRUPOS.map(g => ({
        ...g,
        pantallas: PANTALLAS.filter(p => p.grupo === g.id).filter(p => {
            if (!soloDiferencias) return true;
            const firmas = new Set(editables.map(r => {
                const e = nivelDe(state.permsDe(r.id), p);
                return `${e.nivel}${e.dinero ? '$' : ''}${e.delicado ? '!' : ''}`;
            }));
            return firmas.size > 1;
        }),
    })).filter(g => g.pantallas.length > 0), [soloDiferencias, editables, state]);

    const gemelos = state.gemelos[0];

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="max-w-2xl text-ui text-muted-foreground">
                    Todos los roles de un vistazo. Toca una celda para ver qué incluye y cambiar el nivel.
                    {soloLectura && ' Puedes mirar, pero cambiar permisos requiere «Cambiar permisos».'}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    {/* eslint-disable-next-line no-restricted-syntax -- interruptor con texto (no hay primitivo Switch) */}
                    <button
                        type="button"
                        role="switch"
                        aria-checked={soloDiferencias}
                        onClick={() => setSoloDiferencias(v => !v)}
                        className="inline-flex min-h-11 items-center gap-3 rounded-full border border-border bg-card py-1 pl-4 pr-1.5 text-sm text-brand-dark transition-colors duration-200 hover:bg-muted"
                    >
                        Solo donde los roles difieren
                        <span className={cn('relative h-7 w-12 rounded-full transition-colors duration-200', soloDiferencias ? 'bg-brand-primary' : 'bg-muted-foreground/40')}>
                            <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all duration-200', soloDiferencias ? 'left-6' : 'left-1')} />
                        </span>
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                {LEYENDA.map(l => (
                    <span key={l.etiqueta} className="inline-flex items-center gap-2">
                        <span className={cn('inline-flex h-6 min-w-14 items-center justify-center rounded-md px-2', estiloCelda(l.nivel, l.total))}>{l.etiqueta}</span>
                        {l.texto}
                    </span>
                ))}
                <span className="inline-flex items-center gap-1"><span className="font-bold text-amber-600 dark:text-amber-400">$</span> ve montos</span>
                <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5 text-destructive" aria-hidden="true" /> tiene permisos delicados</span>
            </div>

            {gemelos && (
                <div className="flex items-start gap-3 rounded-card border border-warning/50 bg-warning/10 px-4 py-3">
                    <Copy className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    <div className="text-sm">
                        <p className="font-semibold text-brand-dark">{unirConY(gemelos.map(r => r.nombre))} tienen hoy los mismos permisos.</p>
                        <p className="text-muted-foreground">Son roles separados: un cambio en uno no se copia a los otros.</p>
                    </div>
                </div>
            )}

            {/* Scroll propio en los dos ejes: así el encabezado de roles queda fijo arriba al bajar y la
                columna «Pantalla» fija a la izquierda al correr a los lados. */}
            <div className="max-h-[72dvh] overflow-auto overscroll-contain rounded-card border border-border bg-card">
                <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
                    <thead>
                        <tr>
                            <th scope="col" className="sticky left-0 top-0 z-30 w-40 min-w-40 border-r border-white/20 bg-brand-primary px-4 py-3 text-left align-bottom font-semibold text-white sm:w-56 sm:min-w-56">
                                Pantalla
                            </th>
                            {state.roles.map(r => {
                                const esSA = r.id === ROL_SUPER_ADMIN;
                                const personas = r.usuarios_count ?? 0;
                                return (
                                    <th key={r.id} scope="col" className="sticky top-0 z-20 min-w-28 border-l border-white/20 bg-brand-primary px-2 py-2 align-bottom font-semibold text-white">
                                        <div className="flex flex-col items-center gap-0.5 text-center">
                                            <span className="leading-tight">{r.nombre}</span>
                                            <span className="text-xs font-normal opacity-90">{personas} {personas === 1 ? 'persona' : 'personas'}</span>
                                            {!esSA && (puedeEditar || (puedeBorrar && personas === 0)) && (
                                                <span className="flex gap-0.5">
                                                    {puedeEditar && (
                                                        <IconButton
                                                            size="sm"
                                                            aria-label={`Editar el rol ${r.nombre}`}
                                                            icon={<Pencil className="h-3.5 w-3.5" />}
                                                            className="text-white/80 hover:bg-white/15 hover:text-white dark:hover:bg-white/15"
                                                            onClick={() => onEditar(r)}
                                                        />
                                                    )}
                                                    {puedeBorrar && personas === 0 && (
                                                        <IconButton
                                                            size="sm"
                                                            aria-label={`Borrar el rol ${r.nombre}`}
                                                            icon={<Trash2 className="h-3.5 w-3.5" />}
                                                            className="text-white/80 hover:bg-white/15 hover:text-white"
                                                            onClick={() => onBorrar(r)}
                                                        />
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    {grupos.map(g => (
                        <tbody key={g.id}>
                            <tr>
                                <th scope="rowgroup" className="sticky left-0 z-10 border-r border-t border-border bg-muted px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-brand-dark">
                                    {g.nombre}
                                </th>
                                <td colSpan={state.roles.length} className="border-t border-border bg-muted" />
                            </tr>
                            {g.pantallas.map(p => (
                                <tr key={p.id}>
                                    <th scope="row" className="sticky left-0 z-10 border-r border-t border-border bg-card px-4 py-2 text-left font-normal text-brand-dark">
                                        <span className="text-ui">{p.nombre}</span>
                                        {p.dinero && <span className="ml-1 font-bold text-amber-600 dark:text-amber-400" aria-label="montos">$</span>}
                                    </th>
                                    {state.roles.map(r => (
                                        <td key={r.id} className="border-l border-t border-border px-2 py-1.5">
                                            <CeldaNivel
                                                pantalla={p}
                                                rolNombre={r.nombre}
                                                perms={state.permsDe(r.id)}
                                                cambiado={state.cambioEn(r.id, clavesPantalla(p))}
                                                bloqueado={r.id === ROL_SUPER_ADMIN}
                                                soloLectura={soloLectura}
                                                onNivel={n => actions.setNivel(r.id, p, n)}
                                                onAlternar={c => actions.alternar(r.id, p, c)}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    ))}
                </table>
            </div>
        </div>
    );
};

export default MatrizRoles;
