/**
 * Mapeo jerárquico de claves de permisos → sección, subsección y verbo.
 *
 * **Por qué frontend:** la jerarquía visual del modal de permisos es 100% un
 * concern de UI. Mantenerla acá evita migración de backend y permite iterar
 * el layout sin tocar la API. El catálogo backend (`permisos.config.js`) sigue
 * siendo la fuente de verdad de qué permisos existen — este archivo sólo
 * decide cómo se agrupan visualmente.
 *
 * **Drift safety:** `runHierarchyDevCheck()` corre en dev mode al cargar el
 * panel y warns en consola si una clave del catálogo no tiene entrada acá.
 * Si agregas un permiso nuevo a `permisos.config.js`, también debes agregarlo
 * aquí — el panel lo mostrará en la sección "Otros" como fallback hasta que
 * se mapee correctamente.
 */

export type Verbo = 'ver' | 'crear' | 'editar' | 'eliminar' | 'aprobar' | 'enviar' | 'exportar' | 'otro';

export type Seccion =
    | 'dashboard'
    | 'asistencia'
    | 'consultas'
    | 'inventario'
    | 'vehiculos'
    | 'configuracion';

export interface HierarchyEntry {
    seccion: Seccion;
    subseccion: string;
    verbo: Verbo;
    /** Marca visual destacada: 'financiero' = 💵 amarillo, 'critico' = ⚠️ rojo. */
    sensible?: 'financiero' | 'critico';
}

export interface SeccionMeta {
    label: string;
    icon: string;
    orden: number;
    /** Orden recomendado de subsecciones (las no listadas van al final alfabético). */
    subseccionesOrden: string[];
}

export const SECCIONES_META: Record<Seccion, SeccionMeta> = {
    dashboard: {
        label: 'Dashboard',
        icon: '📊',
        orden: 1,
        subseccionesOrden: ['General'],
    },
    asistencia: {
        label: 'Asistencia',
        icon: '👥',
        orden: 2,
        subseccionesOrden: [
            'Lectura Base',
            'Períodos',
            'Horarios',
            'Feriados',
            'Sábados Extra',
            'Exportación',
            'Datos Sensibles',
        ],
    },
    consultas: {
        label: 'Consultas',
        icon: '🔍',
        orden: 3,
        subseccionesOrden: ['Documentos', 'Reportes'],
    },
    inventario: {
        label: 'Inventario',
        icon: '📦',
        orden: 4,
        subseccionesOrden: [
            'Acceso Base',
            'Tabs Visibles',
            'Transferencias',
            'Datos Sensibles',
        ],
    },
    vehiculos: {
        label: 'Vehículos',
        icon: '🚚',
        orden: 5,
        subseccionesOrden: ['Vehículos', 'Conductores'],
    },
    configuracion: {
        label: 'Configuración',
        icon: '⚙️',
        orden: 6,
        subseccionesOrden: [
            'Usuarios y Roles',
            'Trabajadores',
            'Empresas',
            'Obras',
            'Cargos',
            'Sistema',
        ],
    },
};

/**
 * Mapping de cada clave del catálogo → ubicación en árbol de UI.
 * Debe estar sincronizado con `backend/src/config/permisos.config.js`.
 */
export const PERMISO_HIERARCHY: Record<string, HierarchyEntry> = {
    // ─── ASISTENCIA ────────────────────────────────────────────────────────
    'asistencia.ver':                          { seccion: 'asistencia', subseccion: 'Lectura Base',     verbo: 'ver' },
    'asistencia.guardar':                      { seccion: 'asistencia', subseccion: 'Lectura Base',     verbo: 'editar' },
    'asistencia.tomar.global':                 { seccion: 'asistencia', subseccion: 'Lectura Base',     verbo: 'editar' },
    'asistencia.exportar_excel':               { seccion: 'asistencia', subseccion: 'Exportación',      verbo: 'exportar' },
    'asistencia.enviar_whatsapp':              { seccion: 'asistencia', subseccion: 'Exportación',      verbo: 'enviar' },
    'asistencia.periodo.ver':                  { seccion: 'asistencia', subseccion: 'Períodos',         verbo: 'ver' },
    'asistencia.periodo.crear':                { seccion: 'asistencia', subseccion: 'Períodos',         verbo: 'crear' },
    'asistencia.periodo.eliminar':             { seccion: 'asistencia', subseccion: 'Períodos',         verbo: 'eliminar' },
    'asistencia.feriado.gestionar':            { seccion: 'asistencia', subseccion: 'Feriados',         verbo: 'editar' },
    'asistencia.horarios.ver':                 { seccion: 'asistencia', subseccion: 'Horarios',         verbo: 'ver' },
    'asistencia.horarios.editar':              { seccion: 'asistencia', subseccion: 'Horarios',         verbo: 'editar' },
    'asistencia.sabados_extra.ver':            { seccion: 'asistencia', subseccion: 'Sábados Extra',    verbo: 'ver' },
    'asistencia.sabados_extra.crear':          { seccion: 'asistencia', subseccion: 'Sábados Extra',    verbo: 'crear' },
    'asistencia.sabados_extra.editar':         { seccion: 'asistencia', subseccion: 'Sábados Extra',    verbo: 'editar' },
    'asistencia.sabados_extra.cancelar':       { seccion: 'asistencia', subseccion: 'Sábados Extra',    verbo: 'eliminar' },
    'asistencia.sabados_extra.registrar':      { seccion: 'asistencia', subseccion: 'Sábados Extra',    verbo: 'editar' },
    'asistencia.sabados_extra.enviar_whatsapp':{ seccion: 'asistencia', subseccion: 'Sábados Extra',    verbo: 'enviar' },
    'asistencia.horas_extra.ver':              { seccion: 'asistencia', subseccion: 'Datos Sensibles',  verbo: 'ver', sensible: 'financiero' },

    // ─── CONSULTAS ─────────────────────────────────────────────────────────
    'documentos.ver':                          { seccion: 'consultas', subseccion: 'Documentos', verbo: 'ver' },
    'documentos.subir':                        { seccion: 'consultas', subseccion: 'Documentos', verbo: 'crear' },
    'documentos.descargar':                    { seccion: 'consultas', subseccion: 'Documentos', verbo: 'exportar' },
    'documentos.eliminar':                     { seccion: 'consultas', subseccion: 'Documentos', verbo: 'eliminar' },
    'reportes.ver':                            { seccion: 'consultas', subseccion: 'Reportes',   verbo: 'ver' },
    'reportes.exportar':                       { seccion: 'consultas', subseccion: 'Reportes',   verbo: 'exportar' },
    'reportes.enviar_email':                   { seccion: 'consultas', subseccion: 'Reportes',   verbo: 'enviar' },

    // ─── INVENTARIO ────────────────────────────────────────────────────────
    'inventario.ver':                          { seccion: 'inventario', subseccion: 'Acceso Base',     verbo: 'ver' },
    'inventario.crear':                        { seccion: 'inventario', subseccion: 'Acceso Base',     verbo: 'crear' },
    'inventario.editar':                       { seccion: 'inventario', subseccion: 'Acceso Base',     verbo: 'editar' },
    'inventario.aprobar':                      { seccion: 'inventario', subseccion: 'Acceso Base',     verbo: 'aprobar' },
    'inventario.eliminar':                     { seccion: 'inventario', subseccion: 'Acceso Base',     verbo: 'eliminar' },
    'inventario.tab.resumen_ejecutivo':        { seccion: 'inventario', subseccion: 'Tabs Visibles',   verbo: 'ver' },
    'inventario.tab.resumen':                  { seccion: 'inventario', subseccion: 'Tabs Visibles',   verbo: 'ver' },
    'inventario.tab.por_ubicacion':            { seccion: 'inventario', subseccion: 'Tabs Visibles',   verbo: 'ver' },
    'inventario.tab.transferencias':           { seccion: 'inventario', subseccion: 'Tabs Visibles',   verbo: 'ver' },
    'inventario.tab.maestro':                  { seccion: 'inventario', subseccion: 'Tabs Visibles',   verbo: 'ver' },
    'inventario.tab.bombas':                   { seccion: 'inventario', subseccion: 'Tabs Visibles',   verbo: 'ver' },
    'inventario.transferencias.ver_todas':     { seccion: 'inventario', subseccion: 'Transferencias',  verbo: 'ver' },
    'inventario.transferencias.solicitar':     { seccion: 'inventario', subseccion: 'Transferencias',  verbo: 'crear' },
    'inventario.transferencias.solicitud_materiales': { seccion: 'inventario', subseccion: 'Transferencias', verbo: 'crear' },
    'inventario.transferencias.aprobar':       { seccion: 'inventario', subseccion: 'Transferencias',  verbo: 'aprobar' },
    'inventario.transferencias.despachar':     { seccion: 'inventario', subseccion: 'Transferencias',  verbo: 'editar' },
    'inventario.transferencias.recibir':       { seccion: 'inventario', subseccion: 'Transferencias',  verbo: 'editar' },
    'inventario.transferencias.cancelar':      { seccion: 'inventario', subseccion: 'Transferencias',  verbo: 'eliminar' },
    'inventario.transferencias.cancelar_en_transito': { seccion: 'inventario', subseccion: 'Transferencias', verbo: 'eliminar', sensible: 'critico' },
    'inventario.transferencias.push_directo':  { seccion: 'inventario', subseccion: 'Transferencias',  verbo: 'editar',  sensible: 'critico' },
    'inventario.transferencias.intra_bodega':  { seccion: 'inventario', subseccion: 'Transferencias',  verbo: 'editar',  sensible: 'critico' },
    'inventario.transferencias.orden_gerencia':{ seccion: 'inventario', subseccion: 'Transferencias',  verbo: 'aprobar', sensible: 'critico' },
    'inventario.transferencias.sod_bypass':    { seccion: 'inventario', subseccion: 'Transferencias',  verbo: 'otro',    sensible: 'critico' },
    'inventario.costos.ver':                   { seccion: 'inventario', subseccion: 'Datos Sensibles', verbo: 'ver',    sensible: 'financiero' },
    'inventario.costos.editar':                { seccion: 'inventario', subseccion: 'Datos Sensibles', verbo: 'editar', sensible: 'financiero' },
    'inventario.facturas.ver':                 { seccion: 'inventario', subseccion: 'Datos Sensibles', verbo: 'ver',    sensible: 'financiero' },
    'inventario.facturas.gestionar':           { seccion: 'inventario', subseccion: 'Datos Sensibles', verbo: 'editar', sensible: 'financiero' },
    'inventario.bombas.ver_costos':            { seccion: 'inventario', subseccion: 'Datos Sensibles', verbo: 'ver',    sensible: 'financiero' },
    'inventario.descuentos.gestionar':         { seccion: 'inventario', subseccion: 'Datos Sensibles', verbo: 'editar', sensible: 'financiero' },
    'inventario.resumen.ver_valores':          { seccion: 'inventario', subseccion: 'Datos Sensibles', verbo: 'ver',    sensible: 'financiero' },

    // ─── VEHÍCULOS ─────────────────────────────────────────────────────────
    'vehiculos.ver':                           { seccion: 'vehiculos', subseccion: 'Vehículos',   verbo: 'ver' },
    'vehiculos.crear':                         { seccion: 'vehiculos', subseccion: 'Vehículos',   verbo: 'crear' },
    'vehiculos.editar':                        { seccion: 'vehiculos', subseccion: 'Vehículos',   verbo: 'editar' },
    'vehiculos.eliminar':                      { seccion: 'vehiculos', subseccion: 'Vehículos',   verbo: 'eliminar' },
    'conductores.ver':                         { seccion: 'vehiculos', subseccion: 'Conductores', verbo: 'ver' },
    'conductores.crear':                       { seccion: 'vehiculos', subseccion: 'Conductores', verbo: 'crear' },
    'conductores.editar':                      { seccion: 'vehiculos', subseccion: 'Conductores', verbo: 'editar' },
    'conductores.eliminar':                    { seccion: 'vehiculos', subseccion: 'Conductores', verbo: 'eliminar' },

    // ─── CONFIGURACIÓN ─────────────────────────────────────────────────────
    // Usuarios y Roles (incluye perms críticos ⚠️)
    'usuarios.ver':                            { seccion: 'configuracion', subseccion: 'Usuarios y Roles', verbo: 'ver' },
    'usuarios.crear':                          { seccion: 'configuracion', subseccion: 'Usuarios y Roles', verbo: 'crear' },
    'usuarios.editar':                         { seccion: 'configuracion', subseccion: 'Usuarios y Roles', verbo: 'editar' },
    'usuarios.eliminar':                       { seccion: 'configuracion', subseccion: 'Usuarios y Roles', verbo: 'eliminar', sensible: 'critico' },
    'usuarios.roles.ver':                      { seccion: 'configuracion', subseccion: 'Usuarios y Roles', verbo: 'ver' },
    'usuarios.roles.crear':                    { seccion: 'configuracion', subseccion: 'Usuarios y Roles', verbo: 'crear' },
    'usuarios.roles.editar':                   { seccion: 'configuracion', subseccion: 'Usuarios y Roles', verbo: 'editar' },
    'usuarios.roles.eliminar':                 { seccion: 'configuracion', subseccion: 'Usuarios y Roles', verbo: 'eliminar', sensible: 'critico' },
    'usuarios.permisos.gestionar':             { seccion: 'configuracion', subseccion: 'Usuarios y Roles', verbo: 'editar', sensible: 'critico' },

    // Trabajadores (incluye 💵 financiero)
    'trabajadores.ver':                        { seccion: 'configuracion', subseccion: 'Trabajadores', verbo: 'ver' },
    'trabajadores.crear':                      { seccion: 'configuracion', subseccion: 'Trabajadores', verbo: 'crear' },
    'trabajadores.editar':                     { seccion: 'configuracion', subseccion: 'Trabajadores', verbo: 'editar' },
    'trabajadores.eliminar':                   { seccion: 'configuracion', subseccion: 'Trabajadores', verbo: 'eliminar' },
    'trabajadores.reactivar':                  { seccion: 'configuracion', subseccion: 'Trabajadores', verbo: 'editar' },
    'trabajadores.depurar':                    { seccion: 'configuracion', subseccion: 'Trabajadores', verbo: 'eliminar', sensible: 'critico' },
    'trabajadores.financiero.ver':             { seccion: 'configuracion', subseccion: 'Trabajadores', verbo: 'ver',    sensible: 'financiero' },
    'trabajadores.financiero.editar':          { seccion: 'configuracion', subseccion: 'Trabajadores', verbo: 'editar', sensible: 'financiero' },

    // Empresas
    'empresas.ver':                            { seccion: 'configuracion', subseccion: 'Empresas', verbo: 'ver' },
    'empresas.crear':                          { seccion: 'configuracion', subseccion: 'Empresas', verbo: 'crear' },
    'empresas.editar':                         { seccion: 'configuracion', subseccion: 'Empresas', verbo: 'editar' },
    'empresas.eliminar':                       { seccion: 'configuracion', subseccion: 'Empresas', verbo: 'eliminar' },

    // Obras
    'obras.ver':                               { seccion: 'configuracion', subseccion: 'Obras', verbo: 'ver' },
    'obras.crear':                             { seccion: 'configuracion', subseccion: 'Obras', verbo: 'crear' },
    'obras.editar':                            { seccion: 'configuracion', subseccion: 'Obras', verbo: 'editar' },
    'obras.eliminar':                          { seccion: 'configuracion', subseccion: 'Obras', verbo: 'eliminar' },
    'obras.finalizar':                         { seccion: 'configuracion', subseccion: 'Obras', verbo: 'editar' },

    // Cargos
    'cargos.ver':                              { seccion: 'configuracion', subseccion: 'Cargos', verbo: 'ver' },
    'cargos.crear':                            { seccion: 'configuracion', subseccion: 'Cargos', verbo: 'crear' },
    'cargos.editar':                           { seccion: 'configuracion', subseccion: 'Cargos', verbo: 'editar' },
    'cargos.eliminar':                         { seccion: 'configuracion', subseccion: 'Cargos', verbo: 'eliminar' },

    // Sistema (incluye ⚠️ críticos)
    'sistema.logs.ver':                        { seccion: 'configuracion', subseccion: 'Sistema', verbo: 'ver' },
    'sistema.email.configurar':                { seccion: 'configuracion', subseccion: 'Sistema', verbo: 'editar', sensible: 'critico' },
    'sistema.plantillas.gestionar':            { seccion: 'configuracion', subseccion: 'Sistema', verbo: 'editar' },
    'sistema.tipos_doc.gestionar':             { seccion: 'configuracion', subseccion: 'Sistema', verbo: 'editar' },
    'sistema.estados.gestionar':               { seccion: 'configuracion', subseccion: 'Sistema', verbo: 'editar', sensible: 'critico' },
    'sistema.tipos_ausencia.gestionar':        { seccion: 'configuracion', subseccion: 'Sistema', verbo: 'editar' },
    'sistema.reportes.gestionar':              { seccion: 'configuracion', subseccion: 'Sistema', verbo: 'editar' },
};

/** Sección por defecto cuando ninguna específica está activa. */
export const DEFAULT_SECCION: Seccion = 'inventario';

/** Etiqueta para claves no mapeadas (fallback safety). */
export const FALLBACK_ENTRY: HierarchyEntry = {
    seccion: 'configuracion',
    subseccion: 'Otros',
    verbo: 'otro',
};

/**
 * Dev-only check: warna en consola si el catálogo backend tiene claves
 * no presentes en `PERMISO_HIERARCHY`. Llamar una sola vez al montar el
 * editor de permisos. Sin efecto en producción.
 */
export function runHierarchyDevCheck(catalogoClaves: string[]): void {
    if (import.meta.env.PROD) return;
    const missing = catalogoClaves.filter(c => !(c in PERMISO_HIERARCHY));
    if (missing.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
            `[permisosHierarchy] ${missing.length} clave(s) del catálogo backend sin mapping en PERMISO_HIERARCHY:`,
            missing,
            '\nSe mostrarán en "Configuración → Otros" como fallback. Agrega entradas en frontend/src/config/permisosHierarchy.ts.'
        );
    }
}
