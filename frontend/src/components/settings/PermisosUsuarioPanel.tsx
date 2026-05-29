import React from 'react';
import { usePermissionsEditor } from '../../hooks/usePermissionsEditor';
import { PermissionsTree } from './permissions/PermissionsTree';
import { StickyFooter } from './permissions/StickyFooter';
import { cn } from '../../utils/cn';
import type { PermNode } from '../../utils/permisosTree';

/**
 * Panel para editar overrides de permisos de un Usuario (tristate).
 * - Concede: fuerza permiso aunque el rol no lo tenga.
 * - Defecto: hereda del rol (sin override).
 * - Deniega: bloquea aunque el rol lo conceda.
 *
 * Compone `<PermissionsTree>` con un control tristate por fila + status dot
 * que indica si el permiso es efectivo (verde/rojo). Toda la lógica vive en
 * `usePermissionsEditor`.
 */
interface Props {
    usuarioId: number;
    usuarioNombre: string;
    rolId: number;
    rolNombre: string;
    onClose: () => void;
}

const PermisosUsuarioPanel: React.FC<Props> = ({
    usuarioId,
    usuarioNombre,
    rolId,
    rolNombre,
    onClose,
}) => {
    const { state, actions } = usePermissionsEditor({
        mode: 'usuario',
        rolId,
        usuarioId,
        onSaved: onClose,
    });

    if (state.loading) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                Cargando overrides de permisos...
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Subtítulo con usuario + rol */}
            <div className="px-4 py-2 bg-gray-50 dark:bg-white/5 border-b border-border text-sm text-muted-foreground flex items-center justify-between flex-wrap gap-2">
                <div>
                    Editando: <span className="font-semibold text-gray-800 dark:text-foreground">{usuarioNombre}</span>
                    {' · '}
                    Rol base: <span className="font-semibold text-gray-800 dark:text-foreground">{rolNombre}</span>
                </div>
                <div className="text-xs text-muted-foreground italic">
                    Los overrides forzan/bloquean permisos sin importar el rol.
                </div>
            </div>

            {/* Árbol principal */}
            <div className="flex-1 min-h-0">
                <PermissionsTree
                    tree={state.tree}
                    activeSeccion={state.activeSeccion}
                    onSelectSeccion={actions.setActiveSeccion}
                    search={state.search}
                    onSearchChange={actions.setSearch}
                    modifiedClaves={state.modifiedClaves}
                    diffOnly={state.diffOnly}
                    onToggleDiffOnly={actions.toggleDiffOnly}
                    renderRowMeta={(perm: PermNode) => (
                        <EffectiveStatusDot effective={actions.isActive(perm.def.clave)} />
                    )}
                    renderControl={(perm: PermNode) => (
                        <TristatePill
                            value={actions.getOverrideTipo(perm.def.clave)}
                            rolDefault={state.rolePerms.includes(perm.def.clave)}
                            onChange={(tipo) => actions.setOverride(perm.def.clave, tipo)}
                        />
                    )}
                />
            </div>

            {/* Footer sticky con contador + botones */}
            <div className="border-t border-border bg-card px-4 py-3 shrink-0">
                <StickyFooter
                    pendingCount={state.pendingChangesCount}
                    saving={state.saving}
                    onCancel={onClose}
                    onSave={actions.save}
                    saveLabel="Guardar Overrides"
                />
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────
// Dot de status efectivo (verde = permitido, rojo = denegado)
// ─────────────────────────────────────────────────────────────────────────

const EffectiveStatusDot: React.FC<{ effective: boolean }> = ({ effective }) => (
    <span
        className={cn(
            'inline-block w-2.5 h-2.5 rounded-full',
            effective ? 'bg-green-500' : 'bg-red-400'
        )}
        title={effective ? 'Permitido' : 'Denegado'}
        aria-label={effective ? 'Permitido' : 'Denegado'}
    />
);

// ─────────────────────────────────────────────────────────────────────────
// Tristate Pill (Conceder / Defecto / Denegar)
// ─────────────────────────────────────────────────────────────────────────

interface TristateProps {
    value: 'grant' | 'deny' | 'default';
    rolDefault: boolean;
    onChange: (v: 'grant' | 'deny' | 'default') => void;
}

const TristatePill: React.FC<TristateProps> = ({ value, rolDefault, onChange }) => {
    return (
        <div className="inline-flex items-center bg-gray-100 dark:bg-white/10 p-0.5 rounded-lg" role="radiogroup">
            <button
                type="button"
                role="radio"
                aria-checked={value === 'grant'}
                onClick={() => onChange('grant')}
                className={cn(
                    'px-2.5 py-1 text-[11px] font-semibold rounded transition-all',
                    value === 'grant'
                        ? 'bg-green-500 text-white shadow'
                        : 'text-gray-600 dark:text-muted-foreground hover:bg-gray-200 dark:hover:bg-white/15'
                )}
            >
                Conceder
            </button>
            <button
                type="button"
                role="radio"
                aria-checked={value === 'default'}
                onClick={() => onChange('default')}
                className={cn(
                    'px-2.5 py-1 text-[11px] font-semibold rounded transition-all',
                    value === 'default'
                        ? 'bg-card text-gray-800 dark:text-foreground shadow'
                        : 'text-gray-600 dark:text-muted-foreground hover:bg-gray-200 dark:hover:bg-white/15'
                )}
                title={`Por defecto (rol ${rolDefault ? 'concede' : 'no concede'})`}
            >
                Defecto {rolDefault ? '✓' : '✗'}
            </button>
            <button
                type="button"
                role="radio"
                aria-checked={value === 'deny'}
                onClick={() => onChange('deny')}
                className={cn(
                    'px-2.5 py-1 text-[11px] font-semibold rounded transition-all',
                    value === 'deny'
                        ? 'bg-red-500 text-white shadow'
                        : 'text-gray-600 dark:text-muted-foreground hover:bg-gray-200 dark:hover:bg-white/15'
                )}
            >
                Denegar
            </button>
        </div>
    );
};

export default PermisosUsuarioPanel;
