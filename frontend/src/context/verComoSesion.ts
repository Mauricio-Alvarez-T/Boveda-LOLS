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

/** La sesión prestada, como se guarda. */
export interface SesionVerComo {
    token: string;
    user: User;
    /** Cuándo vence (ms desde 1970). */
    vence: number;
    quien: { id: number; nombre: string | null };
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

/** La respuesta del servidor como sesión guardable; null si no trae lo necesario. */
export function sesionDesdeRespuesta(r: RespuestaVerComo | null | undefined): SesionVerComo | null {
    if (!r) return null;
    const vence = Date.parse(r.vence);
    const s = { token: r.token, user: r.user, vence, quien: r.quien };
    return esSesion(s) ? s : null;
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
    return s;
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
