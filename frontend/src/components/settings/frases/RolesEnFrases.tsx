import React from 'react';
import { Copy, Lock, Pencil, ShieldCheck, Trash2, UsersRound } from 'lucide-react';
import type { RolMatriz, useMatrizRoles } from '../../../hooks/useMatrizRoles';
import { ROL_SUPER_ADMIN, clavesPantalla } from '../../../config/permisosPantallas';
import { enLista } from '../../../config/frasesPermisos';
import { Button } from '../../ui/Button';
import { cn } from '../../../utils/cn';
import { LeyendaFrases, PermisosEnFrases } from './PermisosEnFrases';

/**
 * Configuración › Roles «un rol a la vez, en frases» (opción E, Marcos 2026-10-28): el rol elegido arriba, con la
 * misma vista que los permisos de una persona (`PermisosEnFrases`). El estado de todos los roles (`useMatrizRoles`)
 * vive en `RolesPanel`: lo que se cambia en un rol queda marcado aunque se pase a otro, y el pie de guardar es uno solo.
 */
interface Props {
    editor: ReturnType<typeof useMatrizRoles>;
    rolId: number;
    onElegir: (id: number) => void;
    /** Nombres de las personas activas de cada rol (null = todavía no llega o no se pudo leer). */
    personas: Map<number, string[]> | null;
    soloLectura: boolean;
    puedeEditar: boolean;
    puedeBorrar: boolean;
    onEditar: (rol: RolMatriz) => void;
    onBorrar: (rol: RolMatriz) => void;
}

/**
 * «3 personas: Daphne, Matías y Paula Martínez. Lo que cambies acá le llega a todas.» La CANTIDAD es siempre
 * `usuarios_count` (el conteo exacto del backend); los nombres salen de GET /usuarios, que trae una página, así que
 * solo se nombran si calzan con esa cantidad.
 */
const textoPersonas = (rol: RolMatriz, nombres: string[] | undefined, esSA: boolean) => {
    const n = rol.usuarios_count ?? nombres?.length ?? 0;
    if (n === 0) return 'Nadie tiene este rol todavía.';
    const quienes = nombres && nombres.length === n ? `: ${enLista(nombres)}` : '';
    const llega = esSA ? '' : ` Lo que cambies acá le llega a ${n === 1 ? 'esa persona' : 'todas'}.`;
    return `${n} ${n === 1 ? 'persona' : 'personas'}${quienes}.${llega}`;
};

export const RolesEnFrases: React.FC<Props> = ({ editor, rolId, onElegir, personas, soloLectura, puedeEditar, puedeBorrar, onEditar, onBorrar }) => {
    const { state, actions } = editor;
    const rol = state.roles.find(r => r.id === rolId);
    if (!rol) return null;
    const esSA = rol.id === ROL_SUPER_ADMIN;
    const nombres = personas?.get(rol.id);
    const cuantas = rol.usuarios_count ?? nombres?.length ?? 0;
    const gemelos = state.gemelos.find(g => g.some(r => r.id === rol.id))?.filter(r => r.id !== rol.id) ?? [];
    const conCambios = new Set(state.cambiados.map(r => r.id));

    return (
        <div className="flex flex-col gap-4">
            <section aria-label={`Rol ${rol.nombre}`} className="rounded-card border border-border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Elegir rol">
                    {state.roles.map(r => {
                        const sel = r.id === rol.id;
                        return (
                            // eslint-disable-next-line no-restricted-syntax -- selector de rol: el elegido en verde (elemento seleccionado)
                            <button
                                key={r.id}
                                type="button"
                                aria-pressed={sel}
                                onClick={() => onElegir(r.id)}
                                className={cn(
                                    'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 sm:min-h-9',
                                    sel ? 'bg-brand-primary text-white' : 'border border-border bg-background text-foreground hover:bg-muted',
                                )}
                            >
                                {r.id === ROL_SUPER_ADMIN && <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
                                {r.nombre}
                                {conCambios.has(r.id) && (
                                    <span className={cn('h-2 w-2 rounded-full', sel ? 'bg-white' : 'bg-warning')} aria-label="con cambios sin guardar" />
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            {esSA ? <ShieldCheck className="h-5 w-5" aria-hidden="true" /> : <UsersRound className="h-5 w-5" aria-hidden="true" />}
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-title font-bold leading-tight tracking-title text-brand-dark break-words">Rol {rol.nombre}</h2>
                            <p className="mt-0.5 text-sm text-muted-foreground">{textoPersonas(rol, nombres, esSA)}</p>
                        </div>
                    </div>
                    {!esSA && (puedeEditar || (puedeBorrar && cuantas === 0)) && (
                        <div className="flex flex-wrap gap-2">
                            {puedeEditar && (
                                <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => onEditar(rol)}>Editar nombre</Button>
                            )}
                            {puedeBorrar && cuantas === 0 && (
                                <Button variant="destructive" size="sm" className="min-h-11 sm:min-h-9" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => onBorrar(rol)}>Borrar rol</Button>
                            )}
                        </div>
                    )}
                </div>

                {gemelos.length > 0 && (
                    <p className="mt-3 flex items-start gap-2 rounded-control border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-foreground">
                        <Copy className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                        <span>Hoy tiene los mismos permisos que {enLista(gemelos.map(r => r.nombre))}. Son roles separados: un cambio acá no se copia al otro.</span>
                    </p>
                )}
            </section>

            {esSA ? (
                <p className="rounded-card border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
                    El Super Administrador tiene todo, siempre, y no se edita.
                </p>
            ) : (
                <>
                    <LeyendaFrases conMarcas={false} soloLectura={soloLectura} />
                    {soloLectura && (
                        <p className="text-sm text-muted-foreground">Puedes mirar, pero cambiar permisos requiere «Cambiar permisos».</p>
                    )}
                    <PermisosEnFrases
                        key={rol.id}
                        perms={state.permsDe(rol.id)}
                        sinGuardarEn={p => state.cambioEn(rol.id, clavesPantalla(p))}
                        soloLectura={soloLectura}
                        onNivel={(p, n) => actions.setNivel(rol.id, p, n)}
                        onAlternar={(p, c) => actions.alternar(rol.id, p, c)}
                    />
                </>
            )}
        </div>
    );
};
