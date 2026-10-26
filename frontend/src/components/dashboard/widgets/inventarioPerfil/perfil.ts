import { quienAprueba } from './formato';
import type { InventarioPerfilApi, PersonaPerfil } from './tipos';

/**
 * Qué vista del detalle «Inventario» del Inicio ve quien entra (Marcos 2026-10-22, del lienzo de diseño):
 *   - `superadmin` → VistaSuperAdmin (opción A, «Super Administrador»): Marcos y Mauricio (rol 1). Sin «Ver como» en el
 *     Inicio (Marcos 2026-10-26): las vistas de los demás se revisan en Soporte · usuarios.
 *   - `leonardo` → VistaLeonardo (opción A «Lo tuyo primero»): quien aprueba y ve todas las obras.
 *   - `jefatura` → VistaJefatura (opción B «El circuito»): ve todas las obras y las diferencias, sin aprobar (Daphne).
 *   - `obra` → VistaObra (opción A): pide o recibe materiales para su obra (jefes de obra y prevencionistas).
 *   - `otro` → lo de producción: «Solicitudes» + «Alertas de inventario» (RespaldoInventario).
 * Lógica PURA, con test en `perfil.test.ts`.
 */
export type VistaInventario = 'superadmin' | 'leonardo' | 'jefatura' | 'obra' | 'otro';

/** Props de las vistas: la respuesta de GET /transferencias/inicio/perfil (contrato en `tipos.ts`). */
export interface PropsVistaInventario {
    datos: InventarioPerfilApi;
    /**
     * Algo cambió desde el mismo Inicio (VistaLeonardo aprueba o rechaza ahí mismo, 2026-10-23): DetalleInventario vuelve
     * a pedir estos datos y la tarjeta de arriba.
     */
    onCambio?: () => void;
}

/**
 * La pestaña «Solicitudes» de Inventario. Todos los enlaces de las vistas van a `/inventario?tab=transferencias&…`;
 * sin ella, Inventario.tsx no abre esa pestaña (cae en la primera que sí tiene) y ningún enlace lleva a lo que dice.
 */
export const PERMISO_TAB_TRANSFERENCIAS = 'inventario.tab.transferencias';
/** Ver las solicitudes de TODAS las obras (sin él, el servidor manda solo las propias y las de su bodega). */
export const PERMISO_VER_TODAS = 'inventario.transferencias.ver_todas';
export const PERMISO_APROBAR = 'inventario.transferencias.aprobar';
export const PERMISO_DIFERENCIAS_VER = 'inventario.transferencias.diferencias_ver';
/** «Pedir materiales» (el botón «Pedir» de Inventario → Solicitudes): cualquiera de los dos. */
export const PERMISOS_PEDIR = ['inventario.transferencias.solicitar', 'inventario.transferencias.solicitud_materiales'] as const;
export const PERMISO_RECIBIR = 'inventario.transferencias.recibir';
/** Lo que hace a alguien «de obra» (sin `ver_todas` ni bodega): pedir o recibir, cualquiera de los tres. */
export const PERMISOS_OBRA = [...PERMISOS_PEDIR, PERMISO_RECIBIR] as const;

/** Rol del Super Administrador (Marcos y Mauricio: programan y prueban; todo el catálogo). */
export const ROL_SUPER_ADMIN = 1;

/**
 * ¿Es Super Administrador? El MISMO criterio que el servidor (`super_admin: Number(user.rol_id) === 1` en
 * transferenciaService.inicioPerfil) y que el resto del frontend (`esSuperAdmin={user?.rol_id === 1}` en
 * TransferenciasPanel): el rol 1, no un permiso (tiene todos). `Number()` por si el rol llegara como texto.
 */
export const esSuperAdmin = (user?: { rol_id?: number | string | null } | null): boolean =>
    user?.rol_id != null && Number(user.rol_id) === ROL_SUPER_ADMIN;

/**
 * La regla, en orden (docs/reglas/inventario-transferencias.md § Inicio por perfil → «Qué vista ve cada uno»). Firme
 * ante roles armados a mano: cada vista pide la COMBINACIÓN de permisos con que funciona, no un permiso suelto.
 *   0. Super Administrador (rol 1, `esSuperAdmin`) → `superadmin`, antes que todo: tiene `aprobar` y todo lo demás,
 *      así que sin esto caería en `leonardo`. Con «Ver como» mira además las otras vistas.
 *   1. Sin la pestaña «Solicitudes» (`inventario.tab.transferencias`) → `otro`: todo enlace de las vistas abre
 *      `/inventario?tab=transferencias&…`, y sin la pestaña no lleva a nada de lo que dice.
 *   2. `ver_todas` + `aprobar` → `leonardo` (Leonardo López: `aprobar` propio de la mig 131 + rol Administrador). Su
 *      vista es la bandeja de TODAS las obras: sin `ver_todas` el servidor no le manda las pendientes ajenas.
 *   3. `ver_todas` + `diferencias_ver` → `jefatura` (Daphne Lazcano, mig 131): el circuito y las diferencias de todas.
 *   4. SIN `ver_todas`, SIN bodega asignada y con alguno de `solicitar`, `solicitud_materiales` o `recibir` → `obra`:
 *      los roles de terreno (jefes de obra, prevencionistas; «En Terreno» del RUNBOOK §16.5: solicitar + recibir). Un
 *      jefe de obra con `aprobar` (un rol hecho a mano) igual ve la suya: sin `ver_todas` no tiene la bandeja de
 *      todas, y VistaObra no aprueba nada. Un prevencionista que solo recibe, también (sin «Pedir materiales»).
 *   5. Todos los demás → `otro` (lo de producción). Aquí quedan:
 *      - los bodegueros (`usuarios.bodega_id`, mig 097): reciben lo que llega a SU bodega, no piden para una obra;
 *      - los Administradores sin aprobar ni ver diferencias (Paula, Rodrigo, Matías, Luis): ven todas las obras, pero
 *        VistaObra es «lo tuyo» y con `ver_todas` el servidor les manda lo de todos;
 *      - quien aprueba o ve diferencias sin `ver_todas` y además con bodega o sin pedir ni recibir.
 *   La obra asignada (`usuarios.obra_id`) NO decide la vista: solo pone el nombre en los textos.
 * `tiene` = `hasPermission` del AuthContext (lee los permisos del token: cambian con un nuevo inicio de sesión).
 */
export function vistaInventario(
    tiene: (permiso: string) => boolean,
    user?: { bodega_id?: number | null; rol_id?: number | string | null } | null,
): VistaInventario {
    if (esSuperAdmin(user)) return 'superadmin';
    if (!tiene(PERMISO_TAB_TRANSFERENCIAS)) return 'otro';
    const todas = tiene(PERMISO_VER_TODAS);
    if (todas && tiene(PERMISO_APROBAR)) return 'leonardo';
    if (todas && tiene(PERMISO_DIFERENCIAS_VER)) return 'jefatura';
    if (!todas && user?.bodega_id == null && PERMISOS_OBRA.some(p => tiene(p))) return 'obra';
    return 'otro';
}

/** Descripción del detalle para los demás perfiles: la de producción. */
export const DESCRIPCION_RESPALDO = 'Solicitudes que te tocan y alertas de transferencias';

/** Descripción de la vista del Super Administrador (texto del lienzo: opción A, `descripcion.superadmin`). */
export const DESCRIPCION_SUPER_ADMIN = 'Todo lo que pasa: qué tiene pendiente cada persona y quién hizo cada paso de cada solicitud.';

/**
 * La línea bajo el título «Inventario» (prop `descripcion` de DetalleModulo), con los textos del lienzo:
 * `superadmin`, `leonardo` y `obra` de la opción A, `jefatura` de la opción B. `obra` = nombre de su obra (si no se sabe, «tu obra»);
 * `aprobadores` = `datos.aprobadores` (si no hay uno o dos, «lo que espera aprobación»). `puedePedir` (solo `obra`, por
 * defecto sí): sin permiso de pedir (un prevencionista que solo recibe), la vista no ofrece «Pedir materiales» y el
 * texto no lo invita a pedir.
 */
export function descripcionInventario(
    vista: VistaInventario,
    { obra, aprobadores, puedePedir = true }: {
        obra?: string | null; aprobadores?: readonly PersonaPerfil[] | null; puedePedir?: boolean;
    } = {},
): string {
    switch (vista) {
        case 'superadmin':
            return DESCRIPCION_SUPER_ADMIN;
        case 'leonardo':
            return 'Lo que espera tu aprobación dentro del circuito completo, de la más antigua a la más nueva.';
        case 'jefatura': {
            const quien = quienAprueba(aprobadores);
            return `El camino completo de todas las obras: lo que espera ${quien ? `a ${quien}` : 'aprobación'} y las diferencias por aclarar.`;
        }
        case 'obra': {
            const enObra = obra?.trim() || 'tu obra';
            return puedePedir
                ? `Pide materiales, recibe lo que llega a ${enObra} y revisa tus aprobados.`
                : `Recibe lo que llega a ${enObra} y revisa lo que ya llegó.`;
        }
        default:
            return DESCRIPCION_RESPALDO;
    }
}
