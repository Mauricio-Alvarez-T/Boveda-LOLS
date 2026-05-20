/**
 * Utilidades puras para transformar el catálogo plano de permisos en árbol
 * jerárquico (sección → subsección → permiso) y aplicar filtros (search,
 * diff-only). Sin side effects ni dependencias de React.
 */

import {
    PERMISO_HIERARCHY,
    SECCIONES_META,
    FALLBACK_ENTRY,
    type HierarchyEntry,
    type Seccion,
} from '../config/permisosHierarchy';

export interface PermissionDefinition {
    clave: string;
    nombre: string;
    descripcion: string;
}

export interface CatalogoGrouped {
    [modulo: string]: PermissionDefinition[];
}

export interface PermNode {
    def: PermissionDefinition;
    entry: HierarchyEntry;
    /** Cacheado al construir el árbol — evita recomputar `isActive` en cada filter. */
    active: boolean;
}

export interface SubseccionNode {
    nombre: string;
    perms: PermNode[];
    activeCount: number;
}

export interface SeccionNode {
    seccion: Seccion;
    label: string;
    icon: string;
    subsecciones: SubseccionNode[];
    total: number;
    active: number;
    hasFinanciero: boolean;
    hasCritico: boolean;
}

/**
 * Aplana el catálogo agrupado por módulo a un array de PermissionDefinition.
 */
export function flattenCatalogo(catalogo: CatalogoGrouped): PermissionDefinition[] {
    return Object.values(catalogo).flat();
}

/**
 * Resuelve la entrada de jerarquía para una clave. Si no está mapeada,
 * devuelve `FALLBACK_ENTRY` para que el permiso aún aparezca en UI.
 */
export function resolveHierarchy(clave: string): HierarchyEntry {
    return PERMISO_HIERARCHY[clave] ?? FALLBACK_ENTRY;
}

/**
 * Ordena subsecciones según el orden declarado en `SECCIONES_META`.
 * Las no listadas van al final por orden alfabético.
 */
function ordenarSubsecciones(seccion: Seccion, subsecciones: SubseccionNode[]): SubseccionNode[] {
    const ordenDeclarado = SECCIONES_META[seccion].subseccionesOrden;
    return [...subsecciones].sort((a, b) => {
        const ia = ordenDeclarado.indexOf(a.nombre);
        const ib = ordenDeclarado.indexOf(b.nombre);
        // Si ambas están en el orden declarado, usa ese orden.
        if (ia !== -1 && ib !== -1) return ia - ib;
        // Si solo una está, la declarada va primero.
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        // Si ninguna está, alfabético.
        return a.nombre.localeCompare(b.nombre);
    });
}

/**
 * Construye el árbol jerárquico completo a partir del catálogo + un predicado
 * que determina si un permiso está "activo" (concedido en el rol o efectivo
 * en el usuario tras overrides). El predicado es lo que diferencia el modo
 * Rol del modo Usuario.
 */
export function buildTree(
    catalogo: CatalogoGrouped,
    isActive: (clave: string) => boolean
): SeccionNode[] {
    const perms = flattenCatalogo(catalogo);

    // Agrupar por sección > subsección
    const seccionMap = new Map<Seccion, Map<string, PermNode[]>>();
    for (const def of perms) {
        const entry = resolveHierarchy(def.clave);
        const node: PermNode = { def, entry, active: isActive(def.clave) };
        if (!seccionMap.has(entry.seccion)) seccionMap.set(entry.seccion, new Map());
        const subMap = seccionMap.get(entry.seccion)!;
        if (!subMap.has(entry.subseccion)) subMap.set(entry.subseccion, []);
        subMap.get(entry.subseccion)!.push(node);
    }

    // Construir nodos finales en orden de SECCIONES_META
    const result: SeccionNode[] = [];
    const todasLasSecciones = Object.keys(SECCIONES_META) as Seccion[];
    todasLasSecciones.sort((a, b) => SECCIONES_META[a].orden - SECCIONES_META[b].orden);

    for (const seccion of todasLasSecciones) {
        const subMap = seccionMap.get(seccion);
        if (!subMap || subMap.size === 0) continue;

        const subsecciones: SubseccionNode[] = [];
        let total = 0;
        let active = 0;
        let hasFinanciero = false;
        let hasCritico = false;

        for (const [subNombre, permsList] of subMap.entries()) {
            // Orden interno por verbo (Ver→Crear→Editar→Eliminar→Aprobar→...)
            const ordenVerbo: Record<string, number> = {
                ver: 1, crear: 2, editar: 3, eliminar: 4, aprobar: 5,
                enviar: 6, exportar: 7, otro: 8,
            };
            const permsOrdenados = [...permsList].sort((a, b) => {
                const va = ordenVerbo[a.entry.verbo] ?? 99;
                const vb = ordenVerbo[b.entry.verbo] ?? 99;
                if (va !== vb) return va - vb;
                return a.def.nombre.localeCompare(b.def.nombre);
            });
            const activos = permsOrdenados.filter(p => p.active).length;
            subsecciones.push({ nombre: subNombre, perms: permsOrdenados, activeCount: activos });
            total += permsOrdenados.length;
            active += activos;
            for (const p of permsOrdenados) {
                if (p.entry.sensible === 'financiero') hasFinanciero = true;
                if (p.entry.sensible === 'critico') hasCritico = true;
            }
        }

        result.push({
            seccion,
            label: SECCIONES_META[seccion].label,
            icon: SECCIONES_META[seccion].icon,
            subsecciones: ordenarSubsecciones(seccion, subsecciones),
            total,
            active,
            hasFinanciero,
            hasCritico,
        });
    }

    return result;
}

/**
 * Filtra el árbol por una query de búsqueda (case-insensitive, sin acentos).
 * Match contra clave + nombre + descripción del permiso.
 * Vacío o solo whitespace → devuelve árbol completo (no filtra).
 * Subsecciones sin matches se eliminan; secciones sin subsecciones también.
 */
export function filterTree(tree: SeccionNode[], search: string): SeccionNode[] {
    const q = search.trim().toLowerCase();
    if (!q) return tree;

    const normalize = (s: string) =>
        s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const qNorm = normalize(q);

    const matchesPerm = (p: PermNode): boolean => {
        return (
            normalize(p.def.clave).includes(qNorm) ||
            normalize(p.def.nombre).includes(qNorm) ||
            normalize(p.def.descripcion || '').includes(qNorm)
        );
    };

    const filtered: SeccionNode[] = [];
    for (const sec of tree) {
        const subs: SubseccionNode[] = [];
        let secActive = 0;
        let secTotal = 0;
        for (const sub of sec.subsecciones) {
            const matchedPerms = sub.perms.filter(matchesPerm);
            if (matchedPerms.length > 0) {
                const activeCount = matchedPerms.filter(p => p.active).length;
                subs.push({ nombre: sub.nombre, perms: matchedPerms, activeCount });
                secActive += activeCount;
                secTotal += matchedPerms.length;
            }
        }
        if (subs.length > 0) {
            filtered.push({ ...sec, subsecciones: subs, active: secActive, total: secTotal });
        }
    }
    return filtered;
}

/**
 * Filtra el árbol mostrando sólo permisos cuyo clave esté en `modifiedClaves`.
 * Útil para el toggle "Solo modificados" del modo Usuario (overrides).
 */
export function diffTree(tree: SeccionNode[], modifiedClaves: Set<string>): SeccionNode[] {
    if (modifiedClaves.size === 0) return [];

    const result: SeccionNode[] = [];
    for (const sec of tree) {
        const subs: SubseccionNode[] = [];
        let secActive = 0;
        let secTotal = 0;
        for (const sub of sec.subsecciones) {
            const filteredPerms = sub.perms.filter(p => modifiedClaves.has(p.def.clave));
            if (filteredPerms.length > 0) {
                const activeCount = filteredPerms.filter(p => p.active).length;
                subs.push({ nombre: sub.nombre, perms: filteredPerms, activeCount });
                secActive += activeCount;
                secTotal += filteredPerms.length;
            }
        }
        if (subs.length > 0) {
            result.push({ ...sec, subsecciones: subs, active: secActive, total: secTotal });
        }
    }
    return result;
}

/**
 * Total de permisos en el árbol. Útil para badges.
 */
export function countTotal(tree: SeccionNode[]): number {
    return tree.reduce((acc, s) => acc + s.total, 0);
}

/**
 * Total de permisos activos en el árbol.
 */
export function countActive(tree: SeccionNode[]): number {
    return tree.reduce((acc, s) => acc + s.active, 0);
}
