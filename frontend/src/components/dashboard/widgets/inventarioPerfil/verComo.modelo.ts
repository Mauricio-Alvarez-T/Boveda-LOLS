import { comoObra } from './comoObra';
import { DESCRIPCION_RESPALDO, descripcionInventario, type VistaInventario } from './perfil';
import type { InventarioPerfilApi, PersonaPerfil, PuedePerfil, SolicitudPerfil } from './tipos';

/**
 * «Ver como» del detalle «Inventario» del Inicio, SOLO para el Super Administrador (Marcos 2026-10-22: «con Mauricio
 * tengamos una vista propia como super administradores pero que a la vez igual podamos ver los formatos de otros
 * trabajadores ya que somos los programadores»). Con UNA sola carga (la suya, de todas las obras) muestra:
 *   - «Super Admin» → VistaSuperAdmin (lo de siempre, por defecto).
 *   - «Leonardo» → VistaLeonardo con sus mismos datos (Leonardo también aprueba y ve todas las obras).
 *   - «Daphne» → VistaJefatura con lo que puede Daphne (`comoJefatura`: ve diferencias, no aprueba ni las resuelve).
 *   - «Jefe de obra» → VistaObra con lo que va a una obra (`comoObra` de comoObra.ts) y un selector de obra.
 *   - «El resto» → lo de producción (RespaldoInventario: Paula, Rodrigo, Matías, Luis, bodegueros) con sus cifras.
 * La elección se recuerda por persona en localStorage (comodidad: si falla o no hay, vuelve a «Super Admin»).
 * Lógica PURA, con test en `verComo.modelo.test.ts`; el control está en VerComo.tsx.
 */

/** Las opciones, en orden; `key` = la vista que se muestra (la regla de perfil.ts). */
export const OPCIONES_VER_COMO: readonly { key: VistaInventario; texto: string }[] = [
    { key: 'superadmin', texto: 'Super Admin' },
    { key: 'leonardo', texto: 'Leonardo' },
    { key: 'jefatura', texto: 'Daphne' },
    { key: 'obra', texto: 'Jefe de obra' },
    { key: 'otro', texto: 'El resto' },
];

/** Lo que se ve al entrar (y si lo guardado no sirve). */
export const VER_COMO_INICIAL: VistaInventario = 'superadmin';

/** Una opción válida, o la inicial. */
export const leerVerComo = (texto: unknown): VistaInventario =>
    OPCIONES_VER_COMO.find(o => o.key === texto)?.key ?? VER_COMO_INICIAL;

/** La clave de localStorage de cada persona (Marcos y Mauricio, cada uno la suya). */
export const claveVerComo = (userId: number | string): string => `boveda-inicio-inventario-ver-como:${userId}`;

/** Lo mínimo de Storage que se usa (así el test pasa uno falso). */
type Almacen = Pick<Storage, 'getItem' | 'setItem'>;

/** localStorage, o null si el navegador no lo deja (ventana privada, sitio bloqueado, miniatura). */
export function almacenLocal(): Almacen | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}

/** Lo que eligió esa persona la última vez; sin persona, sin almacén o si falla, la inicial. */
export function verComoGuardado(almacen: Almacen | null | undefined, userId: number | string | null | undefined): VistaInventario {
    if (!almacen || userId == null) return VER_COMO_INICIAL;
    try {
        return leerVerComo(almacen.getItem(claveVerComo(userId)));
    } catch {
        return VER_COMO_INICIAL;
    }
}

/** Recuerda la elección de esa persona. Si no se puede, no pasa nada (la próxima vez parte en «Super Admin»). */
export function guardarVerComo(almacen: Almacen | null | undefined, userId: number | string | null | undefined, vista: VistaInventario): void {
    if (!almacen || userId == null) return;
    try {
        almacen.setItem(claveVerComo(userId), vista);
    } catch {
        /* sin almacenamiento: solo se pierde la comodidad */
    }
}

/** La línea bajo el título «Inventario»: la de la vista elegida (en «Jefe de obra», con el nombre de esa obra). */
export function descripcionVerComo(
    vista: VistaInventario,
    { obra, aprobadores }: { obra?: string | null; aprobadores?: readonly PersonaPerfil[] | null } = {},
): string {
    return vista === 'otro' ? DESCRIPCION_RESPALDO : descripcionInventario(vista, { obra, aprobadores });
}

/** La nota chica bajo el selector: qué se está viendo en verdad. null si no hace falta. */
export function notaVerComo(vista: VistaInventario, { obra }: { obra?: string | null } = {}): string | null {
    switch (vista) {
        case 'obra': {
            const nombre = obra?.trim();
            return `${nombre ? `Lo que va a ${nombre}` : 'Lo que va a esa obra'}: todas las solicitudes con ese destino. `
                + 'Un jefe de obra real ve solo las que pidió él.';
        }
        case 'otro':
            return 'Así lo ven Paula, Rodrigo, Matías, Luis y los bodegueros, pero con tus cifras: cada uno ve las suyas.';
        default:
            return null;
    }
}

/** Lo que puede Daphne (rol Administrador + «Ver diferencias», mig 131): ve todo y las diferencias, sin aprobar. */
export const PUEDE_JEFATURA: PuedePerfil = {
    aprobar: false,
    ver_diferencias: true,
    resolver_diferencias: false,
    solicitar: false,
    recibir: false,
    sod_bypass: false,
};

/**
 * La respuesta del Super Administrador como la recibe Daphne: el mismo alcance (las dos ven todas las obras) y la lista
 * de diferencias, pero con lo que ella puede: no aprueba (`puede_aprobar` null) ni pidió nada (`propia` false).
 * No cambia `datos`.
 */
export function comoJefatura(datos: InventarioPerfilApi): InventarioPerfilApi {
    return {
        ...datos,
        perfil: 'jefatura',
        super_admin: false,
        puede: { ...PUEDE_JEFATURA },
        solicitudes: datos.solicitudes.map((s): SolicitudPerfil => ({ ...s, propia: false, puede_aprobar: null, bloqueo_aprobar: null })),
    };
}

/**
 * Los datos para la vista elegida: los del Super Administrador tal cual (su vista y la de Leonardo), como Daphne, o
 * como la obra `obra` (null si no hay ninguna obra para elegir). «El resto» no usa estos datos: null.
 */
export function datosVerComo(
    vista: VistaInventario,
    datos: InventarioPerfilApi,
    obra?: { id: number; nombre: string | null } | null,
): InventarioPerfilApi | null {
    switch (vista) {
        case 'superadmin':
        case 'leonardo':
            return datos;
        case 'jefatura':
            return comoJefatura(datos);
        case 'obra':
            return obra ? comoObra(datos, obra) : null;
        default:
            return null;
    }
}
