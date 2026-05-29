import React from 'react';
import { Check } from 'lucide-react';
import { usePermissionsEditor } from '../../hooks/usePermissionsEditor';
import { PermissionsTree } from './permissions/PermissionsTree';
import { StickyFooter } from './permissions/StickyFooter';
import { cn } from '../../utils/cn';
import type { PermNode } from '../../utils/permisosTree';

/**
 * Panel para editar los permisos asignados a un Rol (control binario).
 * Compone `<PermissionsTree>` + `<StickyFooter>` con un control checkbox
 * por fila. Toda la lógica de estado vive en `usePermissionsEditor`.
 *
 * El padre (Settings.tsx) lo envuelve en `<Modal size="full" noBodyPadding>`.
 */
interface Props {
    rolId: number;
    rolNombre: string;
    onClose: () => void;
}

const PermisosRolPanel: React.FC<Props> = ({ rolId, rolNombre, onClose }) => {
    const { state, actions } = usePermissionsEditor({
        mode: 'rol',
        rolId,
        onSaved: onClose,
    });

    if (state.loading) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                Cargando catálogo de permisos...
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Subtítulo con nombre del rol */}
            <div className="px-4 py-2 bg-gray-50 dark:bg-white/5 border-b border-border text-sm text-muted-foreground">
                Editando rol: <span className="font-semibold text-gray-800 dark:text-foreground">{rolNombre}</span>
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
                    onBulkToggle={actions.bulkToggle}
                    renderControl={(perm: PermNode) => (
                        <RolCheckbox
                            checked={state.permisosActivos.includes(perm.def.clave)}
                            onChange={() => actions.togglePermiso(perm.def.clave)}
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
                />
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────
// Checkbox visual del modo rol
// ─────────────────────────────────────────────────────────────────────────

interface RolCheckboxProps {
    checked: boolean;
    onChange: () => void;
}

const RolCheckbox: React.FC<RolCheckboxProps> = ({ checked, onChange }) => (
    <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onChange}
        className={cn(
            'w-9 h-9 rounded-md border-2 flex items-center justify-center transition-all',
            checked
                ? 'bg-primary border-primary text-white shadow-sm'
                : 'bg-card border-gray-300 dark:border-border hover:border-primary/50'
        )}
    >
        {checked && <Check className="w-5 h-5" strokeWidth={3} />}
    </button>
);

export default PermisosRolPanel;
