import { esSuperAdmin } from '../dashboard/widgets/inventarioPerfil/perfil';

/**
 * Qué secciones del menú lateral ve cada persona: LA regla del Sidebar, pura y con test (`menuLateral.test.ts`).
 * La usan el Sidebar (que le pone ícono y contador a cada una) y la ficha de «Soporte · usuarios» (qué menús le
 * aparecen a una persona), así las dos dicen lo mismo. `tiene` = `hasPermission` del AuthContext (o los permisos
 * efectivos de la ficha); `user` = quién mira (solo importa el rol 1 para «Soporte»).
 */
export type ClaveMenu =
    | 'inicio' | 'asistencia' | 'gestiones' | 'inventario' | 'vehiculos' | 'obras_finalizadas'
    | 'presupuestos' | 'ayuda' | 'revisar_ideas' | 'soporte' | 'configuracion';

export interface SeccionMenu {
    clave: ClaveMenu;
    label: string;
    path: string;
}

type Tiene = (permiso: string) => boolean;
type Quien = { rol_id?: number | string | null } | null | undefined;

/**
 * Gestiones también se abre para quien solo participa de la ficha de ingreso digital (terreno u oficina) y para quien
 * porta documentos físicos (B6: el encargado de obra confirma sus lotes desde ahí). Cualquiera de estos.
 */
export const PERMISOS_MENU_GESTIONES = [
    'trabajadores.ver',
    'trabajadores.solicitud.crear',
    'trabajadores.solicitud.aprobar',
    'documentos.entrega.registrar',
    'documentos.entrega.portar',
] as const;

/** Las secciones en el orden del menú, con la condición de cada una. */
const SECCIONES: readonly (SeccionMenu & { visible: (tiene: Tiene, user: Quien) => boolean })[] = [
    { clave: 'inicio', label: 'Inicio', path: '/', visible: () => true },
    { clave: 'asistencia', label: 'Asistencia', path: '/asistencia', visible: t => t('asistencia.ver') },
    {
        clave: 'gestiones',
        label: 'Gestiones',
        // Siempre a la portada (ajuste 2026-09-15: con «lo último usado» la gente no encontraba cómo volver).
        path: '/consultas?tab=inicio',
        visible: t => PERMISOS_MENU_GESTIONES.some(p => t(p)),
    },
    { clave: 'inventario', label: 'Inventario', path: '/inventario', visible: t => t('inventario.ver') },
    { clave: 'vehiculos', label: 'Vehículos', path: '/vehiculos', visible: t => t('vehiculos.ver') },
    { clave: 'obras_finalizadas', label: 'Obras Finalizadas', path: '/obras-finalizadas', visible: t => t('obras.ver') },
    // Costos de obra (mig 122): don Luis, Rodrigo y el arquitecto, por usuario.
    { clave: 'presupuestos', label: 'Presupuestos', path: '/costos', visible: t => t('costos.gestionar') },
    { clave: 'ayuda', label: 'Ayuda', path: '/ayuda', visible: () => true },
    { clave: 'revisar_ideas', label: 'Revisar ideas', path: '/ideas', visible: t => t('ideas.revisar') },
    // Soporte · usuarios (2026-10-23): SOLO el Super Administrador (rol 1, no un permiso). Con «ver como» el rol es el
    // de la persona mirada, así que no aparece.
    { clave: 'soporte', label: 'Soporte', path: '/soporte', visible: (_t, u) => esSuperAdmin(u) },
    // Configuración aparece solo con `usuarios.ver` (ahí viven obras y feriados: mig 128 se lo dio a quienes los editan).
    { clave: 'configuracion', label: 'Configuración', path: '/configuracion', visible: t => t('usuarios.ver') },
];

/** Las secciones del menú que ve esa persona, en orden. */
export function menuVisible(tiene: Tiene, user?: Quien): SeccionMenu[] {
    return SECCIONES.filter(s => s.visible(tiene, user)).map(({ clave, label, path }) => ({ clave, label, path }));
}

/**
 * El botón «Comparte tu idea» del pie del menú: para todos MENOS quien revisa (Marcos 20-10: él y Mauricio reciben las
 * ideas, no las mandan → un solo botón, «Revisar ideas»).
 */
export const veBuzonIdeas = (tiene: Tiene): boolean => !tiene('ideas.revisar');
