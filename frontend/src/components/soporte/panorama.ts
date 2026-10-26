import { SECCIONES_MENU, menuVisible, veBuzonIdeas, type ClaveMenu } from '../layout/menuLateral';
import { esSuperAdmin, vistaInventario, type VistaInventario } from '../dashboard/widgets/inventarioPerfil/perfil';
import { TEXTO_VISTA_INVENTARIO, filtrarUsuarios, rolesDeLista, type UsuarioSoporte } from './fichaUsuario';
import { DESCRIPCION_MENU, TEXTO_INICIO_GERENCIA, TEXTO_SIN_INVENTARIO } from './accesosPerfil';

/**
 * «Panorama» de Soporte · usuarios (Marcos 2026-10-26: «el panorama completo de lo que cada uno maneja»), solo para el
 * Super Administrador. Lógica PURA con test (`panorama.test.ts`); la pinta `PanoramaPermisos.tsx`.
 *
 * Una fila por persona activa (agrupadas por rol) y una columna por cada sección del menú lateral, en su orden
 * (`SECCIONES_MENU`), más «Comparte tu idea» (el botón del pie). La marca sale de las MISMAS reglas de la app, con los
 * permisos efectivos de cada persona (GET /api/soporte/panorama = lo que llevaría su token):
 *   - qué secciones ve: `menuVisible` (menuLateral.ts, la del Sidebar; la misma que usa la ficha);
 *   - «Comparte tu idea»: `veBuzonIdeas`;
 *   - qué Inicio le toca (la columna Inicio dice cuál, en vez de una marca: el Inicio lo ven todos): el de gerencia
 *     (`inicio.gerencia`, que el Super Administrador no ve en su Inicio) o, si no, la vista de la tarjeta Inventario
 *     (`vistaInventario`, perfil.ts), con el texto largo de la ficha (`TEXTO_VISTA_INVENTARIO`).
 */

/** Una persona del Panorama: la de la lista + sus permisos efectivos. */
export interface UsuarioPanorama extends UsuarioSoporte {
    efectivos: string[];
}

export type ClaveColumna = ClaveMenu | 'buzon_ideas';

export interface ColumnaPanorama {
    clave: ClaveColumna;
    label: string;
    /** Qué es esa sección (tooltip del encabezado). */
    descripcion: string;
}

/** Qué Inicio le toca, en una palabra (la columna Inicio). */
export type TipoInicio = 'superadmin' | 'gerencia' | 'leonardo' | 'jefatura' | 'obra' | 'general';

export const TEXTO_TIPO_INICIO: Record<TipoInicio, string> = {
    superadmin: 'Super Admin',
    gerencia: 'Gerencia',
    leonardo: 'Aprueba',
    jefatura: 'Jefatura',
    obra: 'Obra',
    general: 'General',
};

const TIPO_DE_VISTA: Record<VistaInventario, TipoInicio> = {
    superadmin: 'superadmin',
    leonardo: 'leonardo',
    jefatura: 'jefatura',
    obra: 'obra',
    otro: 'general',
};

export interface InicioPersona {
    tipo: TipoInicio;
    /** La palabra de la celda. */
    texto: string;
    /** El detalle (tooltip): lo de arriba del Inicio y la tarjeta Inventario, con los textos de la ficha. */
    detalle: string[];
}

export interface FilaPanorama {
    usuario: UsuarioPanorama;
    /** Por columna: ¿la ve? */
    ve: Record<ClaveColumna, boolean>;
    inicio: InicioPersona;
}

export interface GrupoPanorama {
    rol_id: number;
    rol_nombre: string;
    filas: FilaPanorama[];
}

export interface Panorama {
    columnas: ColumnaPanorama[];
    grupos: GrupoPanorama[];
    /** Por columna: cuántas de las personas mostradas la ven. */
    totales: Record<ClaveColumna, number>;
    /** Personas mostradas (con el filtro). */
    personas: number;
}

const DESCRIPCION_BUZON = 'El botón del pie del menú para mandar una idea de mejora (no lo ve quien revisa las ideas)';

/**
 * Las columnas: todas las secciones del menú, en su orden, y «Comparte tu idea» al final (como en el menú).
 * `etiquetaBuzon` = ETIQUETA_BUZON_IDEAS (ideasConfig.ts; no se importa aquí: arrastra íconos).
 */
export function columnasPanorama(etiquetaBuzon = 'Comparte tu idea'): ColumnaPanorama[] {
    return [
        ...SECCIONES_MENU.map(s => ({ clave: s.clave, label: s.label, descripcion: DESCRIPCION_MENU[s.clave] })),
        { clave: 'buzon_ideas', label: etiquetaBuzon, descripcion: DESCRIPCION_BUZON },
    ];
}

type Tiene = (permiso: string) => boolean;

/** Qué Inicio le toca a esa persona (las reglas de Dashboard.tsx y de la ficha). */
export function inicioDe(tiene: Tiene, u: Pick<UsuarioSoporte, 'rol_id' | 'bodega_id'>): InicioPersona {
    const conInventario = tiene('inventario.ver');
    const vista = vistaInventario(tiene, u);
    const tarjeta = `Tarjeta de Inventario: ${conInventario ? TEXTO_VISTA_INVENTARIO[vista] : TEXTO_SIN_INVENTARIO}`;
    // El Super Administrador no ve el Inicio de gerencia en su Inicio (Dashboard.tsx), aunque tenga el permiso.
    const gerencia = !esSuperAdmin(u) && tiene('inicio.gerencia');
    const tipo: TipoInicio = gerencia ? 'gerencia' : conInventario ? TIPO_DE_VISTA[vista] : esSuperAdmin(u) ? 'superadmin' : 'general';
    return {
        tipo,
        texto: TEXTO_TIPO_INICIO[tipo],
        detalle: gerencia ? [TEXTO_INICIO_GERENCIA, tarjeta] : [tarjeta],
    };
}

/** La fila de una persona: qué columnas ve y qué Inicio le toca. */
export function filaPanorama(u: UsuarioPanorama, columnas: readonly ColumnaPanorama[] = columnasPanorama()): FilaPanorama {
    const ef = new Set(u.efectivos);
    const tiene: Tiene = p => ef.has(p);
    const menu = new Set<ClaveColumna>(menuVisible(tiene, u).map(m => m.clave));
    if (veBuzonIdeas(tiene)) menu.add('buzon_ideas');
    const ve = {} as Record<ClaveColumna, boolean>;
    for (const c of columnas) ve[c.clave] = menu.has(c.clave);
    return { usuario: u, ve, inicio: inicioDe(tiene, u) };
}

/**
 * El Panorama con el filtro de la página (el mismo buscador y filtro por rol de la lista: `filtrarUsuarios`): grupos
 * por rol, en el orden del filtro (`rolesDeLista`, por nombre), y dentro, por nombre; más los totales por columna.
 */
export function armarPanorama(
    lista: readonly UsuarioPanorama[],
    texto: string,
    rolId: number | null,
    etiquetaBuzon?: string,
): Panorama {
    const columnas = columnasPanorama(etiquetaBuzon);
    const visibles = filtrarUsuarios(lista, texto, rolId);
    const porRol = new Map<number, FilaPanorama[]>();
    for (const u of visibles) {
        const filas = porRol.get(u.rol_id) ?? [];
        filas.push(filaPanorama(u, columnas));
        porRol.set(u.rol_id, filas);
    }
    const grupos = rolesDeLista(visibles).map(r => ({
        rol_id: r.id,
        rol_nombre: r.nombre,
        filas: (porRol.get(r.id) ?? []).sort((a, b) => a.usuario.nombre.localeCompare(b.usuario.nombre, 'es')),
    }));
    const totales = {} as Record<ClaveColumna, number>;
    for (const c of columnas) totales[c.clave] = 0;
    for (const g of grupos) {
        for (const f of g.filas) {
            for (const c of columnas) if (f.ve[c.clave]) totales[c.clave] += 1;
        }
    }
    return { columnas, grupos, totales, personas: visibles.length };
}

/** «1 persona» / «N personas». */
export const textoPersonas = (n: number): string => `${n} ${n === 1 ? 'persona' : 'personas'}`;
