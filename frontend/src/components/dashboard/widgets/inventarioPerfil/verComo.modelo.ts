import { comoObra } from './comoObra';
import { quienAprueba } from './formato';
import { descripcionInventario, type VistaInventario } from './perfil';
import type { InventarioPerfilApi, PersonaPerfil, PuedePerfil, SolicitudPerfil } from './tipos';

/**
 * «Ver como» del detalle «Inventario» del Inicio, SOLO para el Super Administrador (Marcos 2026-10-22: «con Mauricio
 * tengamos una vista propia como super administradores pero que a la vez igual podamos ver los formatos de otros
 * trabajadores ya que somos los programadores»). Con UNA sola carga (la suya, de todas las obras) muestra:
 *   - «Super Admin» → VistaSuperAdmin (lo de siempre, por defecto).
 *   - quien aprueba (su nombre, de `aprobadores`) → VistaLeonardo como la ve él (`comoAprobador`).
 *   - «Jefatura» → VistaJefatura con lo que puede quien ve diferencias sin aprobar (`comoJefatura`).
 *   - «Jefe de obra» → VistaObra con lo de una obra (`comoObra` de comoObra.ts) y un selector de obra.
 * Sin «Otros perfiles» (Marcos 2026-10-23): los demás solo miran o tocan para que el ciclo avance; las vistas que
 * importan son estas.
 * Nunca un nombre fijo: las etiquetas son roles, y quien aprueba sale de la respuesta. Cada opción que no es la propia
 * lleva una nota chica que dice qué se está viendo. La elección se recuerda por persona en localStorage (comodidad: si
 * falla o no hay, vuelve a «Super Admin»).
 * Lógica PURA, con test en `verComo.modelo.test.ts`; el control está en VerComo.tsx.
 */

/** Las vistas que se pueden mirar con «Ver como» (todas menos el respaldo). */
export type VistaVerComo = Exclude<VistaInventario, 'otro'>;

export interface OpcionVerComo { key: VistaVerComo; texto: string }

/** Sin nombre en la respuesta (nadie aprueba, o más de dos): el rol. */
export const TEXTO_QUIEN_APRUEBA = 'Quien aprueba';

/**
 * Las opciones, en orden; `key` = la vista que se muestra (la regla de perfil.ts). La de quien aprueba lleva su primer
 * nombre (`aprobadores`: «Leonardo», «Leonardo o Ana»); sin él, «Quien aprueba».
 */
export function opcionesVerComo(aprobadores?: readonly PersonaPerfil[] | null): OpcionVerComo[] {
    return [
        { key: 'superadmin', texto: 'Super Admin' },
        { key: 'leonardo', texto: quienAprueba(aprobadores) ?? TEXTO_QUIEN_APRUEBA },
        { key: 'jefatura', texto: 'Jefatura' },
        { key: 'obra', texto: 'Jefe de obra' },
    ];
}

/** Las opciones sin datos aún (las claves sirven igual para leer lo guardado). */
export const OPCIONES_VER_COMO: readonly OpcionVerComo[] = opcionesVerComo();

/** Lo que se ve al entrar (y si lo guardado no sirve). */
export const VER_COMO_INICIAL: VistaVerComo = 'superadmin';

/** Una opción válida, o la inicial. */
export const leerVerComo = (texto: unknown): VistaVerComo =>
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
export function verComoGuardado(almacen: Almacen | null | undefined, userId: number | string | null | undefined): VistaVerComo {
    if (!almacen || userId == null) return VER_COMO_INICIAL;
    try {
        return leerVerComo(almacen.getItem(claveVerComo(userId)));
    } catch {
        return VER_COMO_INICIAL;
    }
}

/** Recuerda la elección de esa persona. Si no se puede, no pasa nada (la próxima vez parte en «Super Admin»). */
export function guardarVerComo(almacen: Almacen | null | undefined, userId: number | string | null | undefined, vista: VistaVerComo): void {
    if (!almacen || userId == null) return;
    try {
        almacen.setItem(claveVerComo(userId), vista);
    } catch {
        /* sin almacenamiento: solo se pierde la comodidad */
    }
}

/** La línea bajo el título «Inventario»: la de la vista elegida (en «Jefe de obra», con el nombre de esa obra). */
export function descripcionVerComo(
    vista: VistaVerComo,
    { obra, aprobadores }: { obra?: string | null; aprobadores?: readonly PersonaPerfil[] | null } = {},
): string {
    return descripcionInventario(vista, { obra, aprobadores });
}

/**
 * La nota chica bajo el selector: qué se está viendo de verdad. En todas las opciones que no son la propia (al otro
 * día puede abrir directo en otra: lo recordado no vence), así no se confunde con su vista. null en «Super Admin».
 */
export function notaVerComo(
    vista: VistaVerComo,
    { obra, aprobadores }: { obra?: string | null; aprobadores?: readonly PersonaPerfil[] | null } = {},
): string | null {
    switch (vista) {
        case 'leonardo': {
            const quien = quienAprueba(aprobadores);
            return `Así lo ve ${quien ?? 'quien aprueba'}, con los mismos datos.`;
        }
        case 'jefatura':
            return 'Así lo ve jefatura (ve las diferencias, no aprueba), con los mismos datos.';
        case 'obra': {
            const nombre = obra?.trim();
            return `${nombre ? `Lo de ${nombre}` : 'Lo de esa obra'}: lo que va a ella y las devoluciones y traslados que salen de ahí. `
                + 'Un jefe de obra real ve solo lo que pidió él.';
        }
        default:
            return null;
    }
}

/** Lo que puede jefatura (rol Administrador + «Ver diferencias», mig 131): ve todo y las diferencias, sin aprobar. */
export const PUEDE_JEFATURA: PuedePerfil = {
    aprobar: false,
    ver_diferencias: true,
    resolver_diferencias: false,
    solicitar: false,
    recibir: false,
    sod_bypass: false,
};

/**
 * La respuesta del Super Administrador como la recibe jefatura: el mismo alcance (las dos ven todas las obras) y la lista
 * de diferencias, pero con lo que puede: no aprueba (`puede_aprobar` null) ni pidió nada (`propia` false).
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
 * La respuesta del Super Administrador como la recibe quien aprueba (mismo alcance: los dos ven todas las obras). Lo que
 * se calculó para el Super Administrador se recalcula para él: con UN solo aprobador, es «propia» lo que pidió él y no
 * la puede aprobar (SoD: solicitante ≠ aprobador, sin `sod_bypass`: «la pediste tú: la aprueba otra persona»); lo demás
 * pendiente sí. Con cero o varios no se sabe quién mira: nada es propia. Sin `sod_bypass` ni `super_admin`.
 * No cambia `datos`.
 */
export function comoAprobador(datos: InventarioPerfilApi): InventarioPerfilApi {
    const unico = datos.aprobadores.length === 1 ? datos.aprobadores[0].id : null;
    return {
        ...datos,
        super_admin: false,
        puede: { ...datos.puede, sod_bypass: false },
        solicitudes: datos.solicitudes.map((s): SolicitudPerfil => {
            const propia = unico != null && s.solicitante?.id === unico;
            if (s.estado !== 'pendiente') return { ...s, propia, puede_aprobar: null, bloqueo_aprobar: null };
            return { ...s, propia, puede_aprobar: !propia, bloqueo_aprobar: propia ? 'sod_solicitante' : null };
        }),
    };
}

/**
 * Los datos para la vista elegida: los del Super Administrador tal cual (su vista), como quien aprueba, como jefatura,
 * o como la obra `obra` (null si no hay ninguna obra para elegir).
 */
export function datosVerComo(
    vista: VistaVerComo,
    datos: InventarioPerfilApi,
    obra?: { id: number; nombre: string | null } | null,
): InventarioPerfilApi | null {
    switch (vista) {
        case 'superadmin':
            return datos;
        case 'leonardo':
            return comoAprobador(datos);
        case 'jefatura':
            return comoJefatura(datos);
        case 'obra':
            return obra ? comoObra(datos, obra) : null;
        default:
            return null;
    }
}
