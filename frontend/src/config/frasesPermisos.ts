/**
 * Permisos «en frases» (opción E, Marcos 2026-10-28): lo que un rol o una persona puede hacer en cada pantalla,
 * dicho como una oración («Puede ver la asistencia y descargar Excel. No puede marcar feriados»), y la cuenta de lo
 * que una persona tiene distinto a su rol. Puro y con test (`frasesPermisos.test.ts`); los niveles, las puertas y
 * qué claves tiene cada pantalla siguen en `permisosPantallas.ts`.
 *
 * Una persona se edita como un rol: sobre lo que TIENE (rol + propios − quitados). Al guardar, `overridesAlGuardar`
 * convierte eso en los overrides de siempre (`permisos_usuario_override`), tocando solo las claves que cambiaron.
 */

import {
    GRUPOS, PANTALLAS, clavesPantalla, normalizarPuertas, type Grupo, type ItemPantalla, type Pantalla,
} from './permisosPantallas';

export type MarcaFrase = 'propio' | 'quitado';

export interface ParteFrase {
    it: ItemPantalla;
    /** Solo en una persona: lo tiene y su rol no (propio) o al revés (quitado). */
    marca?: MarcaFrase;
}

export interface Frase {
    /** Lo que sí puede, en el orden de la pantalla (incluye montos y delicados si los tiene). */
    puede: ParteFrase[];
    /** Lo que no puede: lo del día a día y, en una persona, lo que le quitaron aunque sea de montos o delicado. */
    noPuede: ParteFrase[];
}

export interface Diferencia {
    propios: ItemPantalla[];
    quitados: ItemPantalla[];
}

export interface Override {
    permiso_clave: string;
    tipo: 'grant' | 'deny';
}

/** Lo que una persona tiene de más (propios) y de menos (quitados) que su rol en esa pantalla. */
export function diferencia(rol: ReadonlySet<string>, persona: ReadonlySet<string>, p: Pantalla): Diferencia {
    return {
        propios: p.items.filter(it => persona.has(it.clave) && !rol.has(it.clave)),
        quitados: p.items.filter(it => rol.has(it.clave) && !persona.has(it.clave)),
    };
}

export const difiere = (d: Diferencia) => d.propios.length + d.quitados.length > 0;

/** Cuántas acciones sueltas tiene distintas a su rol (lo que la gente llama «cosas»). */
export const cosasDistintas = (rol: ReadonlySet<string>, persona: ReadonlySet<string>, pantallas: readonly Pantalla[] = PANTALLAS) =>
    pantallas.reduce((n, p) => {
        const d = diferencia(rol, persona, p);
        return n + d.propios.length + d.quitados.length;
    }, 0);

/** La frase de una pantalla. `rol` (solo para una persona) marca lo propio y lo quitado. */
export function frasePantalla(p: Pantalla, perms: ReadonlySet<string>, rol?: ReadonlySet<string>): Frase {
    const marca = (it: ItemPantalla): MarcaFrase | undefined => {
        if (!rol) return undefined;
        if (perms.has(it.clave) && !rol.has(it.clave)) return 'propio';
        if (!perms.has(it.clave) && rol.has(it.clave)) return 'quitado';
        return undefined;
    };
    return {
        puede: p.items.filter(it => perms.has(it.clave)).map(it => ({ it, marca: marca(it) })),
        // Montos y delicados se nombran solo si los tiene (o si se los quitaron): no son «lo que le falta». Lo quitado
        // va primero: la frase corta lo que no puede y lo quitado es lo que importa ver.
        noPuede: p.items.filter(it => !perms.has(it.clave) && (!it.marca || marca(it) === 'quitado'))
            .map(it => ({ it, marca: marca(it) }))
            .sort((a, b) => Number(b.marca === 'quitado') - Number(a.marca === 'quitado')),
    };
}

export const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** «y», o «e» antes de sonido /i/ («e imprimir», «e Ignacio»; pero «y hielo»). */
export const conY = (siguiente: string) => (/^[hH]?[iíIÍ](?![aeoáéóAEOÁÉÓ])/.test(siguiente.trim()) ? 'e' : 'y');

/** «A, B y C» (con «e» si C suena a /i/). */
export const enLista = (xs: readonly string[]) =>
    (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${conY(xs[xs.length - 1])} ${xs[xs.length - 1]}`);

/**
 * Las etiquetas que son un sustantivo («Plantillas de correo») no se leen tras «Puede…»: para la frase, su acción.
 * La etiqueta original sigue en la lista de interruptores y en la matriz.
 */
const ACCION_DE: Record<string, string> = {
    'costos.gestionar': 'Llevar los presupuestos y gastos de cada obra',
    'sistema.plantillas.gestionar': 'Cambiar las plantillas de correo',
    'sistema.tipos_doc.gestionar': 'Cambiar los tipos de documento',
    'sistema.tipos_ausencia.gestionar': 'Cambiar los tipos de ausencia',
    'sistema.reportes.gestionar': 'Programar los reportes automáticos',
    'sistema.avisos.gestionar': 'Publicar avisos de novedades',
    'sistema.alertas_documentos.gestionar': 'Configurar las alertas de documentos',
    'sistema.email.configurar': 'Configurar el correo del sistema',
    'sistema.estados.gestionar': 'Cambiar los estados de asistencia',
    'inventario.transferencias.orden_gerencia': 'Dar órdenes de gerencia',
};

/** Cómo se dice la acción dentro de una frase («Puede <esto>»): siempre empieza con un verbo. */
export const etiquetaFrase = (it: ItemPantalla) => ACCION_DE[it.clave] ?? it.etiqueta;

/**
 * La acción con su pantalla cuando sola no dice nada: «Ver la pestaña» → «Ver la pestaña Solicitudes»,
 * «Registrar» → «Registrar vehículos». Para listas sueltas (lo distinto de una persona), no para la frase de su fila.
 */
export function etiquetaLarga(it: ItemPantalla, p: Pantalla): string {
    if (it.etiqueta === 'Ver la pestaña') return `Ver la pestaña ${p.nombre}`;
    if (!it.etiqueta.includes(' ')) return `${it.etiqueta} ${p.nombre.toLowerCase()}`;
    return it.etiqueta;
}

/**
 * Esa pantalla vuelve a quedar como la trae el rol (lo demás no se toca; ver `respetarPuertas`). Si eso abre o cierra
 * su módulo (o es la fila puerta), la entrada queda también como la trae el rol: no se le inventa un propio aunque el
 * rol esté desordenado (pantallas sin su entrada).
 */
export function comoSuRol(perms: readonly string[], rol: ReadonlySet<string>, p: Pantalla): string[] {
    const claves = new Set(clavesPantalla(p));
    const set = new Set(perms.filter(c => !claves.has(c)));
    for (const c of claves) if (rol.has(c)) set.add(c);
    const puerta = grupoDe(p).puerta;
    const delRol = puerta ? rol.has(puerta) : undefined;
    return respetarPuertas(perms, normalizarPuertas([...set]), p, p.puerta ? { puerta: delRol } : { alCambiarModulo: delRol });
}

// ─── Puertas de módulo en una persona ─────────────────────────────────────

const grupoDe = (p: Pantalla) => GRUPOS.find(g => g.id === p.grupo) as Grupo;
/** Las pantallas que dependen de la entrada del módulo (no la fila puerta ni las libres). */
export const dependientes = (g: Grupo) => PANTALLAS.filter(p => p.grupo === g.id && !p.libre && !p.puerta);
const tieneAlgo = (set: ReadonlySet<string>, g: Grupo) => dependientes(g).some(p => clavesPantalla(p).some(c => set.has(c)));

export interface OpcionesPuertas {
    /** Fila puerta: cómo debe quedar la entrada según lo que se hizo (`aplicarNivel`/`alternarClave` la pueden volver a poner sola). */
    puerta?: boolean;
    /** Si la pantalla abre o vacía su módulo, cómo queda la entrada (si no se dice, como la deja el nivel). */
    alCambiarModulo?: boolean;
    /** Lo guardado: al vaciar el módulo, una entrada que ya estaba guardada SIN pantallas no se pierde. */
    guardado?: ReadonlySet<string>;
}

/**
 * `aplicarNivel` / `alternarClave` ponen en orden las puertas de TODOS los módulos (`normalizarPuertas`). En un rol
 * está bien; en una persona, no: un «quitado» de la entrada a un módulo (p. ej. un deny de `inventario.ver` que
 * venía del editor viejo) desaparecería al tocar otra pantalla, y un rol desordenado le inventaría propios.
 * Después de editar la pantalla `p`, las puertas vuelven a como estaban (`antes`), salvo la de su módulo cuando ese
 * módulo se abre (no tenía nada y ahora sí) o se vacía (la entrada implícita se va sola), o cuando lo que se editó es
 * la fila puerta misma (apagarla cierra el módulo, como en la matriz). Así solo cambia lo que se tocó.
 */
export function respetarPuertas(antes: readonly string[], despues: readonly string[], p: Pantalla, op: OpcionesPuertas = {}): string[] {
    const a = new Set(antes);
    const set = new Set(despues);
    for (const g of GRUPOS) {
        if (!g.puerta) continue;
        const clave = g.puerta;
        const poner = (si: boolean) => { if (si) set.add(clave); else set.delete(clave); };
        if (g.id !== p.grupo) { poner(a.has(clave)); continue; }
        if (p.puerta) {
            if (op.puerta !== undefined) poner(op.puerta);
            continue;
        }
        const tenia = tieneAlgo(a, g);
        const tiene = tieneAlgo(set, g);
        // Mientras el módulo siga abierto (o siga vacío), la entrada queda como estaba.
        if (tenia === tiene) { poner(a.has(clave)); continue; }
        // Se abre (nada → algo) o se vacía (algo → nada): la entrada como la dejó el nivel, salvo que se diga otra cosa.
        if (op.alCambiarModulo !== undefined) poner(op.alCambiarModulo);
        else if (!tiene && op.guardado?.has(clave) && !tieneAlgo(op.guardado, g)) poner(true);
    }
    return [...set];
}

/** Las entradas implícitas (hoy `inventario.ver`, que no es fila de ninguna pantalla) distintas a su rol. */
export function puertasDistintas(rol: ReadonlySet<string>, persona: ReadonlySet<string>): { grupo: Grupo; tipo: MarcaFrase }[] {
    return GRUPOS.filter(g => g.puertaImplicita && g.puerta && rol.has(g.puerta) !== persona.has(g.puerta))
        .map(g => ({ grupo: g, tipo: persona.has(g.puerta as string) ? 'propio' as const : 'quitado' as const }));
}

/** Lo que cuenta «Paula tiene N cosas distintas»: las acciones de las pantallas más las entradas implícitas. */
export const cosasDistintasPersona = (rol: ReadonlySet<string>, persona: ReadonlySet<string>) =>
    cosasDistintas(rol, persona) + puertasDistintas(rol, persona).length;

/** El módulo tiene pantallas marcadas pero le falta la entrada: no se ve nada de él aunque la frase diga «Puede…». */
export const moduloSinEntrada = (perms: ReadonlySet<string>, g: Grupo) => !!g.puerta && !perms.has(g.puerta) && tieneAlgo(perms, g);

/** Lo que una persona tiene: rol + grant − deny (la misma regla de `permisos.service.componerPermisos`). */
export function efectivos(rolPerms: readonly string[], overrides: readonly Override[]): string[] {
    const set = new Set(rolPerms);
    for (const o of overrides) {
        if (o.tipo === 'grant') set.add(o.permiso_clave);
        else set.delete(o.permiso_clave);
    }
    return [...set];
}

/**
 * Los overrides a guardar después de editar lo que la persona tiene. Solo cambian las claves que se tocaron
 * (`antes` ≠ `ahora`): si quedó igual a su rol, el override se borra; si no, `grant` (la tiene y el rol no) o
 * `deny` (no la tiene y el rol sí). Los que no se tocaron quedan tal cual, aunque sean redundantes (un `grant`
 * de algo que el rol ya trae la protege si el rol lo pierde). `desdeCero` («Dejar todo como su rol» y lo que se
 * haya cambiado después): se arman todos de nuevo y los redundantes se van.
 */
export function overridesAlGuardar(args: {
    antes: ReadonlySet<string>;
    ahora: ReadonlySet<string>;
    rol: ReadonlySet<string>;
    actuales: readonly Override[];
    desdeCero?: boolean;
}): Override[] {
    const { antes, ahora, rol, actuales, desdeCero } = args;
    const mapa = new Map<string, Override['tipo']>();
    if (desdeCero) {
        for (const c of ahora) if (!rol.has(c)) mapa.set(c, 'grant');
        for (const c of rol) if (!ahora.has(c)) mapa.set(c, 'deny');
    } else {
        for (const o of actuales) mapa.set(o.permiso_clave, o.tipo);
        const tocadas = new Set([...[...antes].filter(c => !ahora.has(c)), ...[...ahora].filter(c => !antes.has(c))]);
        for (const c of tocadas) {
            if (ahora.has(c) === rol.has(c)) mapa.delete(c);
            else mapa.set(c, ahora.has(c) ? 'grant' : 'deny');
        }
    }
    return [...mapa].map(([permiso_clave, tipo]) => ({ permiso_clave, tipo })).sort((a, b) => a.permiso_clave.localeCompare(b.permiso_clave));
}

/** Cuántas claves cambiaron entre dos listas (lo que dice el pie «N cambios sin guardar»). */
export function cambiosEntre(a: readonly string[], b: readonly string[]): number {
    const sa = new Set(a), sb = new Set(b);
    return a.filter(c => !sb.has(c)).length + b.filter(c => !sa.has(c)).length;
}
