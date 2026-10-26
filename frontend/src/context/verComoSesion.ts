import type { User } from '../types';

/**
 * «Ver como esta persona» (Soporte · usuarios, solo Super Administrador): la sesión PRESTADA, pura y con test
 * (`verComoSesion.test.ts`). La usan el AuthContext (entrar / volver) y `services/api.ts` (qué token mandar y qué
 * hacer con el 401 y el 403 de solo lectura).
 *
 * Dónde vive cada cosa:
 *   - La cuenta propia sigue en localStorage (`sgdl_token` / `sgdl_user`), sin tocarla.
 *   - La prestada va en sessionStorage (`sgdl_ver_como`): solo en ESTA pestaña, sobrevive a un F5 y se borra al cerrar
 *     la pestaña. Así las otras pestañas siguen en la cuenta propia y, si se cierra el navegador, no queda nada.
 *   - Nunca en la URL.
 * El token lo emite el servidor (POST /api/soporte/usuarios/:id/ver-como): 30 min, solo lectura (`imp` + `ro`).
 *
 * Modo cambios (Marcos 2026-10-26): desde la franja, «Activar cambios» pide al servidor (POST
 * /api/soporte/ver-como/escritura) un token de la MISMA persona que deja escribir (`rw`) y vence a la misma hora. Se
 * guarda JUNTO al de solo lectura (`tokenCambios`): mientras exista, es el que se manda; «Volver a solo lectura» lo
 * borra y se vuelve a usar el de solo lectura (sin otro endpoint). Como vive en la misma sesión de la pestaña, un F5
 * mantiene el modo que estaba, y al vencer se va todo junto.
 */
export const CLAVE_VER_COMO = 'sgdl_ver_como';
/** Un aviso para mostrar al volver a la cuenta propia (se lee una vez, después de recargar). */
export const CLAVE_AVISO_VER_COMO = 'sgdl_ver_como_aviso';
/** El 403 del servidor (middleware/auth.js) cuando se intenta guardar algo con la sesión prestada. */
export const CODIGO_SOLO_LECTURA = 'VER_COMO_SOLO_LECTURA';
/** El 403 del servidor en modo cambios para lo que nunca se hace desde la cuenta de otro (contraseña, usuarios…). */
export const CODIGO_CAMBIOS_BLOQUEADO = 'VER_COMO_CAMBIOS_BLOQUEADO';
/** El 403 del servidor cuando el modo cambios ya no vale (quien mira dejó de ser Super Admin, la persona quedó inactiva). */
export const CODIGO_CAMBIOS_INVALIDO = 'VER_COMO_CAMBIOS_INVALIDO';

/** Lo que responde el servidor al pedir un «ver como». */
export interface RespuestaVerComo {
    token: string;
    user: User;
    /** ISO: cuándo vence el token. */
    vence: string;
    minutos: number;
    /** Quién mira (el Super Administrador). */
    quien: { id: number; nombre: string | null };
}

/**
 * Encabezado con la sesión PROPIA del Super Administrador (la de localStorage) al pasar a modo cambios: el servidor
 * exige las dos (el token de solo lectura en `Authorization` y el propio aquí), así el de solo lectura solo no basta.
 * Nunca va en la URL ni en el body.
 */
export const ENCABEZADO_SESION_PROPIA = 'X-Sesion-Propia';

/** `{ 'X-Sesion-Propia': 'Bearer <token>' }`, o null si no hay sesión propia guardada (entonces no se pide). */
export function encabezadoSesionPropia(tokenPropio: string | null | undefined): Record<string, string> | null {
    return typeof tokenPropio === 'string' && tokenPropio.trim().length > 0
        ? { [ENCABEZADO_SESION_PROPIA]: `Bearer ${tokenPropio.trim()}` }
        : null;
}

/** Lo que responde el servidor al pasar a modo cambios (POST /api/soporte/ver-como/escritura). */
export interface RespuestaCambiosVerComo {
    /** Token de la misma persona con `rw`. */
    token: string;
    /** ISO: la misma hora de vencimiento que el de solo lectura. */
    vence: string;
    modo: 'cambios';
    quien: { id: number; nombre: string | null };
}

/** Un permiso de la ficha de Soporte, como se guarda con la sesión prestada (nombre y módulo del catálogo + origen). */
export interface PermisoVerComo {
    clave: string;
    modulo: string;
    nombre: string;
    descripcion?: string | null;
    orden?: number;
    /** rol = viene de su rol · propio = dado a esta persona · quitado = su rol lo trae, pero a ella se le quitó. */
    origen: 'rol' | 'propio' | 'quitado';
}

/**
 * Lo de la ficha de Soporte que se guarda al entrar a «ver como» (recuadro «Lo que puede usar…» del Inicio): mientras
 * se ve como otra persona no se puede pedir la ficha (/api/soporte no se encadena), así que va junto a la sesión
 * prestada, con su misma vida (sessionStorage de la pestaña; se borra al salir). Sin ella el recuadro igual se arma
 * con los permisos del token.
 */
export interface FichaVerComo {
    /** De quién es (debe ser la persona de la sesión; si no, no se usa). */
    usuarioId: number;
    nombre: string;
    rol: string;
    permisos: PermisoVerComo[];
}

/** La sesión prestada, como se guarda. */
export interface SesionVerComo {
    /** El token de SOLO LECTURA (siempre está: es al que se vuelve). */
    token: string;
    user: User;
    /** Cuándo vence (ms desde 1970). */
    vence: number;
    quien: { id: number; nombre: string | null };
    /** La ficha de Soporte de esa persona, si se tenía al entrar. */
    ficha?: FichaVerComo;
    /** Modo cambios: el token que deja escribir. Si está, es el que se manda; sin él, solo lectura. */
    tokenCambios?: string;
}

/** Lo mínimo de Storage que se usa (así el test pasa uno falso). */
export type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** sessionStorage, o null si el navegador no lo deja (ventana privada estricta, sitio bloqueado). */
export function almacenSesion(): Almacen | null {
    try {
        return typeof window === 'undefined' ? null : window.sessionStorage;
    } catch {
        return null;
    }
}

const esUsuario = (u: unknown): u is User => {
    const x = u as Partial<User> | null;
    return !!x && typeof x === 'object' && typeof x.id === 'number' && typeof x.nombre === 'string' && Array.isArray(x.permisos);
};

const esSesion = (s: unknown): s is SesionVerComo => {
    const x = s as Partial<SesionVerComo> | null;
    return !!x && typeof x === 'object' && typeof x.token === 'string' && x.token.length > 0
        && typeof x.vence === 'number' && Number.isFinite(x.vence) && esUsuario(x.user)
        && !!x.quien && typeof x.quien.id === 'number';
};

const ORIGENES: readonly PermisoVerComo['origen'][] = ['rol', 'propio', 'quitado'];

const esPermisoVerComo = (p: unknown): p is PermisoVerComo => {
    const x = p as Partial<PermisoVerComo> | null;
    return !!x && typeof x === 'object' && typeof x.clave === 'string' && x.clave.length > 0
        && typeof x.modulo === 'string' && typeof x.nombre === 'string' && ORIGENES.includes(x.origen as PermisoVerComo['origen']);
};

/**
 * La ficha guardada, si sirve para esta persona (`usuarioId`); si no, null. Los permisos que no traen lo mínimo se
 * descartan uno a uno (el resto se usa).
 */
export function fichaVerComoValida(f: unknown, usuarioId: number): FichaVerComo | null {
    const x = f as Partial<FichaVerComo> | null;
    if (!x || typeof x !== 'object' || x.usuarioId !== usuarioId || !Array.isArray(x.permisos)) return null;
    return {
        usuarioId,
        nombre: typeof x.nombre === 'string' ? x.nombre : '',
        rol: typeof x.rol === 'string' ? x.rol : '',
        permisos: x.permisos.filter(esPermisoVerComo),
    };
}

const esTokenTexto = (t: unknown): t is string => typeof t === 'string' && t.length > 0;

/**
 * La sesión sin una ficha que no sirve (la sesión igual vale). El token de cambios se conserva solo si es un texto
 * (si viene roto, se queda en solo lectura: lo seguro).
 */
function conFichaValida(s: SesionVerComo, ficha: unknown): SesionVerComo {
    const limpia: SesionVerComo = { token: s.token, user: s.user, vence: s.vence, quien: s.quien };
    const f = fichaVerComoValida(ficha, s.user.id);
    if (f) limpia.ficha = f;
    if (esTokenTexto(s.tokenCambios)) limpia.tokenCambios = s.tokenCambios;
    return limpia;
}

/** ¿La sesión prestada está en modo cambios? */
export const enModoCambios = (s: SesionVerComo | null | undefined): boolean => !!s && esTokenTexto(s.tokenCambios);

/** El token que se manda: el de cambios si está activo; si no, el de solo lectura. */
export const tokenActivo = (s: SesionVerComo): string => (esTokenTexto(s.tokenCambios) ? s.tokenCambios : s.token);

/**
 * La sesión en modo cambios, con el token que dio el servidor; null si la respuesta no sirve o es de otro Super
 * Administrador. Vence a la hora más temprana de las dos (el servidor da la misma: nunca alarga).
 */
export function sesionConCambios(s: SesionVerComo, r: RespuestaCambiosVerComo | null | undefined): SesionVerComo | null {
    if (!r || !esTokenTexto(r.token) || r.token === s.token) return null;
    const vence = Date.parse(r.vence);
    if (!Number.isFinite(vence)) return null;
    if (r.quien && typeof r.quien.id === 'number' && r.quien.id !== s.quien.id) return null;
    return { ...conFichaValida(s, s.ficha), tokenCambios: r.token, vence: Math.min(s.vence, vence) };
}

/** La misma sesión, de vuelta en solo lectura (sin el token de cambios). */
export function sesionSoloLectura(s: SesionVerComo): SesionVerComo {
    const limpia = conFichaValida(s, s.ficha); // copia nueva: borrar aquí no toca `s`
    delete limpia.tokenCambios;
    return limpia;
}

/**
 * La respuesta del servidor como sesión guardable; null si no trae lo necesario. `ficha` = lo de la ficha de Soporte de
 * esa persona (se guarda solo si es de ella).
 */
export function sesionDesdeRespuesta(r: RespuestaVerComo | null | undefined, ficha?: FichaVerComo | null): SesionVerComo | null {
    if (!r) return null;
    const vence = Date.parse(r.vence);
    const s = { token: r.token, user: r.user, vence, quien: r.quien };
    return esSesion(s) ? conFichaValida(s, ficha) : null;
}

function leerCruda(almacen: Almacen | null | undefined): unknown {
    if (!almacen) return null;
    try {
        const raw = almacen.getItem(CLAVE_VER_COMO);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/**
 * La sesión prestada vigente, o null. Si lo guardado no sirve o ya venció, lo borra (la próxima carga entra a la
 * cuenta propia).
 */
export function leerSesionVerComo(almacen: Almacen | null | undefined, ahora: number = Date.now()): SesionVerComo | null {
    const s = leerCruda(almacen);
    if (s === null) return null;
    if (!esSesion(s) || s.vence <= ahora) {
        borrarSesionVerComo(almacen);
        return null;
    }
    return conFichaValida(s, s.ficha);
}

/**
 * El token prestado si hay uno guardado, AUNQUE haya vencido: mientras la app se ve como la otra persona, cada
 * petición va con su token; si venció, el servidor responde 401 y `api.ts` vuelve a la cuenta propia. Nunca se cae
 * en silencio al token propio con la pantalla de otro. En modo cambios, el de cambios (si no, el de solo lectura).
 */
export function tokenVerComoGuardado(almacen: Almacen | null | undefined): string | null {
    const s = leerCruda(almacen) as Partial<SesionVerComo> | null;
    if (!s || !esTokenTexto(s.token)) return null;
    return esTokenTexto(s.tokenCambios) ? s.tokenCambios : s.token;
}

/**
 * Adónde volver al salir: la ficha de la persona que se estaba mirando (`/soporte?u=ID`), aunque la sesión haya
 * vencido; sin nada guardado, la lista. El id no es un dato sensible (la página solo la abre el Super Administrador).
 */
export function rutaAlSalir(almacen: Almacen | null | undefined): string {
    const s = leerCruda(almacen) as Partial<SesionVerComo> | null;
    const id = s?.user?.id;
    return typeof id === 'number' && Number.isInteger(id) ? `/soporte?u=${id}` : '/soporte';
}

/** Guarda la sesión prestada. false si el navegador no deja (entonces no se entra a «ver como»). */
export function guardarSesionVerComo(almacen: Almacen | null | undefined, s: SesionVerComo): boolean {
    if (!almacen) return false;
    try {
        almacen.setItem(CLAVE_VER_COMO, JSON.stringify(s));
        return true;
    } catch {
        return false;
    }
}

export function borrarSesionVerComo(almacen: Almacen | null | undefined): void {
    try { almacen?.removeItem(CLAVE_VER_COMO); } catch { /* nada que borrar */ }
}

/** Deja un aviso para mostrar después de recargar. */
export function guardarAvisoVerComo(almacen: Almacen | null | undefined, texto: string): void {
    try { almacen?.setItem(CLAVE_AVISO_VER_COMO, texto); } catch { /* sin aviso */ }
}

/** Lee y borra el aviso pendiente. */
export function tomarAvisoVerComo(almacen: Almacen | null | undefined): string | null {
    if (!almacen) return null;
    try {
        const t = almacen.getItem(CLAVE_AVISO_VER_COMO);
        if (t) almacen.removeItem(CLAVE_AVISO_VER_COMO);
        return t || null;
    } catch {
        return null;
    }
}

/** Minutos que quedan, redondeados hacia arriba (0 = venció). */
export function minutosRestantes(vence: number, ahora: number = Date.now()): number {
    const ms = vence - ahora;
    return ms <= 0 ? 0 : Math.ceil(ms / 60_000);
}

/** «vence en 28 min» · «vence en 1 min» · «venció». */
export function textoVence(vence: number, ahora: number = Date.now()): string {
    const m = minutosRestantes(vence, ahora);
    return m === 0 ? 'venció' : `vence en ${m} min`;
}

/** ¿Es el 403 de «solo lectura» del servidor? */
export const esErrorSoloLectura = (data: unknown): boolean =>
    !!data && typeof data === 'object' && (data as { code?: unknown }).code === CODIGO_SOLO_LECTURA;

/** ¿Es el 403 de lo que nunca se hace en modo cambios (contraseña, usuarios, roles, permisos…)? */
export const esErrorCambiosBloqueado = (data: unknown): boolean =>
    !!data && typeof data === 'object' && (data as { code?: unknown }).code === CODIGO_CAMBIOS_BLOQUEADO;

/** ¿Es el 403 de «el modo cambios terminó» (la app vuelve a la cuenta propia, como con un 401)? */
export const esErrorCambiosInvalido = (data: unknown): boolean =>
    !!data && typeof data === 'object' && (data as { code?: unknown }).code === CODIGO_CAMBIOS_INVALIDO;

/**
 * La advertencia del modal «Activar cambios» (texto acordado con el dueño, 2026-10-26). `superAdmin` = quien mira; sin
 * nombre, «Super Administrador».
 */
export function textoAdvertenciaCambios(nombre: string, rol: string | null | undefined, superAdmin: string | null | undefined): string {
    const persona = rol ? `${nombre} (${rol})` : nombre;
    return `Vas a poder hacer cambios como ${persona}. Lo que guardes quedará a su nombre en la app, y en el historial `
        + `de actividad quedará registrado que lo hiciste tú (${superAdmin || 'Super Administrador'}). `
        + 'Úsalo solo para arreglar lo que te pidieron.';
}

/** Los textos de los avisos de la sesión prestada (franja, toasts). */
export const AVISOS_VER_COMO = {
    soloLectura: 'Estás viendo como otra persona: solo lectura',
    soloLecturaDetalle: 'No se guardó nada. Si te pidieron arreglar algo, toca «Activar cambios» en la franja de arriba.',
    noSeActivaronCambios: 'No se pudo activar el modo cambios. Sigues en solo lectura.',
    sinSesionPropia: 'Para activar cambios vuelve a entrar a tu cuenta.',
    vencio: 'Se acabó el tiempo de «ver como» (30 min): volviste a tu cuenta.',
    terminoServidor: 'El «ver como» terminó (venció o cambiaron los permisos de esa persona): volviste a tu cuenta.',
    cerroSesionPropia: 'Cerraste tu sesión en otra pestaña: también se cerró el «ver como».',
} as const;
