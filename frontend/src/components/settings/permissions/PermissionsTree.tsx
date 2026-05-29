import React, { useMemo } from 'react';
import { cn } from '../../../utils/cn';
import { PermissionsSidebar } from './PermissionsSidebar';
import { PermissionsSearchBar } from './PermissionsSearchBar';
import { PermRow } from './PermRow';
import { BulkActions } from './BulkActions';
import type { PermNode, SeccionNode } from '../../../utils/permisosTree';
import type { Seccion } from '../../../config/permisosHierarchy';

/**
 * Componente compartido entre PermisosRolPanel y PermisosUsuarioPanel.
 * Renderiza la jerarquía completa (sidebar + main) con render-prop por fila
 * para que cada modo aporte su propio control (checkbox vs tristate).
 */
interface Props {
    tree: SeccionNode[];
    activeSeccion: Seccion;
    onSelectSeccion: (s: Seccion) => void;
    search: string;
    onSearchChange: (v: string) => void;

    /** Render del control de la derecha por fila. */
    renderControl: (perm: PermNode) => React.ReactNode;
    /** Render del meta slot opcional (status dot en modo usuario). */
    renderRowMeta?: (perm: PermNode) => React.ReactNode;

    /** Set de claves modificadas — la fila muestra borde izquierdo amber si está acá. */
    modifiedClaves?: Set<string>;

    /** Toggle del filtro "Solo modificados". Si no se provee, no se muestra el toggle. */
    diffOnly?: boolean;
    onToggleDiffOnly?: () => void;

    /** Bulk ops opcional (sólo modo rol). */
    onBulkToggle?: (claves: string[], activate: boolean) => void;
}

export const PermissionsTree: React.FC<Props> = ({
    tree,
    activeSeccion,
    onSelectSeccion,
    search,
    onSearchChange,
    renderControl,
    renderRowMeta,
    modifiedClaves,
    diffOnly,
    onToggleDiffOnly,
    onBulkToggle,
}) => {
    // Cuando search está activo, los resultados pueden no incluir la activeSeccion.
    // En ese caso, mostrar TODOS los matches (en lugar de uno solo) — UX más clara.
    const showAllSections = search.trim().length > 0 || diffOnly === true;

    // Sección activa (o vacío si no hay match)
    const activeSection = useMemo(
        () => tree.find(s => s.seccion === activeSeccion),
        [tree, activeSeccion]
    );

    return (
        <div className="flex flex-col md:flex-row h-full min-h-0">
            {/* ─── Mobile: search en topbar ─── */}
            <div className="md:hidden border-b border-border p-3">
                <PermissionsSearchBar value={search} onChange={onSearchChange} />
                {onToggleDiffOnly && (
                    <button
                        type="button"
                        onClick={onToggleDiffOnly}
                        className={cn(
                            'mt-2 w-full text-xs px-3 py-1.5 rounded border transition-colors',
                            diffOnly
                                ? 'bg-amber-100 dark:bg-amber-950/40 border-amber-300 dark:border-amber-900 text-amber-900 dark:text-amber-300'
                                : 'bg-card border-gray-200 dark:border-border text-gray-600 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-white/5'
                        )}
                    >
                        {diffOnly ? '✓ Solo modificados' : 'Mostrar solo modificados'}
                    </button>
                )}
            </div>

            {/* ─── Desktop: sidebar ─── */}
            <aside className="hidden md:flex md:flex-col md:w-64 border-r border-border bg-gray-50/50 dark:bg-white/5 shrink-0">
                <div className="p-3 border-b border-border bg-card">
                    <PermissionsSearchBar value={search} onChange={onSearchChange} autoFocus />
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <PermissionsSidebar
                        tree={tree}
                        activeSeccion={activeSeccion}
                        onSelect={onSelectSeccion}
                    />
                </div>
                {onToggleDiffOnly && (
                    <div className="p-3 border-t border-border bg-card">
                        <button
                            type="button"
                            onClick={onToggleDiffOnly}
                            className={cn(
                                'w-full text-xs px-3 py-2 rounded border transition-colors text-left',
                                diffOnly
                                    ? 'bg-amber-100 dark:bg-amber-950/40 border-amber-300 dark:border-amber-900 text-amber-900 dark:text-amber-300 font-semibold'
                                    : 'bg-card border-gray-200 dark:border-border text-gray-600 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-white/5'
                            )}
                            aria-pressed={diffOnly}
                        >
                            {diffOnly ? '✓ ' : ''}Solo modificados {modifiedClaves && modifiedClaves.size > 0 ? `(${modifiedClaves.size})` : ''}
                        </button>
                    </div>
                )}
            </aside>

            {/* ─── Main panel ─── */}
            <main className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                {tree.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        <p className="text-sm">
                            {search.trim()
                                ? `Sin resultados para "${search}"`
                                : diffOnly
                                ? 'No hay cambios pendientes para mostrar'
                                : 'No hay permisos para mostrar'}
                        </p>
                    </div>
                ) : showAllSections ? (
                    tree.map(sec => (
                        <SectionBlock
                            key={sec.seccion}
                            sec={sec}
                            renderControl={renderControl}
                            renderRowMeta={renderRowMeta}
                            modifiedClaves={modifiedClaves}
                            onBulkToggle={onBulkToggle}
                        />
                    ))
                ) : activeSection ? (
                    <SectionBlock
                        sec={activeSection}
                        renderControl={renderControl}
                        renderRowMeta={renderRowMeta}
                        modifiedClaves={modifiedClaves}
                        onBulkToggle={onBulkToggle}
                    />
                ) : (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                        Selecciona una sección en el menú lateral
                    </div>
                )}
            </main>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────
// Sub-componente local: bloque por sección con todas sus subsecciones.
// ─────────────────────────────────────────────────────────────────────────

interface SectionBlockProps {
    sec: SeccionNode;
    renderControl: (perm: PermNode) => React.ReactNode;
    renderRowMeta?: (perm: PermNode) => React.ReactNode;
    modifiedClaves?: Set<string>;
    onBulkToggle?: (claves: string[], activate: boolean) => void;
}

const SectionBlock: React.FC<SectionBlockProps> = ({
    sec,
    renderControl,
    renderRowMeta,
    modifiedClaves,
    onBulkToggle,
}) => {
    return (
        <section aria-labelledby={`sec-${sec.seccion}`}>
            <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
                <h2 id={`sec-${sec.seccion}`} className="text-base font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
                    <span aria-hidden>{sec.icon}</span>
                    {sec.label}
                </h2>
                <span className="text-xs text-muted-foreground font-mono">
                    {sec.active} de {sec.total} activos
                </span>
            </header>
            <div>
                {sec.subsecciones.map(sub => (
                    <div key={sub.nombre} className="border-b border-gray-200 dark:border-border last:border-b-0">
                        <div className="px-4 py-2 bg-gray-50/70 dark:bg-white/5 flex items-center justify-between gap-3 border-y border-gray-200 dark:border-border">
                            <h3 className="text-xs font-bold text-gray-600 dark:text-muted-foreground uppercase tracking-wider">
                                {sub.nombre}
                                <span className="ml-2 text-[10px] font-mono text-gray-400 dark:text-muted-foreground/60">
                                    {sub.activeCount}/{sub.perms.length}
                                </span>
                            </h3>
                            {onBulkToggle && (
                                <BulkActions
                                    perms={sub.perms}
                                    onBulk={onBulkToggle}
                                    activeCount={sub.activeCount}
                                    total={sub.perms.length}
                                />
                            )}
                        </div>
                        <div className="bg-card">
                            {sub.perms.map(perm => (
                                <PermRow
                                    key={perm.def.clave}
                                    perm={perm}
                                    renderControl={renderControl}
                                    renderMeta={renderRowMeta}
                                    modified={modifiedClaves?.has(perm.def.clave)}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
};
