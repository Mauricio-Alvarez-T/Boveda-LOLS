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
 */
export const CLAVE_VER_COMO = 'sgdl_ver_como';
/** Un aviso para mostrar al volver a la cuenta propia (se lee una vez, después de recargar). */
export const CLAVE_AVISO_VER_COMO = 'sgdl_ver_como_aviso';
/** El 403 del servidor (middleware/auth.js) cuando se intenta guardar algo con la sesión prestada. */
export const CODIGO_SOLO_LECTURA = 'VER_COMO_SOLO_LECTURA';

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
    token: string;
    user: User;
    /** Cuándo vence (ms desde 1970). */
    vence: number;
    quien: { id: number; nombre: string | null };
    /** La ficha de Soporte de esa persona, si se tenía al entrar. */
    ficha?: FichaVerComo;
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

/** La sesión sin una ficha que no sirve (la sesión igual vale). */
function conFichaValida(s: SesionVerComo, ficha: unknown): SesionVerComo {
    const limpia: SesionVerComo = { token: s.token, user: s.user, vence: s.vence, quien: s.quien };
    const f = fichaVerComoValida(ficha, s.user.id);
    if (f) limpia.ficha = f;
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
 * en silencio al token propio con la pantalla de otro.
 */
export function tokenVerComoGuardado(almacen: Almacen | null | undefined): string | null {
    const s = leerCruda(almacen) as Partial<SesionVerComo> | null;
    return s && typeof s.token === 'string' && s.token ? s.token : null;
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

/** Los textos de los avisos de la sesión prestada (franja, toasts). */
export const AVISOS_VER_COMO = {
    soloLectura: 'Estás viendo como otra persona: solo lectura',
    soloLecturaDetalle: 'No se guardó nada. Para hacer cambios, vuelve a tu cuenta.',
    vencio: 'Se acabó el tiempo de «ver como» (30 min): volviste a tu cuenta.',
    terminoServidor: 'El «ver como» terminó (venció o cambiaron los permisos de esa persona): volviste a tu cuenta.',
    cerroSesionPropia: 'Cerraste tu sesión en otra pestaña: también se cerró el «ver como».',
} as const;
