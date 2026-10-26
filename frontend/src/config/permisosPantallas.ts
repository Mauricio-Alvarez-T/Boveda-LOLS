/**
 * Matriz de roles (Configuración › Roles, 2026-10-26): los permisos agrupados por PANTALLA y en niveles.
 *
 * El dueño eligió ver todos los roles de un vistazo (propuesta C) en vez del modal de 107 casillas. Cada
 * fila es una pantalla real de Bóveda y cada celda un nivel —Nada · Mira · Trabaja · Todo— que equivale a
 * un conjunto exacto de claves. Una mezcla que no calza con ningún nivel se muestra «A medida» y se edita
 * en el ajuste fino: la matriz nunca pierde granularidad.
 *
 * Es solo UI, como `permisosHierarchy.ts`: el catálogo de `backend/src/config/permisos.config.js` sigue
 * siendo la verdad de qué permisos existen. **Permiso nuevo ⇒ va en alguna pantalla de acá**; el test
 * `permisosPantallas.test.ts` rompe si una clave de `PERMISO_HIERARCHY` no tiene fila.
 *
 * Reglas que no se ven en la tabla:
 *  - `$` (montos) y `delicado` (borrar para siempre, saltarse aprobaciones, tocar permisos) NO entran en
 *    ningún nivel: se marcan a mano en el ajuste fino.
 *  - Quitar la clave de «ver» de una pantalla la apaga entera (sin ver, el resto no sirve).
 *  - Puertas: `inventario.ver` se pone/saca solo según las pantallas de Inventario; en Asistencia y
 *    Gestiones la puerta es una fila, que se enciende sola al subir otra fila del módulo y, al apagarla,
 *    apaga el módulo. Las filas `libre` no dependen de la puerta.
 *  - Lo que la matriz no conoce se conserva tal cual al guardar.
 */

export type Marca = 'dinero' | 'delicado';

export interface ItemPantalla {
    clave: string;
    /** En palabras de la obra, no del sistema. */
    etiqueta: string;
    /** Desde qué escalón entra (pantallas acumulativas). */
    nivel?: 1 | 2 | 3;
    marca?: Marca;
}

export interface NivelPantalla {
    etiqueta: string;
    claves: string[];
    /** Qué agrega respecto del escalón anterior, para el popover. */
    agrega: string;
}

export interface Pantalla {
    id: string;
    nombre: string;
    grupo: GrupoId;
    items: ItemPantalla[];
    niveles: NivelPantalla[];
    /** Fila puerta de su módulo (`asistencia.ver`, `reportes.ver`). */
    puerta?: boolean;
    /** No depende de la puerta del módulo. */
    libre?: boolean;
    /** Toda la fila es de montos. */
    dinero?: boolean;
    /** Los escalones se suman (Mira ⊂ Trabaja ⊂ Todo). */
    acumulativa: boolean;
    /** El escalón 1 no es «ver»: el resto funciona sin él (Sistema). */
    sinVer?: boolean;
}

export type GrupoId = 'inicio' | 'asistencia' | 'gestiones' | 'inventario' | 'vehiculos' | 'configuracion';

export interface Grupo {
    id: GrupoId;
    nombre: string;
    /** Clave que abre el módulo, si la tiene. */
    puerta?: string;
    /** La puerta no es una fila: se deriva de las pantallas (`inventario.ver`). */
    puertaImplicita?: boolean;
}

export const GRUPOS: Grupo[] = [
    { id: 'inicio', nombre: 'Inicio' },
    { id: 'asistencia', nombre: 'Asistencia', puerta: 'asistencia.ver' },
    { id: 'gestiones', nombre: 'Gestiones', puerta: 'reportes.ver' },
    { id: 'inventario', nombre: 'Inventario', puerta: 'inventario.ver', puertaImplicita: true },
    { id: 'vehiculos', nombre: 'Vehículos' },
    { id: 'configuracion', nombre: 'Configuración' },
];

/** Rol 1 tiene todo el catálogo por diseño (rbac.js): su columna no se edita. */
export const ROL_SUPER_ADMIN = 1;

export const ETIQUETA_NADA = 'Nada';
export const ETIQUETA_A_MEDIDA = 'A medida';

// ─── Datos ────────────────────────────────────────────────────────────────

const i = (clave: string, etiqueta: string, nivel: 1 | 2 | 3): ItemPantalla => ({ clave, etiqueta, nivel });
const $ = (clave: string, etiqueta: string): ItemPantalla => ({ clave, etiqueta, marca: 'dinero' });
const x = (clave: string, etiqueta: string): ItemPantalla => ({ clave, etiqueta, marca: 'delicado' });

type PantallaDef = Omit<Pantalla, 'niveles' | 'acumulativa'> & {
    /** Escalones no acumulativos (cada uno con sus claves exactas). */
    explicitos?: { etiqueta: string; claves: string[] }[];
    /** Nombres de los escalones acumulativos, si no sirven Mira/Trabaja/Todo. */
    etiquetas?: string[];
};

const T = 'inventario.transferencias';

const DEFS: PantallaDef[] = [
    // INICIO
    { id: 'tablero', nombre: 'Tablero de gerencia', grupo: 'inicio', etiquetas: ['Ve'], items: [
        i('inicio.gerencia', 'Ver el tablero de gerencia', 1)] },

    // ASISTENCIA
    { id: 'asistencia', nombre: 'Asistencia diaria', grupo: 'asistencia', puerta: true, items: [
        i('asistencia.ver', 'Ver la asistencia', 1),
        i('asistencia.guardar', 'Guardar la asistencia', 2),
        i('asistencia.exportar_excel', 'Descargar Excel', 2),
        i('asistencia.enviar_whatsapp', 'Enviar por WhatsApp', 2),
        i('asistencia.feriado.gestionar', 'Marcar feriados', 3),
        i('asistencia.tomar.global', 'Tomar todas las obras a la vez', 3),
        $('asistencia.horas_extra.ver', 'Ver horas extra')] },
    { id: 'periodos', nombre: 'Períodos de ausencia', grupo: 'asistencia', items: [
        i('asistencia.periodo.ver', 'Ver licencias, vacaciones y permisos', 1),
        i('asistencia.periodo.crear', 'Asignar períodos', 2),
        i('asistencia.periodo.eliminar', 'Borrar períodos', 3)] },
    { id: 'horarios', nombre: 'Horarios', grupo: 'asistencia', items: [
        i('asistencia.horarios.ver', 'Ver horarios', 1),
        i('asistencia.horarios.editar', 'Cambiar horarios', 3)] },
    { id: 'actividades', nombre: 'Actividades sugeridas', grupo: 'asistencia', items: [
        i('asistencia.actividades_sugeridas.ver', 'Ver las listas', 1),
        i('asistencia.actividades_sugeridas.crear', 'Armar listas', 2),
        i('asistencia.actividades_sugeridas.editar', 'Editar listas', 2),
        i('asistencia.actividades_sugeridas.registrar', 'Marcar quién asistió', 2),
        i('asistencia.actividades_sugeridas.enviar_whatsapp', 'Enviar por WhatsApp', 2),
        i('asistencia.actividades_sugeridas.informe', 'Descargar informe', 2),
        i('asistencia.actividades_sugeridas.cancelar', 'Cancelar listas', 3),
        x('asistencia.actividades_sugeridas.eliminar', 'Borrar listas para siempre')] },

    // GESTIONES
    { id: 'gestiones', nombre: 'Trabajadores y reportes', grupo: 'gestiones', puerta: true, items: [
        i('reportes.ver', 'Entrar a Gestiones', 1),
        i('reportes.exportar', 'Descargar reportes en Excel', 3),
        i('reportes.enviar_email', 'Enviar reportes por correo', 3)] },
    { id: 'documentos', nombre: 'Documentos', grupo: 'gestiones', items: [
        i('documentos.ver', 'Ver documentos', 1),
        i('documentos.subir', 'Subir', 2),
        i('documentos.descargar', 'Descargar', 2),
        i('documentos.eliminar', 'Borrar', 3),
        i('documentos.laborales.emitir', 'Emitir contratos y finiquitos', 3),
        x('documentos.laborales.descargar', 'Imprimir contratos con sueldo')] },
    { id: 'ingresos', nombre: 'Ingresos de trabajadores', grupo: 'gestiones', libre: true,
        explicitos: [
            { etiqueta: 'Solicita', claves: ['trabajadores.solicitud.crear'] },
            { etiqueta: 'Aprueba', claves: ['trabajadores.solicitud.aprobar'] },
            { etiqueta: 'Todo', claves: ['trabajadores.solicitud.crear', 'trabajadores.solicitud.aprobar'] },
        ],
        items: [
            { clave: 'trabajadores.solicitud.crear', etiqueta: 'Llenar la ficha de ingreso' },
            { clave: 'trabajadores.solicitud.aprobar', etiqueta: 'Aprobar o rechazar ingresos' }] },
    { id: 'fisicos', nombre: 'Documentos físicos', grupo: 'gestiones', libre: true,
        explicitos: [
            { etiqueta: 'Lleva', claves: ['documentos.entrega.portar'] },
            { etiqueta: 'Arma', claves: ['documentos.entrega.registrar'] },
            { etiqueta: 'Todo', claves: ['documentos.entrega.portar', 'documentos.entrega.registrar'] },
        ],
        items: [
            { clave: 'documentos.entrega.portar', etiqueta: 'Llevar sus lotes a firmar' },
            { clave: 'documentos.entrega.registrar', etiqueta: 'Armar y recibir lotes (RR.HH.)' }] },

    // INVENTARIO
    { id: 'solicitudes', nombre: 'Solicitudes', grupo: 'inventario', items: [
        i('inventario.tab.transferencias', 'Ver la pestaña', 1),
        i(`${T}.solicitar`, 'Pedir herramientas', 2),
        i(`${T}.solicitud_materiales`, 'Pedir materiales', 2),
        i(`${T}.devolucion`, 'Devolver a bodega', 2),
        i(`${T}.intra_obra`, 'Trasladar entre obras', 2),
        i(`${T}.recibir`, 'Recibir', 2),
        i(`${T}.ver_todas`, 'Ver las de todos', 3),
        i(`${T}.aprobar`, 'Aprobar o rechazar', 3),
        i(`${T}.diferencias_ver`, 'Ver diferencias', 3),
        i(`${T}.despachar`, 'Despachar', 3),
        i(`${T}.cancelar`, 'Cancelar pendientes', 3),
        x(`${T}.cancelar_en_transito`, 'Cancelar en camino'),
        x(`${T}.push_directo`, 'Enviar de bodega a obra sin aprobación'),
        x(`${T}.intra_bodega`, 'Mover entre bodegas al instante'),
        x(`${T}.orden_gerencia`, 'Orden de gerencia'),
        x(`${T}.sod_bypass`, 'Hacer todo el flujo solo'),
        x(`${T}.eliminar`, 'Borrar del historial')] },
    { id: 'ubicacion', nombre: 'Por obra y bodega', grupo: 'inventario', etiquetas: ['Ve'], items: [
        i('inventario.tab.por_ubicacion', 'Ver la pestaña', 1),
        $('inventario.descuentos.gestionar', 'Ajustar descuento de obra')] },
    { id: 'resumen', nombre: 'Resumen', grupo: 'inventario', etiquetas: ['Ve'], items: [
        i('inventario.tab.resumen', 'Ver la pestaña', 1)] },
    { id: 'ejecutivo', nombre: 'Resumen ejecutivo', grupo: 'inventario', etiquetas: ['Ve'], items: [
        i('inventario.tab.resumen_ejecutivo', 'Ver la pestaña', 1),
        $('inventario.resumen.ver_valores', 'Ver montos')] },
    { id: 'movimientos', nombre: 'Movimientos', grupo: 'inventario', etiquetas: ['Ve'], items: [
        i('inventario.movimientos.ver', 'Ver la pestaña', 1)] },
    { id: 'maestro', nombre: 'Maestro', grupo: 'inventario', items: [
        i('inventario.tab.maestro', 'Ver la pestaña', 1),
        i('inventario.crear', 'Crear ítems, categorías y bodegas', 2),
        i('inventario.editar', 'Editar stock e ítems', 2),
        i('inventario.eliminar', 'Borrar', 3),
        $('inventario.costos.ver', 'Ver costos'),
        $('inventario.costos.editar', 'Editar costos')] },
    { id: 'bombas', nombre: 'Bombas de hormigón', grupo: 'inventario', items: [
        i('inventario.tab.bombas', 'Ver la pestaña', 1),
        i('inventario.bombas.crear', 'Programar', 3),
        i('inventario.bombas.editar', 'Editar programación', 3),
        $('inventario.bombas.ver_costos', 'Ver costos')] },
    { id: 'facturas', nombre: 'Facturas', grupo: 'inventario', dinero: true, items: [
        i('inventario.facturas.ver', 'Ver facturas', 1),
        i('inventario.facturas.gestionar', 'Crear y anular facturas', 3)] },

    // VEHÍCULOS
    { id: 'vehiculos', nombre: 'Vehículos', grupo: 'vehiculos', items: [
        i('vehiculos.ver', 'Ver la flota y sus papeles', 1),
        i('vehiculos.crear', 'Registrar', 2),
        i('vehiculos.editar', 'Editar', 2),
        i('vehiculos.eliminar', 'Dar de baja', 3)] },

    // CONFIGURACIÓN
    { id: 'trabajadores', nombre: 'Trabajadores', grupo: 'configuracion', items: [
        i('trabajadores.ver', 'Ver trabajadores', 1),
        i('trabajadores.crear', 'Registrar', 2),
        i('trabajadores.editar', 'Editar', 2),
        i('trabajadores.eliminar', 'Finiquitar', 3),
        i('trabajadores.reactivar', 'Reactivar', 3),
        $('trabajadores.financiero.ver', 'Ver sueldo y anticipos'),
        $('trabajadores.financiero.editar', 'Editar sueldo y anticipos'),
        x('trabajadores.depurar', 'Borrar para siempre')] },
    { id: 'obras', nombre: 'Obras', grupo: 'configuracion', items: [
        i('obras.ver', 'Ver obras', 1),
        i('obras.crear', 'Crear', 2),
        i('obras.editar', 'Editar', 2),
        i('obras.eliminar', 'Borrar', 3),
        i('obras.finalizar', 'Finalizar o reactivar', 3)] },
    { id: 'empresas', nombre: 'Empresas', grupo: 'configuracion', items: [
        i('empresas.ver', 'Ver empresas', 1),
        i('empresas.crear', 'Crear', 2),
        i('empresas.editar', 'Editar', 2),
        i('empresas.eliminar', 'Borrar', 3)] },
    { id: 'conductores', nombre: 'Conductores', grupo: 'configuracion', items: [
        i('conductores.ver', 'Ver conductores', 1),
        i('conductores.crear', 'Registrar', 2),
        i('conductores.editar', 'Editar', 2),
        i('conductores.eliminar', 'Borrar', 3)] },
    { id: 'cargos', nombre: 'Cargos', grupo: 'configuracion', items: [
        i('cargos.ver', 'Ver cargos', 1),
        i('cargos.crear', 'Crear', 2),
        i('cargos.editar', 'Editar', 2),
        i('cargos.eliminar', 'Borrar', 3),
        $('cargos.sueldo.ver', 'Ver sueldo del cargo'),
        $('cargos.sueldo.editar', 'Editar sueldo del cargo')] },
    { id: 'usuarios', nombre: 'Usuarios', grupo: 'configuracion', items: [
        i('usuarios.ver', 'Ver usuarios', 1),
        i('usuarios.crear', 'Crear', 3),
        i('usuarios.editar', 'Editar', 3),
        x('usuarios.eliminar', 'Borrar usuarios')] },
    { id: 'roles', nombre: 'Roles y permisos', grupo: 'configuracion', items: [
        i('usuarios.roles.ver', 'Ver roles', 1),
        i('usuarios.roles.crear', 'Crear roles', 3),
        i('usuarios.roles.editar', 'Editar roles', 3),
        x('usuarios.roles.eliminar', 'Borrar roles'),
        x('usuarios.permisos.gestionar', 'Cambiar permisos')] },
    { id: 'presupuestos', nombre: 'Presupuestos', grupo: 'configuracion', dinero: true, etiquetas: ['Todo'], items: [
        i('costos.gestionar', 'Presupuestos y gastos de cada obra', 1)] },
    { id: 'sistema', nombre: 'Sistema', grupo: 'configuracion', libre: true, sinVer: true, items: [
        i('sistema.logs.ver', 'Ver historial de actividad', 1),
        i('sistema.plantillas.gestionar', 'Plantillas de correo', 3),
        i('sistema.tipos_doc.gestionar', 'Tipos de documento', 3),
        i('sistema.tipos_ausencia.gestionar', 'Tipos de ausencia', 3),
        i('sistema.reportes.gestionar', 'Reportes automáticos', 3),
        i('sistema.avisos.gestionar', 'Avisos de novedades', 3),
        i('sistema.alertas_documentos.gestionar', 'Alertas de documentos', 3),
        i('ideas.revisar', 'Revisar ideas', 3),
        x('sistema.email.configurar', 'Correo del sistema'),
        x('sistema.estados.gestionar', 'Estados de asistencia')] },
];

function construirNiveles(d: PantallaDef): NivelPantalla[] {
    const etiquetaDe = (clave: string) => d.items.find(it => it.clave === clave)?.etiqueta ?? clave;
    if (d.explicitos) {
        return d.explicitos.map(n => ({ etiqueta: n.etiqueta, claves: n.claves, agrega: n.claves.map(etiquetaDe).join(', ') }));
    }
    const base = d.items.filter(it => !it.marca);
    const escalones = [...new Set(base.map(it => it.nivel ?? 1))].sort();
    const nombres = d.etiquetas ?? (escalones.length === 1 ? ['Ve'] : escalones.length === 2 ? ['Mira', 'Todo'] : ['Mira', 'Trabaja', 'Todo']);
    return escalones.map((n, idx) => ({
        etiqueta: nombres[idx],
        claves: base.filter(it => (it.nivel ?? 1) <= n).map(it => it.clave),
        agrega: base.filter(it => (it.nivel ?? 1) === n).map(it => it.etiqueta).join(', '),
    }));
}

export const PANTALLAS: Pantalla[] = DEFS.map(def => ({ ...def, acumulativa: !def.explicitos, niveles: construirNiveles(def) }));

export const CLAVES_MATRIZ: string[] = [
    ...GRUPOS.filter(g => g.puertaImplicita && g.puerta).map(g => g.puerta as string),
    ...PANTALLAS.flatMap(p => p.items.map(it => it.clave)),
];

// ─── Lectura ──────────────────────────────────────────────────────────────

/** Claves de la pantalla que deciden el nivel (sin `$` ni delicados). */
export const clavesBase = (p: Pantalla): string[] => p.items.filter(it => !it.marca).map(it => it.clave);
export const clavesPantalla = (p: Pantalla): string[] => p.items.map(it => it.clave);

/** Clave sin la cual la pantalla no se ve (el escalón 1 de las acumulativas). */
export const claveVer = (p: Pantalla): string | null =>
    p.acumulativa && !p.sinVer && p.niveles[0]?.claves.length === 1 ? p.niveles[0].claves[0] : null;

export interface EstadoCelda {
    /** -1 = a medida · 0 = nada · n = índice+1 en `p.niveles`. */
    nivel: number;
    etiqueta: string;
    dinero: boolean;
    delicado: boolean;
}

const mismoConjunto = (a: string[], b: Set<string>) => a.length === b.size && a.every(c => b.has(c));

export function nivelDe(perms: ReadonlySet<string>, p: Pantalla): EstadoCelda {
    const tiene = new Set(clavesBase(p).filter(c => perms.has(c)));
    const dinero = p.items.some(it => it.marca === 'dinero' && perms.has(it.clave));
    const delicado = p.items.some(it => it.marca === 'delicado' && perms.has(it.clave));
    if (tiene.size === 0) {
        return { nivel: 0, etiqueta: ETIQUETA_NADA, dinero, delicado };
    }
    const idx = p.niveles.findIndex(n => mismoConjunto(n.claves, tiene));
    return idx >= 0
        ? { nivel: idx + 1, etiqueta: p.niveles[idx].etiqueta, dinero, delicado }
        : { nivel: -1, etiqueta: ETIQUETA_A_MEDIDA, dinero, delicado };
}

// ─── Escritura (puras: devuelven una lista nueva) ─────────────────────────

const grupoDe = (p: Pantalla) => GRUPOS.find(g => g.id === p.grupo) as Grupo;
const pantallasDe = (g: GrupoId) => PANTALLAS.filter(p => p.grupo === g);

/** Puertas de módulo coherentes con lo que el rol puede ver. */
export function normalizarPuertas(perms: string[]): string[] {
    const set = new Set(perms);
    for (const g of GRUPOS) {
        if (!g.puerta) continue;
        const dependientes = pantallasDe(g.id).filter(p => !p.libre && !p.puerta);
        const algo = dependientes.some(p => clavesPantalla(p).some(c => set.has(c)));
        if (g.puertaImplicita) {
            if (algo) set.add(g.puerta); else set.delete(g.puerta);
        } else if (algo) {
            set.add(g.puerta);
        }
    }
    return [...set];
}

/** Apagar la puerta (fila) apaga lo que depende de ella en el módulo. */
function cerrarModulo(set: Set<string>, g: Grupo) {
    for (const p of pantallasDe(g.id)) {
        if (p.libre) continue;
        for (const c of clavesPantalla(p)) set.delete(c);
    }
}

export function aplicarNivel(perms: string[], p: Pantalla, nivel: number): string[] {
    const set = new Set(perms);
    const g = grupoDe(p);
    if (nivel === 0) {
        for (const c of clavesPantalla(p)) set.delete(c);
        if (p.puerta) cerrarModulo(set, g);
        return normalizarPuertas([...set]);
    }
    for (const c of clavesBase(p)) set.delete(c);
    for (const c of p.niveles[nivel - 1].claves) set.add(c);
    return normalizarPuertas([...set]);
}

export function alternarClave(perms: string[], p: Pantalla, clave: string): string[] {
    const set = new Set(perms);
    const ver = claveVer(p);
    if (set.has(clave)) {
        set.delete(clave);
        if (clave === ver) {
            for (const c of clavesPantalla(p)) set.delete(c);
            if (p.puerta) cerrarModulo(set, grupoDe(p));
        }
    } else {
        set.add(clave);
        if (ver) set.add(ver);
    }
    return normalizarPuertas([...set]);
}

// ─── Comparación de roles ─────────────────────────────────────────────────

/** Grupos de roles con exactamente los mismos permisos (solo los de 2 o más). */
export function rolesGemelos<T extends { id: number }>(roles: T[], permsDe: (id: number) => ReadonlySet<string>): T[][] {
    const porFirma = new Map<string, T[]>();
    for (const r of roles) {
        const firma = [...permsDe(r.id)].sort().join('|');
        porFirma.set(firma, [...(porFirma.get(firma) ?? []), r]);
    }
    return [...porFirma.values()].filter(g => g.length > 1).sort((a, b) => b.length - a.length);
}
