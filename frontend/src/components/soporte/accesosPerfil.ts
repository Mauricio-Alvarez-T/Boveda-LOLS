import { menuVisible, veBuzonIdeas, type ClaveMenu } from '../layout/menuLateral';
import { PESTANAS_INVENTARIO, pestanasInventarioVisibles } from '../inventario/pestanasInventario';
import { SECCION_LABEL, permisosGestiones, seccionesDisponibles } from '../consultas/gestionesNav';
import { vistaInventario } from '../dashboard/widgets/inventarioPerfil/perfil';
import { normalizar } from '../../utils/busquedaTrabajadores';
import { TEXTO_VISTA_INVENTARIO, type FichaSoporte, type OrigenPermiso } from './fichaUsuario';
import type { FichaVerComo, PermisoVerComo } from '../../context/verComoSesion';

/**
 * «Lo que puede usar <persona>» (Marcos 2026-10-26): el recuadro del Inicio mientras el Super Administrador está en
 * «ver como». Lógica PURA, con test (`accesosPerfil.test.ts`); la pinta `AccesosVerComo.tsx`.
 *
 * Una tarjeta por cada sección del menú lateral que esa persona ve —las mismas y en el mismo orden: `menuVisible`, la
 * regla del Sidebar— y dentro, qué puede hacer ahí:
 *   - Inicio: el Inicio de gerencia (`inicio.gerencia`) y qué vista de Inventario le toca (`vistaInventario`).
 *   - Inventario: sus pestañas (`pestanasInventarioVisibles`) y el resto de sus permisos del módulo.
 *   - Gestiones: sus secciones (`permisosGestiones` + `seccionesDisponibles`) y sus permisos.
 *   - El resto: sus permisos. «Comparte tu idea» al final si la ve (`veBuzonIdeas`, pie del menú).
 * Cada permiso va a la sección del menú donde se usa (`menuDePermiso`); si esa sección no le aparece, va a «Otros
 * permisos» (no se pierde ninguno).
 *
 * De dónde salen los nombres: de la ficha de Soporte que se guardó al entrar (nombre y módulo del catálogo, y si es del
 * rol, propio o quitado). Sin ficha, de la clave y del mapa de permisos de la pantalla (`PERMISO_HIERARCHY`: subsección),
 * sin origen. Los permisos que valen son SIEMPRE los del token (`permisos`): la ficha solo los nombra y suma los quitados.
 */

export type ClaveTarjeta = ClaveMenu | 'buzon_ideas' | 'otros';

/** Lo que se usa del mapa de permisos de la pantalla (PERMISO_HIERARCHY; no se importa aquí: usa `import.meta`). */
export interface JerarquiaPermiso {
    subseccion: string;
    sensible?: 'financiero' | 'critico';
}

export interface EntradaAccesos {
    /** Los permisos del token de la persona (los efectivos: lo que la app le deja hacer). */
    permisos: readonly string[];
    usuario: {
        nombre?: string | null;
        rol?: string | null;
        rol_id?: number | string | null;
        bodega_id?: number | null;
    };
    /** Lo de su ficha de Soporte guardado al entrar a «ver como». null = no hay: nombres técnicos y sin origen. */
    ficha?: FichaVerComo | null;
    /** PERMISO_HIERARCHY[clave]: la subsección (nombre sin ficha) y la marca de montos. */
    jerarquia?: (clave: string) => JerarquiaPermiso | undefined;
    /** Nombre del botón de ideas del pie del menú (ETIQUETA_BUZON_IDEAS). */
    etiquetaBuzon?: string;
}

export interface PermisoAcceso {
    clave: string;
    /** El nombre, sin las marcas «$» / «⚠️» del catálogo. */
    texto: string;
    descripcion: string | null;
    /** null = no se sabe (sin ficha, o el permiso no venía en ella). */
    origen: OrigenPermiso | null;
    /** De montos («$»). */
    financiero: boolean;
    /** Módulo del catálogo (Inventario, Documentos…): se muestra en «Otros permisos». */
    modulo: string;
}

export interface EtiquetaAcceso {
    texto: string;
    origen: OrigenPermiso | null;
    financiero: boolean;
}

export interface FilaAcceso {
    rotulo: string;
    /** chips = etiquetas cortas (pestañas, secciones) · texto = una frase por línea. */
    forma: 'chips' | 'texto';
    items: EtiquetaAcceso[];
    /** Qué decir si no queda ninguna sin tachar. */
    vacio?: string;
}

export interface TarjetaAcceso {
    clave: ClaveTarjeta;
    titulo: string;
    descripcion: string;
    /** Adónde lleva «Ir a…» (null = no hay adónde: el Inicio —ya está ahí—, el botón de ideas, «Otros permisos»). */
    ruta: string | null;
    filas: FilaAcceso[];
    /** Lo que puede hacer ahí (y lo quitado, tachado). */
    permisos: PermisoAcceso[];
    /** Permisos efectivos de esta tarjeta (los de la lista y los de las filas). */
    total: number;
}

export interface AccesosPerfil {
    nombre: string;
    rol: string;
    conFicha: boolean;
    tarjetas: TarjetaAcceso[];
    cuenta: { efectivos: number; propios: number; quitados: number };
}

// ── Dónde se usa cada permiso ────────────────────────────────────────────────────

/**
 * Módulo del catálogo (MAESTRO_PERMISOS, backend/src/config/permisos.config.js) → la sección del menú donde se usa, en
 * orden de preferencia: va a la primera que la persona ve. `accesosPerfil.test.ts` revisa que todo módulo del
 * catálogo tenga destino.
 */
export const MENU_DE_MODULO: Readonly<Record<string, readonly ClaveMenu[]>> = {
    Inicio: ['inicio'],
    Asistencia: ['asistencia'],
    // La ficha del trabajador, sus documentos y los reportes viven en Gestiones (antes Consultas).
    Trabajadores: ['gestiones'],
    Documentos: ['gestiones'],
    Reportes: ['gestiones'],
    Inventario: ['inventario'],
    // Los montos de Inventario (costos, facturas, valores): bloque «Financiero» del catálogo.
    Financiero: ['inventario'],
    'Vehículos': ['vehiculos'],
    // Catálogos y ajustes de Configuración (Settings.tsx).
    Empresas: ['configuracion'],
    // Crear, editar y finalizar obras: Configuración → Obras; reactivar una finalizada: Obras Finalizadas.
    Obras: ['configuracion', 'obras_finalizadas'],
    Cargos: ['configuracion'],
    Conductores: ['configuracion'],
    Usuarios: ['configuracion'],
    Sistema: ['configuracion'],
    // Sitio web (mig 147): su propia sección del menú.
    'Sitio web': ['sitio_web'],
};

/** Las claves que no van donde dice su módulo. */
export const MENU_DE_CLAVE: Readonly<Record<string, readonly ClaveMenu[]>> = {
    // «Ver Obras» abre el menú Obras Finalizadas (menuLateral.ts); el catálogo de obras también está en Configuración.
    'obras.ver': ['obras_finalizadas', 'configuracion'],
    // Las listas de empresas y cargos también llenan los filtros y formularios de Gestiones (GET /empresas y /cargos
    // piden «Ver»), y la de conductores, el formulario de Vehículos: sin Configuración, sirven ahí.
    'empresas.ver': ['configuracion', 'gestiones'],
    'cargos.ver': ['configuracion', 'gestiones'],
    'conductores.ver': ['configuracion', 'vehiculos'],
    // Módulo «Sistema» en el catálogo, pero cada una es su propia sección del menú.
    'ideas.revisar': ['revisar_ideas'],
    'costos.gestionar': ['presupuestos'],
};

/** Sin ficha: el módulo del catálogo según el comienzo de la clave (el mismo del catálogo; lo revisa el test). */
export const MODULO_DE_PREFIJO: Readonly<Record<string, string>> = {
    inicio: 'Inicio',
    asistencia: 'Asistencia',
    trabajadores: 'Trabajadores',
    documentos: 'Documentos',
    reportes: 'Reportes',
    inventario: 'Inventario',
    vehiculos: 'Vehículos',
    empresas: 'Empresas',
    obras: 'Obras',
    cargos: 'Cargos',
    conductores: 'Conductores',
    usuarios: 'Usuarios',
    sistema: 'Sistema',
    ideas: 'Sistema',
    costos: 'Sistema',
    sitio_web: 'Sitio web',
};

/** El módulo del catálogo de una clave, por su comienzo («Otros» si no se conoce). */
export const moduloDeClave = (clave: string): string => MODULO_DE_PREFIJO[clave.split('.')[0]] ?? 'Otros';

/**
 * Las secciones del menú donde se usa un permiso, en orden de preferencia ([] = ninguna conocida). `modulo` = el del
 * catálogo (viene en la ficha); sin él, se deduce de la clave.
 */
export function menuDePermiso(clave: string, modulo?: string | null): readonly ClaveMenu[] {
    return MENU_DE_CLAVE[clave] ?? (modulo ? MENU_DE_MODULO[modulo] : undefined) ?? MENU_DE_MODULO[moduloDeClave(clave)] ?? [];
}

/** Orden de los módulos dentro de una tarjeta (Gestiones: trabajadores antes que documentos y reportes). */
const ORDEN_MODULO = ['Inicio', 'Asistencia', 'Trabajadores', 'Documentos', 'Reportes', 'Inventario', 'Financiero', 'Vehículos',
    'Empresas', 'Obras', 'Cargos', 'Usuarios', 'Conductores', 'Sistema', 'Sitio web'];
const rangoModulo = (m: string) => {
    const i = ORDEN_MODULO.indexOf(m);
    return i < 0 ? ORDEN_MODULO.length : i;
};

// ── Textos ───────────────────────────────────────────────────────────────────────

/** Una línea bajo el título de cada tarjeta. */
export const DESCRIPCION_MENU: Record<ClaveMenu, string> = {
    inicio: 'Lo primero que ve al entrar',
    asistencia: 'El registro diario de cada obra',
    gestiones: 'Trabajadores, solicitudes de ingreso y documentos',
    inventario: 'Materiales, bodegas y solicitudes',
    vehiculos: 'La flota y sus papeles',
    obras_finalizadas: 'Las obras ya cerradas',
    presupuestos: 'Presupuesto y gastos de cada obra',
    sitio_web: 'Las obras que muestra lols.cl',
    ayuda: 'Guías paso a paso; la ven todos',
    revisar_ideas: 'Las ideas de mejora que manda la gente',
    soporte: 'Revisar las cuentas de los demás',
    configuracion: 'Catálogos, usuarios y ajustes',
};

export const TEXTO_INICIO_GERENCIA = 'Inicio de gerencia arriba: los temas que esperan una decisión';
export const TEXTO_SIN_INVENTARIO = 'Sin tarjeta de Inventario (le falta «Ver inventario»)';
const PERMISO_GERENCIA = 'inicio.gerencia';

const capitalizar = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** El nombre del catálogo sin las marcas del comienzo («$ », «⚠️ »): la de montos va aparte, como chip «$». */
export function limpiarNombre(nombre: string): string {
    const limpio = nombre.replace(/^[^\p{L}\p{N}]+/u, '').trim();
    return limpio || nombre.trim();
}

/**
 * Sin ficha: un nombre legible con la clave y la subsección del mapa de permisos de la pantalla.
 * `inventario.transferencias.aprobar` → «Transferencias: aprobar»; `asistencia.guardar` → «Lectura Base: guardar».
 */
export function nombreSinFicha(clave: string, j?: JerarquiaPermiso): string {
    const cola = clave.split('.').slice(1).join(' ').replace(/_/g, ' ').trim();
    const base = j?.subseccion?.trim();
    if (!base) return capitalizar(cola || clave);
    // Sin repetir la subsección cuando la clave ya la nombra («Transferencias: aprobar», no «…: transferencias aprobar»).
    const resto = normalizar(cola).startsWith(`${normalizar(base)} `) ? cola.slice(base.length + 1) : cola;
    return `${base}: ${resto || cola || clave}`;
}

// ── El recuadro ──────────────────────────────────────────────────────────────────

interface Item extends PermisoAcceso {
    rango: number;
    orden: number;
    indice: number;
}

/** Todo lo del recuadro, con los permisos del token y (si hay) la ficha guardada. */
export function accesosPerfil(e: EntradaAccesos): AccesosPerfil {
    const efectivos = [...new Set(e.permisos)];
    const ef = new Set(efectivos);
    const tiene = (p: string) => ef.has(p);
    const ficha = e.ficha ?? null;
    const meta = new Map<string, PermisoVerComo>((ficha?.permisos ?? []).map(p => [p.clave, p]));

    const item = (clave: string, origen: OrigenPermiso | null, indice: number): Item => {
        const m = meta.get(clave);
        const j = e.jerarquia?.(clave);
        const modulo = m?.modulo || moduloDeClave(clave);
        return {
            clave,
            texto: m ? limpiarNombre(m.nombre) : nombreSinFicha(clave, j),
            descripcion: m?.descripcion ?? null,
            origen,
            financiero: j?.sensible === 'financiero' || /^\s*\$/.test(m?.nombre ?? ''),
            modulo,
            rango: rangoModulo(modulo),
            orden: typeof m?.orden === 'number' ? m.orden : Number.MAX_SAFE_INTEGER,
            indice,
        };
    };
    // Los efectivos (origen según la ficha; un «quitado» que el token sí trae cambió después: no se sabe) y, al final,
    // los quitados de la ficha que el token no trae.
    const todos: Item[] = [
        ...efectivos.map((clave, i) => {
            const o = meta.get(clave)?.origen;
            return item(clave, o && o !== 'quitado' ? o : null, i);
        }),
        ...(ficha?.permisos ?? [])
            .filter(p => p.origen === 'quitado' && !ef.has(p.clave))
            .map((p, i) => item(p.clave, 'quitado', efectivos.length + i)),
    ];
    const porClave = new Map(todos.map(it => [it.clave, it]));
    const etiqueta = (texto: string, clave?: string): EtiquetaAcceso => {
        const it = clave ? porClave.get(clave) : undefined;
        return { texto, origen: it?.origen ?? null, financiero: it?.financiero ?? false };
    };

    const menus = menuVisible(tiene, e.usuario);
    const visibles = new Set<ClaveMenu>(menus.map(m => m.clave));
    const conInventario = visibles.has('inventario');

    // Lo que va en una fila (no se repite en la lista): las pestañas de Inventario y el Inicio de gerencia.
    const permisosPestana = new Set(PESTANAS_INVENTARIO.map(t => t.requiresPerm));
    const vaEnFila = (clave: string) => clave === PERMISO_GERENCIA || (conInventario && permisosPestana.has(clave));

    const porTarjeta = new Map<ClaveTarjeta, Item[]>();
    for (const it of todos) {
        if (vaEnFila(it.clave)) continue;
        const destino: ClaveTarjeta = menuDePermiso(it.clave, it.modulo).find(m => visibles.has(m)) ?? 'otros';
        const lista = porTarjeta.get(destino) ?? [];
        lista.push(it);
        porTarjeta.set(destino, lista);
    }
    const ordenar = (l: Item[]) => [...l].sort((a, b) => a.rango - b.rango || a.orden - b.orden || a.indice - b.indice);
    const sinOrden = (l: Item[]): PermisoAcceso[] => ordenar(l).map(({ clave, texto, descripcion, origen, financiero, modulo }) =>
        ({ clave, texto, descripcion, origen, financiero, modulo }));

    const filasDe = (clave: ClaveMenu): FilaAcceso[] => {
        if (clave === 'inicio') {
            const gerencia = porClave.get(PERMISO_GERENCIA);
            return [
                ...(gerencia ? [{ rotulo: 'Arriba', forma: 'texto' as const, items: [etiqueta(TEXTO_INICIO_GERENCIA, PERMISO_GERENCIA)] }] : []),
                {
                    rotulo: 'Tarjeta de Inventario',
                    forma: 'texto',
                    items: [etiqueta(tiene('inventario.ver') ? TEXTO_VISTA_INVENTARIO[vistaInventario(tiene, e.usuario)] : TEXTO_SIN_INVENTARIO)],
                },
            ];
        }
        if (clave === 'inventario') {
            // Las que ve (la regla de Inventario.tsx), en el orden de su barra; las quitadas, tachadas en su lugar.
            const ve = new Set(pestanasInventarioVisibles(tiene).map(t => t.key));
            return [{
                rotulo: 'Pestañas',
                forma: 'chips',
                items: PESTANAS_INVENTARIO
                    .filter(t => ve.has(t.key) || porClave.get(t.requiresPerm)?.origen === 'quitado')
                    .map(t => etiqueta(t.label, t.requiresPerm)),
                vacio: 'Ninguna: Inventario se ve vacío',
            }];
        }
        if (clave === 'gestiones') {
            const secciones = seccionesDisponibles(permisosGestiones(tiene));
            return [{
                rotulo: 'Secciones',
                forma: 'chips',
                items: [...(secciones.length >= 2 ? ['Portada'] : []), ...secciones.map(s => SECCION_LABEL[s])].map(t => etiqueta(t)),
                vacio: 'Ninguna',
            }];
        }
        return [];
    };
    const efectivasEnFilas = (clave: ClaveMenu): number => {
        if (clave === 'inicio') return tiene(PERMISO_GERENCIA) ? 1 : 0;
        if (clave === 'inventario') return pestanasInventarioVisibles(tiene).length;
        return 0;
    };
    const cuentaEfectivos = (l: readonly PermisoAcceso[]) => l.filter(p => p.origen !== 'quitado').length;

    const tarjetas: TarjetaAcceso[] = menus.map(m => {
        const permisos = sinOrden(porTarjeta.get(m.clave) ?? []);
        return {
            clave: m.clave,
            titulo: m.label,
            descripcion: DESCRIPCION_MENU[m.clave],
            // El recuadro está en el Inicio: «Ir a Inicio» no llevaría a ningún lado.
            ruta: m.clave === 'inicio' ? null : m.path,
            filas: filasDe(m.clave),
            permisos,
            total: cuentaEfectivos(permisos) + efectivasEnFilas(m.clave),
        };
    });
    if (veBuzonIdeas(tiene)) {
        tarjetas.push({
            clave: 'buzon_ideas',
            titulo: e.etiquetaBuzon ?? 'Comparte tu idea',
            descripcion: 'Botón al pie del menú',
            ruta: null,
            filas: [{ rotulo: 'Puede', forma: 'texto', items: [etiqueta('Proponer una mejora para Bóveda')] }],
            permisos: [],
            total: 0,
        });
    }
    const otros = sinOrden(porTarjeta.get('otros') ?? []);
    if (otros.length) {
        tarjetas.push({
            clave: 'otros',
            titulo: 'Otros permisos',
            descripcion: 'Los tiene, pero la parte donde se usan no le aparece en el menú',
            ruta: null,
            filas: [],
            permisos: otros,
            total: cuentaEfectivos(otros),
        });
    }

    return {
        nombre: ficha?.nombre || e.usuario.nombre || '',
        rol: ficha?.rol || e.usuario.rol || '',
        conFicha: !!ficha,
        tarjetas,
        cuenta: {
            efectivos: efectivos.length,
            propios: todos.filter(it => it.origen === 'propio').length,
            quitados: todos.filter(it => it.origen === 'quitado').length,
        },
    };
}

/** Lo de la ficha de Soporte que se guarda con la sesión de «ver como» (Soporte.tsx, al tocar «Ver como esta persona»). */
export function fichaParaVerComo(f: FichaSoporte): FichaVerComo {
    return {
        usuarioId: f.usuario.id,
        nombre: f.usuario.nombre,
        rol: f.usuario.rol_nombre,
        permisos: f.permisos.map(({ clave, modulo, nombre, descripcion, orden, origen }) => ({ clave, modulo, nombre, descripcion, orden, origen })),
    };
}
