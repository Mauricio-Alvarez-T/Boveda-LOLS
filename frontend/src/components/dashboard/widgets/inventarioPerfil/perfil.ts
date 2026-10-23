import { quienAprueba } from './formato';
import type { InventarioPerfilApi, PersonaPerfil } from './tipos';

/**
 * Qué vista del detalle «Inventario» del Inicio ve quien entra (Marcos 2026-10-22, del lienzo de diseño):
 *   - `superadmin` → VistaSuperAdmin (opción A, «Super Administrador»): Marcos y Mauricio (rol 1). Arriba llevan el
 *     selector «Ver como» (VerComo.tsx) para mirar también el formato de los demás: son los programadores.
 *   - `leonardo` → VistaLeonardo (opción A «Lo tuyo primero»): quien aprueba.
 *   - `jefatura` → VistaJefatura (opción B «El circuito»): ve las diferencias sin aprobar (Daphne).
 *   - `obra` → VistaObra (opción A): pide y recibe materiales para su obra (jefes de obra y prevencionistas).
 *   - `otro` → lo de producción: «Solicitudes» + «Alertas de inventario» (RespaldoInventario).
 * Lógica PURA, con test en `perfil.test.ts`.
 */
export type VistaInventario = 'superadmin' | 'leonardo' | 'jefatura' | 'obra' | 'otro';

/** Props de las vistas: la respuesta de GET /transferencias/inicio/perfil (contrato en `tipos.ts`). */
export interface PropsVistaInventario {
    datos: InventarioPerfilApi;
}

export const PERMISO_APROBAR = 'inventario.transferencias.aprobar';
export const PERMISO_DIFERENCIAS_VER = 'inventario.transferencias.diferencias_ver';
/** «Pedir materiales» (el botón «Pedir» de Inventario → Solicitudes): cualquiera de los dos. */
export const PERMISOS_PEDIR = ['inventario.transferencias.solicitar', 'inventario.transferencias.solicitud_materiales'] as const;

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
 * La regla, en orden (docs/reglas/inventario-transferencias.md § Inicio por perfil → «Qué vista ve cada uno»):
 *   0. Super Administrador (rol 1, `esSuperAdmin`) → `superadmin`, antes que todo: tiene `aprobar` y todo lo demás,
 *      así que sin esto caería en `leonardo`. Con «Ver como» mira además las otras vistas.
 *   1. `aprobar` → `leonardo`. Hoy solo Leonardo López lo tiene como permiso propio (mig 131).
 *   2. Si no, `diferencias_ver` → `jefatura` (Daphne Lazcano, permiso propio de la mig 131).
 *   3. Si no, puede pedir materiales (`solicitar` o `solicitud_materiales`) y NO tiene bodega asignada → `obra`. Son
 *      los roles de terreno (jefes de obra, prevencionistas; «En Terreno» del RUNBOOK §16.5: solicitar + recibir).
 *      Quedan fuera:
 *      - los bodegueros (`usuarios.bodega_id`, mig 097): reciben lo que llega a SU bodega, no piden para una obra;
 *      - los Administradores sin aprobar (Paula, Rodrigo, Matías, Luis): el rol (mig 126) no trae `solicitar`.
 *      La obra asignada (`usuarios.obra_id`) NO decide la vista: solo pone el nombre en los textos.
 *   4. Todos los demás → `otro` (lo de producción).
 * `tiene` = `hasPermission` del AuthContext (lee los permisos del token: cambian con un nuevo inicio de sesión).
 */
export function vistaInventario(
    tiene: (permiso: string) => boolean,
    user?: { bodega_id?: number | null; rol_id?: number | string | null } | null,
): VistaInventario {
    if (esSuperAdmin(user)) return 'superadmin';
    if (tiene(PERMISO_APROBAR)) return 'leonardo';
    if (tiene(PERMISO_DIFERENCIAS_VER)) return 'jefatura';
    if (PERMISOS_PEDIR.some(p => tiene(p)) && user?.bodega_id == null) return 'obra';
    return 'otro';
}

/** Descripción del detalle para los demás perfiles: la de producción. */
export const DESCRIPCION_RESPALDO = 'Solicitudes que te tocan y alertas de transferencias';

/** Descripción de la vista del Super Administrador (texto del lienzo: opción A, `descripcion.superadmin`). */
export const DESCRIPCION_SUPER_ADMIN = 'Todo lo que pasa: qué tiene pendiente cada persona y quién hizo cada paso de cada solicitud.';

/**
 * La línea bajo el título «Inventario» (prop `descripcion` de DetalleModulo), con los textos del lienzo:
 * `superadmin`, `leonardo` y `obra` de la opción A, `jefatura` de la opción B. `obra` = nombre de su obra (si no se sabe, «tu obra»);
 * `aprobadores` = `datos.aprobadores` (si no hay uno o dos, «lo que espera aprobación»).
 */
export function descripcionInventario(
    vista: VistaInventario,
    { obra, aprobadores }: { obra?: string | null; aprobadores?: readonly PersonaPerfil[] | null } = {},
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
        case 'obra':
            return `Pide materiales, recibe lo que llega a ${obra?.trim() || 'tu obra'} y revisa tus aprobados.`;
        default:
            return DESCRIPCION_RESPALDO;
    }
}
